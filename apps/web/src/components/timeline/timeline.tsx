import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Minus, MoveHorizontal, Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { useEffect, useMemo, useRef, useState } from "react"

import { useAssets, useMediaUrl } from "@/lib/project/hooks"
import { PATHS } from "@workspace/core/project/layout"
import { TRACK_KIND_LABEL, type Anchor, type Track } from "@workspace/core/schema"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import {
  anchorSpan,
  clipLabel,
  packLanes,
  seams,
  snap,
  snapPoints,
} from "@workspace/core/timeline/query"
import { Annotations } from "./annotations"
import { activate, ClipBlock, LANE_PX, ROW } from "./clips"
import { Ruler } from "./ruler"

const ORDER: Track["kind"][] = ["text", "overlay", "effect", "video", "voice", "music"]
const SNAP_PX = 8
const TAIL_PX = 64
/** The sticky track-name column: its width is whatever the layout gave it. */
const HEADER_PX = (scroller: HTMLElement) =>
  (scroller.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0

/**
 * The read-only multi-track view. Nothing here edits the cut: every click picks a place for the
 * next comment (a point, a span, a clip, a cut between clips or a whole track) and moves the
 * playhead there.
 */
export function Timeline({ session, className }: { session: Session; className?: string }) {
  const { timeline, editable, viewing, diff } = session
  const zoom = useReviewUi((s) => s.zoom)
  const anchor = useReviewUi((s) => s.anchor)
  const assets = useAssets()
  const renderFile = viewing ? PATHS.render(viewing.name) : undefined
  const rendered = !!useMediaUrl(renderFile)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number; moved: boolean }>()

  const tracks = useMemo(
    () =>
      timeline
        ? [...timeline.tracks]
            .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
            .map((track) => ({
              track,
              lanes: packLanes(track.clips),
              lanePx: LANE_PX[track.kind],
            }))
        : [],
    [timeline]
  )
  // The notes lane appears once there is something to put on it.
  const marked = (session.comments?.length ?? 0) + (session.findings?.length ?? 0) > 0
  const points = useMemo(() => (timeline ? snapPoints(timeline) : []), [timeline])
  useFollowPlayhead(scroller, zoom)
  useFitWidth(scroller, timeline?.duration)

  if (!timeline) {
    return (
      <section
        className={cn("flex h-48 items-center border-t px-4 text-muted-foreground", className)}
      >
        {session.timelinePending
          ? null
          : `${viewing?.name ?? "这个版本"} 的提交里没有 timeline.json`}
      </section>
    )
  }

  const width = timeline.duration * zoom + TAIL_PX
  const timeAt = (clientX: number) => {
    const rect = content.current!.getBoundingClientRect()
    return Math.min(timeline.duration, Math.max(0, (clientX - rect.left) / zoom))
  }
  const snapped = (t: number) => snap(t, points, SNAP_PX / zoom)
  const { seek, setAnchor } = useReviewUi.getState()

  const pick = (next: Anchor, seekTo: number) => {
    seek(seekTo)
    // Picking keeps keyboard focus here, so Space still plays; M or the comment box writes.
    if (editable) setAnchor(next)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const t = snapped(timeAt(event.clientX))
    setDrag({ from: t, to: t, moved: false })
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const raw = timeAt(event.clientX)
    const moved = drag.moved || Math.abs(raw - drag.from) * zoom > 4
    setDrag({ ...drag, to: moved ? snapped(raw) : drag.from, moved })
  }
  const onPointerUp = () => {
    if (!drag) return
    setDrag(undefined)
    const start = Math.min(drag.from, drag.to)
    const end = Math.max(drag.from, drag.to)
    if (drag.moved && end > start) pick({ kind: "range", time: { start, end } }, start)
    else pick({ kind: "point", time: { start, end: start } }, start)
  }

  const span = drag?.moved
    ? { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) }
    : anchor && anchor.kind !== "point" && anchor.kind !== "region"
      ? anchorSpan(anchor, timeline)
      : undefined

  return (
    <section className={cn("flex max-h-80 min-h-0 flex-col border-t", className)}>
      <div ref={scroller} className="flex min-h-0 flex-1 overflow-auto">
        <div className="sticky left-0 z-20 flex w-24 shrink-0 flex-col bg-background sm:w-32">
          <ZoomControls className={cn(ROW.ruler, "sticky top-0 z-10 shrink-0 bg-background")} />
          {marked && <RowHeader className={ROW.notes} label="标注" />}
          {tracks.map(({ track, lanes, lanePx }) => (
            <RowHeader
              key={track.id}
              height={lanes.count * lanePx}
              label={track.name ?? TRACK_KIND_LABEL[track.kind]}
              selected={anchor?.kind === "track" && anchor.track === track.id}
              onClick={editable ? () => setAnchor({ kind: "track", track: track.id }) : undefined}
            />
          ))}
        </div>

        <div
          ref={content}
          className="relative isolate shrink-0 grow touch-none select-none"
          style={{ minWidth: width }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <Ruler duration={timeline.duration} zoom={zoom} className={ROW.ruler} />
          {marked && (
            <Annotations session={session} timeline={timeline} zoom={zoom} className={ROW.notes} />
          )}
          {tracks.map(({ track, lanes, lanePx }) => (
            <div
              key={track.id}
              className="relative border-t border-border/40"
              style={{ height: lanes.count * lanePx }}
            >
              {track.clips.map((clip) => (
                <ClipBlock
                  key={clip.id}
                  track={track}
                  clip={clip}
                  zoom={zoom}
                  top={lanes.lane.get(clip.id)! * lanePx}
                  height={lanePx}
                  room={lanes.room.get(clip.id)!}
                  label={clipLabel(track, clip, assets)}
                  asset={clip.asset ? assets.get(clip.asset) : undefined}
                  renderFile={rendered ? renderFile : undefined}
                  selected={anchor?.clip === clip.id && anchor.kind === "clip"}
                  change={diff?.byClip.get(clip.id)?.kind}
                  onPick={() =>
                    pick(
                      {
                        kind: "clip",
                        track: track.id,
                        clip: clip.id,
                        time: { start: clip.start, end: clip.end },
                      },
                      clip.start
                    )
                  }
                />
              ))}
              {editable &&
                (track.kind === "video" || track.kind === "overlay") &&
                seams(track).map(({ left, right, at }) => (
                  <button
                    key={`${left.id}|${right.id}`}
                    type="button"
                    aria-label={`${left.id} 和 ${right.id} 之间的接缝`}
                    className={cn(
                      "absolute inset-y-0 z-10 w-2 -translate-x-1/2 rounded-sm hover:bg-primary/60",
                      anchor?.kind === "seam" && anchor.seam?.[0] === left.id && "bg-primary"
                    )}
                    style={{ left: at * zoom }}
                    {...activate(() =>
                      pick(
                        {
                          kind: "seam",
                          track: track.id,
                          seam: [left.id, right.id],
                          time: { start: at, end: at },
                        },
                        at
                      )
                    )}
                  />
                ))}
            </div>
          ))}
          {span && (
            <div
              className="pointer-events-none absolute inset-y-0 border-x border-primary bg-primary/10"
              style={{
                left: span.start * zoom,
                width: Math.max(1, (span.end - span.start) * zoom),
              }}
            />
          )}
          <Playhead zoom={zoom} />
        </div>
      </div>
    </section>
  )
}

