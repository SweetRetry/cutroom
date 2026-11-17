import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { useMediaUrl } from "@/lib/project/hooks"
import type { Region } from "@workspace/core/schema"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"

/**
 * One preview video. The leading player drives the shared clock; a follower (the older side of a
 * comparison) chases it, so both sides always show the same moment of the cut.
 */
export function Player({
  path,
  session,
  follower = false,
}: {
  path: string
  session: Session
  follower?: boolean
}) {
  const url = useMediaUrl(path)
  const ref = useRef<HTMLVideoElement>(null)
  const [box, setBox] = useState<DOMRect>()

  useLeader(ref, url, !follower)
  useFollower(ref, url, follower)
  useContentBox(ref, url, setBox)

  // The box takes the cut's shape, so captions and the placeholder sit on the frame's edges
  // instead of on letterbox bars.
  const aspectRatio = `${session.timeline?.width ?? 16} / ${session.timeline?.height ?? 9}`

  if (!url) {
    return (
      <div
        className="flex max-h-full w-full items-center justify-center rounded-md bg-surface-1 px-4 text-center text-muted-foreground"
        style={{ aspectRatio }}
      >
        {path} 尚未渲染
      </div>
    )
  }

  return (
    <div className="relative max-h-full w-full" style={{ aspectRatio }}>
      <video
        ref={ref}
        src={url}
        className="absolute inset-0 size-full object-contain"
        muted={follower}
        playsInline
        preload="auto"
      />
      {!follower && box && <RegionLayer box={box} session={session} />}
    </div>
  )
}

function useLeader(
  ref: React.RefObject<HTMLVideoElement | null>,
  url: string | undefined,
  active: boolean
) {
  useEffect(() => {
    const video = ref.current
    if (!active || !video) return
    const ui = useReviewUi.getState()
    ui.attach(video)
    // Keep the position across a re-render of the same version (a new render file).
    if (ui.time > 0) video.currentTime = ui.time

    let frame = 0
    const tick = () => {
      useReviewUi.setState({ time: video.currentTime })
      if (!video.paused) frame = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      useReviewUi.setState({ playing: true })
      frame = requestAnimationFrame(tick)
    }
    const onPause = () => {
      cancelAnimationFrame(frame)
      useReviewUi.setState({ playing: false, time: video.currentTime })
    }
    const onSeeked = () => useReviewUi.setState({ time: video.currentTime })
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("seeked", onSeeked)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("seeked", onSeeked)
      if (useReviewUi.getState().video === video) useReviewUi.getState().attach(null)
    }
  }, [ref, url, active])
}

function useFollower(
  ref: React.RefObject<HTMLVideoElement | null>,
  url: string | undefined,
  active: boolean
) {
  useEffect(() => {
    const video = ref.current
    if (!active || !video) return
    const sync = ({ time, playing, rate }: { time: number; playing: boolean; rate: number }) => {
      if (video.playbackRate !== rate) video.playbackRate = rate
      if (playing && video.paused) void video.play()
      if (!playing && !video.paused) video.pause()
      // Let a playing follower run on its own clock; only correct real drift.
      if (Math.abs(video.currentTime - time) > (playing ? 0.25 : 0.01)) video.currentTime = time
    }
    sync(useReviewUi.getState())
    return useReviewUi.subscribe(sync)
  }, [ref, url, active])
}

/** The rectangle the frame actually occupies inside the element, after letterboxing. */
function useContentBox(
  ref: React.RefObject<HTMLVideoElement | null>,
  url: string | undefined,
  set: (box: DOMRect | undefined) => void
) {
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const measure = () => {
      const { clientWidth: w, clientHeight: h, videoWidth: vw, videoHeight: vh } = video
      if (!vw || !vh) return set(undefined)
      const scale = Math.min(w / vw, h / vh)
      const cw = vw * scale
      const ch = vh * scale
      set(new DOMRect((w - cw) / 2, (h - ch) / 2, cw, ch))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(video)
    video.addEventListener("loadedmetadata", measure)
    measure()
    return () => {
      observer.disconnect()
      video.removeEventListener("loadedmetadata", measure)
    }
  }, [ref, url, set])
}

/** Draws the box for a region comment, and shows the region of the anchor being written. */
function RegionLayer({ box, session }: { box: DOMRect; session: Session }) {
  const drawing = useReviewUi((s) => s.drawing)
  const anchor = useReviewUi((s) => s.anchor)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number }>()

  const at = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }

  const finish = () => {
    if (!draft) return
    setDraft(undefined)
    const region = toRegion(draft)
    if (region.w < 0.01 || region.h < 0.01) return
    const { time, setAnchor } = useReviewUi.getState()
    const main = session.timeline?.tracks.find((t) => t.kind === "video")
    const clip = main?.clips.find((c) => c.start <= time && time < c.end)
    setAnchor(
      { kind: "region", time: { start: time, end: time }, region, track: main?.id, clip: clip?.id },
      true
    )
  }

  const shown = draft ? toRegion(draft) : anchor?.kind === "region" ? anchor.region : undefined

  return (
    <div
      className={drawing ? "absolute cursor-crosshair touch-none" : "pointer-events-none absolute"}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onPointerDown={(e) => {
        if (!drawing) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = at(e)
        setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      }}
      onPointerMove={(e) => draft && setDraft({ ...draft, x1: at(e).x, y1: at(e).y })}
      onPointerUp={finish}
    >
      {drawing && !draft && (
        <span className="absolute top-2 left-2 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground">
          拖动框选要评论的区域
        </span>
      )}
      {shown && (
        <div
          className="absolute rounded-sm border-2 border-primary"
          style={{
            left: `${shown.x * 100}%`,
            top: `${shown.y * 100}%`,
            width: `${shown.w * 100}%`,
            height: `${shown.h * 100}%`,
          }}
        />
      )}
    </div>
  )
}

function toRegion({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }): Region {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}
