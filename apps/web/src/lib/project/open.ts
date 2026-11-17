import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { api, unwrap } from "../api"

/** Folders opened before, newest first; the service drops ones that no longer exist. */
export function useRecent() {
  return useQuery({ queryKey: ["recent"], queryFn: () => unwrap(api.recent.get()) })
}

/**
 * Opening and closing the workspace's folder. The folder is the `p` search param, so opening
 * one is a navigation and the back button returns to the previous project.
 */
export function useFolder() {
  const navigate = useNavigate({ from: "/" })
  const queries = useQueryClient()

  const open = async (path: string) => {
    try {
      const project = await unwrap(api.open.post({ path: path.trim() }))
      void queries.invalidateQueries({ queryKey: ["recent"] })
      await navigate({ search: { p: project.path } })
      return true
    } catch (error) {
      toast.error("打不开这个文件夹", {
        description: error instanceof Error ? error.message : undefined,
      })
      return false
    }
  }

  /** The system's folder window, shown by the local service; cancelling does nothing. */
  const pick = async () => {
    try {
      const { path } = await unwrap(api.pick.post())
      if (path) await open(path)
    } catch (error) {
      toast.error("没能打开选择窗口", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const close = () => navigate({ search: {} })

  return { open, pick, close }
}
