import { watch, type FSWatcher } from "node:fs"

import type { Project } from "./project"

/**
 * Tells open pages what changed in a project folder, so they refetch only that. Claude Code may
 * also write files directly; watching the folder catches both paths.
 */
type ChangeKind = "versions" | "working" | "media"

function classify(rel: string): ChangeKind | undefined {
  if (rel.endsWith(".tmp")) return undefined
  if (rel.startsWith(".git/")) {
    return rel === ".git/HEAD" || rel.startsWith(".git/refs/") || rel === ".git/packed-refs"
      ? "versions"
      : undefined
  }
  if (rel.startsWith("renders/") || rel.startsWith("media/")) return "media"
  if (
    rel.startsWith("review/") ||
    rel === "assets.json" ||
    rel === "timeline.json" ||
    rel === "CLAUDE.md"
  ) {
    return "working"
  }
  return undefined
}

type Watch = { watcher: FSWatcher; listeners: Set<(kind: ChangeKind) => void> }
const watches = new Map<string, Watch>()

function subscribe(project: Project, listener: (kind: ChangeKind) => void) {
  let entry = watches.get(project.root)
  if (!entry) {
    const listeners = new Set<(kind: ChangeKind) => void>()
    const pending = new Map<ChangeKind, Timer>()
    const watcher = watch(project.root, { recursive: true }, (_event, name) => {
      const kind = name && classify(name.split("\\").join("/"))
      if (!kind || pending.has(kind)) return
      // Bursts (a git commit touches many files) arrive as one event per kind.
      pending.set(
        kind,
        setTimeout(() => {
          pending.delete(kind)
          for (const l of listeners) l(kind)
        }, 150)
      )
    })
    watches.set(project.root, (entry = { watcher, listeners }))
  }
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      entry.watcher.close()
      watches.delete(project.root)
    }
  }
}

export function eventStream(project: Project, signal: AbortSignal): Response {
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text))
      send(": connected\n\n")
      const unsubscribe = subscribe(project, (kind) => send(`data: ${kind}\n\n`))
      const ping = setInterval(() => send(": ping\n\n"), 20_000)
      cleanup = () => {
        clearInterval(ping)
        unsubscribe()
      }
      signal.addEventListener("abort", () => {
        cleanup()
        controller.close()
      })
    },
    cancel: () => cleanup(),
  })
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}
