import { cn } from "@workspace/ui/lib/utils"
import { useRef } from "react"

import { useReviewUi } from "@/lib/review/ui-store"

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
const MIN_LABEL_PX = 64

function label(t: number) {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${(Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(2, "0")}`
}

/**
 * Seconds along the top, and the scrub bar: press and drag here to move the playhead. Dragging
 * on the lanes below picks a span for a comment instead, so the two never fight.
 */
export function Ruler({
  duration,
  zoom,
  className,
}: {
  duration: number
  zoom: number
  className: string
}) {
  const step = STEPS.find((s) => s * zoom >= MIN_LABEL_PX) ?? STEPS.at(-1)!
  const ticks: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(Number(t.toFixed(3)))
  const scrubbing = useRef(false)

  const seekTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ui = useReviewUi.getState()
    ui.seek(Math.min(duration, Math.max(0, (event.clientX - rect.left) / zoom)))
  }

  return (
    <div
      className={cn(className, "sticky top-0 z-10 cursor-ew-resize bg-background")}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        scrubbing.current = true
        useReviewUi.getState().video?.pause()
        seekTo(event)
      }}
      onPointerMove={(event) => {
        if (scrubbing.current) seekTo(event)
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        scrubbing.current = false
      }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute bottom-0 flex h-full items-end border-l border-border pb-0.5 pl-1 font-mono text-xs text-subtle-foreground tabular-nums"
          style={{ left: t * zoom }}
        >
          {label(t)}
        </span>
      ))}
      <Knob zoom={zoom} />
    </div>
  )
}

/** The playhead's grip on the ruler, so it reads as something to drag. */
function Knob({ zoom }: { zoom: number }) {
  const time = useReviewUi((s) => s.time)
  return (
    <span
      className="pointer-events-none absolute bottom-0 h-3 w-2.5 -translate-x-1/2 rounded-b-sm bg-foreground"
      style={{ left: time * zoom }}
    />
  )
}
