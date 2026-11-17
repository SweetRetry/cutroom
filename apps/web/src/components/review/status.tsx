import { cn } from "@workspace/ui/lib/utils"

import { COMMENT_STATUS_LABEL, type CommentStatus } from "@workspace/core/review/state"

/** One tone per status, shared by the comment list and the annotation lane. */
export const STATUS_TONE: Record<CommentStatus, string> = {
  draft: "bg-subtle-foreground",
  pending: "bg-chart-2",
  replied: "bg-primary",
  missed: "bg-destructive",
  closed: "bg-surface-3",
  reopened: "bg-warning",
}

/** Status is a 6px dot plus a word (DESIGN.md › Badge). */
export function StatusDot({ status, className }: { status: CommentStatus; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_TONE[status])} />
      {COMMENT_STATUS_LABEL[status]}
    </span>
  )
}
