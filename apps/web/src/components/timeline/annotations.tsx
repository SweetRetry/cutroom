import { cn } from "@workspace/ui/lib/utils"

import type { Timeline } from "@workspace/core/schema"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { anchorSpan } from "@workspace/core/timeline/query"
import { plainText } from "@workspace/core/review/mentions"

import { STATUS_TONE } from "../review/status"
import { activate } from "./clips"

/**
 * The reviewer's layer: a point comment is a pin, a span is a bar, both in their status tone.
 * Claude Code's own findings sit on the same lane as outlined marks.
 */
export function Annotations({
  session,
  timeline,
  zoom,
  className,
}: {
  session: Session
  timeline: Timeline
  zoom: number
  className: string
}) {
  const focused = useReviewUi((s) => s.focused)
  const marks = [
    ...(session.comments ?? []).map((view) => ({
      id: view.comment.id,
      anchor: view.comment.anchor,
      tone: STATUS_TONE[view.status],
      title: `${view.comment.id} ${plainText(view.comment.text)}`,
      finding: false,
    })),
    ...(session.findings ?? []).map((f) => ({
      id: f.id,
      anchor: f.anchor,
      tone: "",
      title: `${f.kind}：${f.text}`,
      finding: true,
    })),
  ]

  return (
    <div className={cn(className, "relative border-t border-border/40")}>
      {marks.map((mark) => {
        const span = anchorSpan(mark.anchor, timeline)
        if (!span) return null
        const point = span.end - span.start < 0.05
        return (
          <button
            key={mark.id}
            type="button"
            title={mark.title}
            aria-label={mark.title}
            {...activate(() => {
              const ui = useReviewUi.getState()
              ui.focus(mark.id)
              ui.seek(span.start)
            })}
            className={cn(
              "absolute top-1.5 h-5",
              point ? "w-1.5 -translate-x-1/2" : "",
              "rounded-full",
              // Findings are precheck doubts: hollow, so they never read as a comment status.
              mark.finding
                ? point
                  ? "border border-muted-foreground"
                  : "border border-dashed border-muted-foreground"
                : mark.tone,
              focused === mark.id && "ring-2 ring-foreground"
            )}
            style={
              point
                ? { left: span.start * zoom }
                : { left: span.start * zoom, width: (span.end - span.start) * zoom }
            }
          />
        )
      })}
    </div>
  )
}
