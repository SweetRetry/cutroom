import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableLayout,
} from "@workspace/ui/components/resizable"
import { useMediaQuery } from "@workspace/ui/hooks/use-media-query"
import { useEffect } from "react"

import { useProjectEvents } from "@/lib/project/hooks"
import { useSession, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { Stage } from "../player/stage"
import { ReviewPanel } from "../review/review-panel"
import { AssetViewer } from "../sidebar/asset-viewer"
import { Sidebar } from "../sidebar/sidebar"
import { Timeline } from "../timeline/timeline"
import { Header } from "./header"

export function Workspace() {
  const session = useSession()
  useProjectEvents()
  useShortcuts(session)

  const wide = useMediaQuery("(min-width: 64rem)")
  const layout = useResizableLayout({ id: "cutroom-workspace" })

  if (session.error || session.loading || !session.current)
    return (
      <div className="flex min-h-dvh flex-col bg-background text-sm">
        <Header session={session} />
        {session.error ? <Problem error={session.error} /> : session.loading ? null : <FirstRun />}
      </div>
    )

  // DOM order is task order (watch, pick a place, comment, browse versions): narrow screens
  // read it as one scrolling column, wide screens place it as a fixed-height editor.
  const editor = (
    <div className="contents lg:grid lg:h-full lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto] xl:grid-cols-[19rem_minmax(0,1fr)]">
      <Header session={session} className="lg:col-span-2" />
      <Stage session={session} className="lg:col-start-2 lg:row-start-2" />
      <Timeline session={session} className="lg:col-span-2 lg:row-start-3" />
      <Sidebar session={session} className="max-lg:order-last lg:col-start-1 lg:row-start-2" />
    </div>
  )
  const review = <ReviewPanel session={session} className="lg:h-full" />
  const viewer = (
    <AssetViewer canQuote={session.editable && !!session.phase && session.phase.kind !== "done"} />
  )

  if (!wide)
    return (
      <div className="flex min-h-dvh flex-col bg-background text-sm">
        {editor}
        {review}
        {viewer}
      </div>
    )

  // The conversation runs the full height on the right, like a chat beside the editor. Its
  // width is the reviewer's: dragged at the seam, kept across reloads, and held in pixels when
  // the window resizes, so the video takes the change.
  return (
    <div className="h-dvh bg-background text-sm">
      <ResizablePanelGroup
        id="cutroom-workspace"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="editor" minSize="36rem">
          {editor}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          id="review"
          defaultSize="22rem"
          minSize="18rem"
          maxSize="40rem"
          groupResizeBehavior="preserve-pixel-size"
        >
          {review}
        </ResizablePanel>
      </ResizablePanelGroup>
      {viewer}
    </div>
  )
}

function Problem({ error }: { error: Error }) {
  return (
    <main className="flex flex-col gap-2 px-6 py-12">
      <h2 className="text-xl font-semibold">无法读取项目</h2>
      <p className="max-w-2xl text-muted-foreground">{error.message}</p>
      <p className="max-w-2xl text-muted-foreground">修复后页面自动重新读取。</p>
    </main>
  )
}

/** A folder Claude Code hasn't cut yet. The first `cutroom review` it runs fills this page. */
function FirstRun() {
  return (
    <main className="flex flex-col gap-8 px-6 py-12">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-xl font-semibold">暂无版本</h2>
        <p className="text-muted-foreground">
          在 Claude Code 中说明素材位置和成片要求。第一版渲染后，此页自动刷新。
        </p>
      </div>
    </main>
  )
}

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
