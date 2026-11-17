import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

import { useAssets } from "@/lib/project/hooks"
import { INTENT_LABEL } from "@workspace/core/schema"
import { describeAnchor } from "@workspace/core/review/describe"
import type { Session } from "@/lib/review/session"
import type { CommentStatus, CommentView } from "@workspace/core/review/state"
import { useReviewUi } from "@/lib/review/ui-store"
import { anchorSpan } from "@workspace/core/timeline/query"
import { StatusDot } from "./status"

/**
 * One comment with what Claude Code replied after the round: what it did, or why not.
 * `children` carries the actions that fit the round's phase.
 */
export function CommentItem({
  view,
  session,
  children,
}: {
  view: CommentView
  session: Session
  children?: ReactNode
}) {
  const { comment, reply, status } = view
  const assets = useAssets()
  const focused = useReviewUi((s) => s.focused === comment.id)
  const place = describeAnchor(comment.anchor, session.timeline, assets)

  const reveal = () => {
    const ui = useReviewUi.getState()
    ui.focus(comment.id)
    const span = session.timeline && anchorSpan(comment.anchor, session.timeline)
    if (span) ui.seek(span.start)
  }

  return (
    <li
      className={cn(
        "-mx-2 flex flex-col gap-2 rounded-md px-2 py-2 transition-colors",
        focused && "bg-surface-2"
      )}
    >
      <button type="button" onClick={reveal} className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{INTENT_LABEL[comment.intent]}</span>
          <span className="min-w-0 truncate tabular-nums">
            {place.kind} {place.detail}
          </span>
          {!QUIET.has(status) && <StatusDot status={status} className="ml-auto shrink-0" />}
        </span>
        <span>{comment.text}</span>
      </button>

      {reply && <Answer state={reply.done ? "done" : "skipped"}>{reply.text}</Answer>}
      {children}
    </li>
  )
}

/**
 * Claude Code's reply to one comment, threaded under it: whether it changed it, then how, or
 * why not.
 */
const ANSWER = {
  done: { label: "已改", tone: "bg-primary" },
  skipped: { label: "没改", tone: "bg-warning" },
} as const

function Answer({ state, children }: { state: keyof typeof ANSWER; children: ReactNode }) {
  const { label, tone } = ANSWER[state]
  return (
    <div className="flex flex-col gap-1 border-l-2 pl-3">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", tone)} />
        {label}
      </span>
      <p>{children}</p>
    </div>
  )
}

/**
 * The state every comment in its section is expected to be in: a draft while writing, replied
 * once the round is back. Only a departure from it earns a status.
 */
const QUIET = new Set<CommentStatus>(["draft", "replied"])
