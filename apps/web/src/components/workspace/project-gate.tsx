import { useSearch } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { FolderOpen } from "lucide-react"
import { useEffect, useState } from "react"

import { ProjectContext } from "@/lib/project/hooks"
import { useFolder, useRecent } from "@/lib/project/open"
import { Header } from "./header"
import { Workspace } from "./workspace"

/**
 * One page, like an editor window: the workspace is always there, and the folder in it is the
 * `p` search param (`?p=/abs/path`), so a review can be bookmarked or opened from the terminal.
 * With no folder the workspace is empty and offers to open one.
 */
export function ProjectGate() {
  const { p } = useSearch({ from: "/" })
  useOpenShortcut()
  if (p) {
    return (
      <ProjectContext.Provider value={p}>
        {/* Keyed by folder: no player or selection state carries over between projects. */}
        <Workspace key={p} />
      </ProjectContext.Provider>
    )
  }
  return (
    <div className="flex min-h-dvh flex-col bg-background text-sm">
      <Header />
      <Welcome />
    </div>
  )
}

/** ⌘O / Ctrl+O opens a folder from anywhere, instead of the browser's own file dialog. */
function useOpenShortcut() {
  const { pick } = useFolder()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "o") return
      event.preventDefault()
      void pick()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
}

/** The empty workspace: open a folder, reopen a recent one, or paste a path. */
function Welcome() {
  const { open, pick } = useFolder()
  const recent = useRecent()
  const [path, setPath] = useState("")

  return (
    <main className="flex flex-1 items-center px-6 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">没有打开的文件夹</h1>
          <p className="text-muted-foreground">
            打开 Claude Code 剪片的项目文件夹，在这里审片、写评论、对比版本。
          </p>
        </div>

        {recent.isError ? (
          <p className="text-muted-foreground">
            无法连接本地服务。在 Cutroom 仓库运行 pnpm dev 后刷新页面。
          </p>
        ) : (
          <>
            <Button className="self-start" onClick={() => void pick()}>
              <FolderOpen data-icon="inline-start" />
              打开文件夹…
            </Button>

            {(recent.data?.length ?? 0) > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-medium text-muted-foreground">最近打开</h2>
                <ul className="-mx-2 flex flex-col">
                  {recent.data!.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => void open(r)}
                        className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                      >
                        <span className="shrink-0 font-medium">{r.split("/").pop()}</span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void open(path)
              }}
            >
              <label htmlFor="project-path" className="text-xs font-medium text-muted-foreground">
                或粘贴文件夹路径
              </label>
              <div className="flex gap-2">
                <Input
                  id="project-path"
                  value={path}
                  placeholder="/Users/you/Videos/my-cut"
                  onChange={(e) => setPath(e.target.value)}
                />
                <Button type="submit" variant="secondary" disabled={!path.trim()}>
                  打开
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
