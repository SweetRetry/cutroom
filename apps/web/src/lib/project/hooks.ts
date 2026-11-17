import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Asset } from "@workspace/core/schema"
import { createContext, useContext, useEffect, useMemo } from "react"
import { toast } from "sonner"
import type { Version } from "server/app"

import { api, mediaUrl, unwrap } from "../api"

/** The open project's absolute path; every request names it. */
export const ProjectContext = createContext<string | null>(null)

export function useProjectPath(): string {
  const path = useContext(ProjectContext)
  if (!path) throw new Error("useProjectPath outside a project")
  return path
}

export function useProjectData() {
  const p = useProjectPath()
  return useQuery({
    queryKey: ["project", p],
    queryFn: () => unwrap(api.project.get({ query: { p } })),
  })
}

export function useAssets(): Map<string, Asset> {
  const { data } = useProjectData()
  return useMemo(() => new Map((data?.assets.assets ?? []).map((a) => [a.id, a])), [data?.assets])
}

export function useTimeline(version: Version | undefined) {
  const p = useProjectPath()
  return useQuery({
    queryKey: ["timeline", p, version?.oid],
    queryFn: () => unwrap(api.timeline.get({ query: { p, oid: version!.oid } })),
    enabled: !!version,
    // A commit never changes.
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/**
 * The URL of a project file, or undefined while it doesn't exist (a render Claude Code hasn't
 * finished). The change feed rechecks when anything under media/ or renders/ changes.
 */
export function useMediaUrl(file: string | undefined): string | undefined {
  const p = useProjectPath()
  const exists = useQuery({
    queryKey: ["exists", p, file],
    queryFn: async () => (await fetch(mediaUrl(p, file!), { headers: { range: "bytes=0-0" } })).ok,
    enabled: !!file,
  }).data
  return file && exists ? mediaUrl(p, file) : undefined
}

export function usePeaks(file: string | undefined) {
  const p = useProjectPath()
  return useQuery({
    queryKey: ["peaks", p, file],
    queryFn: () => unwrap(api.peaks.get({ query: { p, file: file! } })),
    enabled: !!file,
    staleTime: Number.POSITIVE_INFINITY,
  }).data
}

/**
 * Listens to the service's change feed and refetches what changed. Claude Code writes from the
 * terminal; this is how the page notices without polling.
 */
export function useProjectEvents() {
  const p = useProjectPath()
  const client = useQueryClient()
  useEffect(() => {
    const source = new EventSource(`/api/events?${new URLSearchParams({ p })}`)
    source.onmessage = ({ data }) => {
      if (data === "media") void client.invalidateQueries({ queryKey: ["exists", p] })
      else void client.invalidateQueries({ queryKey: ["project", p] })
    }
    return () => source.close()
  }, [p, client])
}

/** After a write: refetch the project so the page shows what the service stored. */
export function useRefresh() {
  const p = useProjectPath()
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ["project", p] })
}

/**
 * Runs a reviewer action against the service. A refusal (wrong phase, stale plan) shows the
 * service's own reason; either way the page then shows what is actually stored.
 */
export function useAction() {
  const refresh = useRefresh()
  return async <T>(work: () => Promise<T>, failure: string): Promise<T | undefined> => {
    try {
      return await work()
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : undefined })
      return undefined
    } finally {
      await refresh()
    }
  }
}