function RowHeader({
  label,
  className,
  height,
  selected,
  onClick,
}: {
  label: string
  className?: string
  height?: number
  selected?: boolean
  onClick?: () => void
}) {
  const style = height ? { height } : undefined
  const classes = cn(
    className,
    "flex shrink-0 items-center border-t border-border/40 px-4 text-xs text-muted-foreground"
  )
  const text = (
    <span className="truncate" title={label}>
      {label}
    </span>
  )
  if (!onClick)
    return (
      <div className={classes} style={style}>
        {text}
      </div>
    )
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        classes,
        "text-left transition-colors hover:bg-accent hover:text-foreground",
        selected && "bg-accent text-foreground"
      )}
    >
      {text}
    </button>
  )
}

function Playhead({ zoom }: { zoom: number }) {
  const time = useReviewUi((s) => s.time)
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground"
      style={{ left: time * zoom }}
    />
  )
}

/** While playing, scroll the lanes so the playhead stays in view. */
function useFollowPlayhead(scroller: React.RefObject<HTMLDivElement | null>, zoom: number) {
  useEffect(
    () =>
      useReviewUi.subscribe((s) => {
        const el = scroller.current
        if (!el || !s.playing) return
        const x = s.time * zoom
        const view = el.clientWidth - HEADER_PX(el)
        if (x < el.scrollLeft || x > el.scrollLeft + view - 32) el.scrollLeft = Math.max(0, x - 64)
      }),
    [scroller, zoom]
  )
}

/** While `fitted`, keep the whole cut in view as the lane area resizes. */
function useFitWidth(
  scroller: React.RefObject<HTMLDivElement | null>,
  duration: number | undefined
) {
  const fitted = useReviewUi((s) => s.fitted)
  useEffect(() => {
    const el = scroller.current
    if (!el || !duration || !fitted) return
    const measure = () =>
      useReviewUi.getState().fitTo((el.clientWidth - HEADER_PX(el) - TAIL_PX) / duration)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scroller, duration, fitted])
}

function ZoomControls({ className }: { className: string }) {
  const zoom = useReviewUi((s) => s.zoom)
  const { setZoom, fit } = useReviewUi.getState()
  return (
    <div className={cn(className, "flex items-center gap-1 px-2")}>
      <ZoomButton label="缩小" shortcut="−" onClick={() => setZoom(zoom / 1.25)}>
        <Minus />
      </ZoomButton>
      <ZoomButton label="放大" shortcut="+" onClick={() => setZoom(zoom * 1.25)}>
        <Plus />
      </ZoomButton>
      <ZoomButton label="适合宽度" shortcut="0" onClick={fit}>
        <MoveHorizontal />
      </ZoomButton>
    </div>
  )
}

function ZoomButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent>
        {label} {shortcut}
      </TooltipContent>
    </Tooltip>
  )
}
