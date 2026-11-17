import { cn } from "@workspace/ui/lib/utils"

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
const MIN_LABEL_PX = 64

function label(t: number) {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${(Number.isInteger(s) ? String(s) : s.toFixed(1)).padStart(2, "0")}`
}

/**
 * Seconds along the top. A press or drag here picks a point or a span like the lanes below; the
 * progress bar under the player is where the playhead is scrubbed.
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

  return (
    <div className={cn(className, "sticky top-0 z-10 bg-background")}>
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute bottom-0 flex h-full items-end border-l border-border pb-0.5 pl-1 font-mono text-xs text-subtle-foreground tabular-nums"
          style={{ left: t * zoom }}
        >
          {label(t)}
        </span>
      ))}
    </div>
  )
}
