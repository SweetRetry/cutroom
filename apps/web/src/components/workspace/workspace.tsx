import { Button } from "@workspace/ui/components/button"
import { useEffect } from "react"
import { toast } from "sonner"

import { api, unwrap } from "@/lib/api"
import { useProjectEvents, useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useSession, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { Stage } from "../player/stage"
import { ReviewPanel } from "../review/review-panel"
import { Sidebar } from "../sidebar/sidebar"
import { Timeline } from "../timeline/timeline"
import { Header } from "./header"

export function Workspace() {
  const session = useSession()
  useProjectEvents()
  useShortcuts(session)

  return (
    // DOM order is task order (watch, pick a place, comment, browse versions): narrow screens
    // read it as one scrolling column, wide screens place it as a fixed-height editor.
    <div className="flex min-h-dvh flex-col bg-background text-sm lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[14rem_minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)_auto] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
      <Header session={session} className="lg:col-span-3" />
      {session.error ? (
        <Problem error={session.error} />
      ) : session.loading ? null : !session.files?.initialized || !session.current ? (
        <FirstRun session={session} />
      ) : (
        <>
          <Stage session={session} className="lg:col-start-2 lg:row-start-2" />
          <Timeline session={session} className="lg:col-span-3 lg:row-start-3" />
          <ReviewPanel session={session} className="lg:col-start-3 lg:row-start-2" />
          <Sidebar session={session} className="lg:col-start-1 lg:row-start-2" />
        </>
      )}
    </div>
  )
}

function Problem({ error }: { error: Error }) {
  return (
    <main className="flex flex-col gap-2 px-6 py-12 lg:col-span-3">
      <h2 className="text-xl font-semibold">读不了这个项目</h2>
      <p className="max-w-2xl text-muted-foreground">{error.message}</p>
      <p className="max-w-2xl text-muted-foreground">修好之后页面会自动重新读取。</p>
    </main>
  )
}

/** A folder without conventions, or a project Claude Code hasn't cut yet. */
function FirstRun({ session }: { session: Session }) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const initialized = !!session.files?.initialized && session.hasRepo

  const init = async () => {
    try {
      await unwrap(api.init.post({ p }))
      await refresh()
      toast.success("已写入 CLAUDE.md、.gitignore 和 review/，并初始化 git")
    } catch (error) {
      toast.error("没能初始化", { description: error instanceof Error ? error.message : undefined })
    }
  }

  return (
    <main className="flex flex-col gap-8 px-6 py-12 lg:col-span-3">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-xl font-semibold">
          {initialized ? "还没有第一版" : "这个文件夹还没有项目约定"}
        </h2>
        <p className="text-muted-foreground">
          {initialized
            ? "版本来自 git 里以 v1:、v2: 开头的提交，出了第一版这里会自动刷新。"
            : "写入 CLAUDE.md 并初始化 git。剪辑的一方读它就知道怎么通过 Cutroom 交付版本。已有的文件不会被覆盖。"}
        </p>
      </div>
      {initialized ? (
        <ol className="flex max-w-2xl list-decimal flex-col gap-2 pl-5 text-muted-foreground">
          <li>把视频、图片和要用的音乐放进 media/user/。</li>
          <li>
            连上 Cutroom 的 MCP（只需一次）：
            <code className="ml-1 font-mono text-xs text-foreground">{MCP_ADD}</code>
          </li>
          <li>在这个文件夹里开始剪辑，用一两句话说想要什么样的成片。</li>
          <li>它渲染并提交 v1 后，这里会自动刷新。</li>
        </ol>
      ) : (
        <Button className="self-start" onClick={() => void init()}>
          写入项目约定
        </Button>
      )}
    </main>
  )
}

const MCP_ADD = `claude mcp add --scope user --transport http cutroom ${window.location.origin}/mcp`

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

function useShortcuts(session: Session) {
  const fps = session.timeline?.fps ?? 30
  const editable = session.editable

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const ui = useReviewUi.getState()
      switch (event.key) {
        case " ":
          ui.toggle()
          break
        case "ArrowLeft":
        case "ArrowRight": {
          const step = event.shiftKey ? 1 : 1 / fps
          ui.video?.pause()
          ui.seek(ui.time + (event.key === "ArrowLeft" ? -step : step))
          break
        }
        case "m":
        case "M":
          if (!editable) return
          ui.video?.pause()
          ui.setAnchor({ kind: "point", time: { start: ui.time, end: ui.time } }, true)
          break
        case "b":
        case "B":
          if (!editable) return
          ui.setDrawing(!ui.drawing)
          break
        case "Escape":
          if (ui.drawing) ui.setDrawing(false)
          else ui.setAnchor(null)
          break
        case "=":
        case "+":
          ui.setZoom(ui.zoom * 1.25)
          break
        case "-":
          ui.setZoom(ui.zoom / 1.25)
          break
        case "0":
          ui.fit()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fps, editable])
}
