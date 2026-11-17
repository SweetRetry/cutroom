import { useNavigate, useSearch } from "@tanstack/react-router"
import { commentView, roundPhase, unplanned, type CommentView } from "@workspace/core/review/state"
import { diffTimelines } from "@workspace/core/timeline/diff"
import { useMemo } from "react"
import type { Version } from "server/app"

import { useProjectData, useTimeline } from "../project/hooks"

/**
 * Everything the workspace shows, derived from the service and the URL. Comments can only be
 * written on the current version: older ones are history to look at, compare and return to.
 */
export function useSession() {
  const search = useSearch({ from: "/" })
  const project = useProjectData()

  const graph = project.data?.graph ?? undefined
  const current = graph?.current
  const viewing = (search.v && graph?.versions.find((v) => v.name === search.v)) || current
  const comparing = search.compare
    ? graph?.versions.find((v) => v.name === search.compare)
    : undefined
  const editable = !!viewing && viewing.oid === current?.oid
  // What the viewed version was cut from: the start of the round that produced it, else the
  // version numbered just before it. The natural thing to compare against.
  const baseName =
    viewing && project.data?.agent.rounds.find((r) => r.result === viewing.name)?.version
  const base =
    graph?.versions.find((v) => v.name === baseName) ??
    graph?.versions
      .filter((v) => viewing && v.n < viewing.n)
      .reduce<Version | undefined>((best, v) => (!best || v.n > best.n ? v : best), undefined)

  const timeline = useTimeline(viewing)
  const compareTimeline = useTimeline(comparing)

  const files = project.data
  const derived = useMemo(() => {
    if (!files || !viewing) return undefined
    const { comments, agent } = files
    const views = (version: string): CommentView[] =>
      comments.comments
        .filter((c) => c.version === version)
        .map((c) => commentView(c, comments.rounds, agent))
    const previous = current && agent.rounds.find((r) => r.result === current.name)?.version
    return {
      phase: roundPhase(viewing.name, comments, agent),
      comments: views(viewing.name),
      unplanned: unplanned(viewing.name, comments, agent),
      findings: agent.findings.filter(
        (f) => f.version === viewing.name && !comments.dismissed.includes(f.id)
      ),
      previous: editable && previous ? { version: previous, comments: views(previous) } : undefined,
    }
  }, [files, viewing, current, editable])

  const diff = useMemo(
    () =>
      timeline.data && compareTimeline.data
        ? diffTimelines(compareTimeline.data, timeline.data)
        : undefined,
    [timeline.data, compareTimeline.data]
  )

  return {
    loading: project.isPending,
    error: project.error ?? timeline.error ?? compareTimeline.error,
    /** Null when the folder isn't its own git repository yet. */
    graph,
    hasRepo: project.data?.graph !== null,
    current,
    viewing,
    comparing,
    base,
    editable,
    timeline: timeline.data ?? undefined,
    timelinePending: !!viewing && timeline.isPending,
    files,
    diff,
    ...derived,
  }
}

export function useViewNavigation() {
  const navigate = useNavigate({ from: "/" })
  return {
    view: (v: string | undefined) => navigate({ search: (s) => ({ ...s, v }) }),
    compare: (compare: string | undefined) => navigate({ search: (s) => ({ ...s, compare }) }),
  }
}

export type Session = ReturnType<typeof useSession>
