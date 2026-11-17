import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useState } from "react"

import { api, unwrap } from "@/lib/api"
import { ProjectContext } from "@/lib/project/hooks"
import { Workspace } from "./workspace"

/**
 * The project is part of the URL (`?p=/abs/path`), so a review can be bookmarked or opened from
 * the terminal. Without one, pick a recent project or paste a folder path.
 */
export function ProjectGate() {
  const { p } = useSearch({ from: "/" })
  if (p) {
    return (
      <ProjectContext.Provider value={p}>
        {/* Keyed by folder: no player or selection state carries over between projects. */}
        <Workspace key={p} />
      </ProjectContext.Provider>
    )
  }
  return <OpenProject />
}

function OpenProject() {
  const navigate = useNavigate({ from: "/" })
  const recent = useQuery({ queryKey: ["recent"], queryFn: () => unwrap(api.recent.get()) })
  const [path, setPath] = useState("")
  const [error, setError] = useState<string>()

  const open = async (target: string) => {
    setError(undefined)
    try {
      const project = await unwrap(api.open.post({ path: target.trim() }))
      await navigate({ search: { p: project.path } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="flex min-h-dvh items-center bg-background px-6">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-balance">Cutroom</h1>
          <p className="text-sm text-muted-foreground">
            打开一个视频项目文件夹，看片、评论、确认计划、比较版本。
          </p>
        </div>

        {recent.isError ? (
          <p className="text-sm text-muted-foreground">
            连不上本地服务。在仓库里运行 pnpm dev，再刷新这个页面。
          </p>
        ) : (
          <>
            {(recent.data?.length ?? 0) > 0 && (
              <ul className="-mx-2 flex flex-col">
                {recent.data!.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => void open(r)}
                      className="flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="text-sm font-medium">{r.split("/").pop()}</span>
                      <span className="truncate text-xs text-muted-foreground">{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void open(path)
              }}
            >
              <label htmlFor="project-path" className="text-sm font-medium">
                文件夹路径
              </label>
              <div className="flex gap-2">
                <Input
                  id="project-path"
                  value={path}
                  placeholder="/Users/you/Videos/my-cut"
                  aria-invalid={!!error}
                  onChange={(e) => setPath(e.target.value)}
                />
                <Button type="submit" disabled={!path.trim()}>
                  打开
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">在项目文件夹里运行 pwd 可以拿到路径。</p>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
