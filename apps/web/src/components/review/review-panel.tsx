import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { useState, type ReactNode } from "react"

import { api, unwrap } from "@/lib/api"
import { useAction, useProjectPath } from "@/lib/project/hooks"
import type { Finding } from "@workspace/core/schema"
import type { Session } from "@/lib/review/session"
import type { CommentView } from "@workspace/core/review/state"
import { useReviewUi } from "@/lib/review/ui-store"
import { useAddComment } from "@/lib/review/use-add-comment"
import { anchorSpan, formatTime } from "@workspace/core/timeline/query"
import { CommentItem } from "./comment-item"
import { Composer } from "./composer"

export function ReviewPanel({ session, className }: { session: Session; className?: string }) {
  const { phase, comments = [], previous, findings = [], editable } = session
  // Writing stays open after sending, until the next version is out.
  const writable = editable && !!phase && phase.kind !== "done"
  const confirmed = new Set(comments.map((c) => c.comment.finding).filter(Boolean))
  const open = findings.filter((f) => !confirmed.has(f.id))
  const verdicts =
    previous?.comments.filter((c) => c.status === "replied" || c.status === "missed") ?? []

  return (
    <aside className={cn("flex min-h-0 flex-col lg:bg-sidebar", className)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-8 px-4 pt-4 pb-8">
          {verdicts.length > 0 && (
            <Section title={`${previous!.version} 的回复`}>
              {verdicts.map((view) => (
                <CommentItem key={view.comment.id} view={view} session={session}>
                  <Verdict view={view} session={session} />
                </CommentItem>
              ))}
            </Section>
          )}

          {writable && open.length > 0 && (
            <Section title="预检发现">
              {open.map((f) => (
                <FindingItem key={f.id} finding={f} session={session} />
              ))}
            </Section>
          )}

          <Section title={`${session.viewing?.name ?? ""} 的评论`} empty="暂无评论">
            {comments.map((view) => (
              <CommentItem key={view.comment.id} view={view} session={session}>
                {view.status === "draft" && <DeleteDraft id={view.comment.id} />}
              </CommentItem>
            ))}
          </Section>
        </div>
      </ScrollArea>
      {/* The bottom slot: the comment box while the round is open. The header says when it's sent. */}
      {writable && <Composer session={session} />}
      {!editable && session.current && (
        <p className="border-t p-4 text-muted-foreground">
          历史版本仅供查看，评论写在当前版本 {session.current.name} 上。
        </p>
      )}
    </aside>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty?: string
  children: ReactNode[] | ReactNode
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children
  // An empty section keeps its title, so "暂无评论" can't be read as being about another section.
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {hasItems ? (
        <ul className="flex flex-col gap-2">{children}</ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

function DeleteDraft({ id }: { id: string }) {
  const p = useProjectPath()
  const act = useAction()
  return (
    <Button
      variant="ghost"
      size="xs"
      className="-ml-2 self-start"
      onClick={() =>
        void act(() => unwrap(api.comments({ id }).delete(undefined, { query: { p } })), "删除失败")
      }
    >
      删除
    </Button>
  )
}

function FindingItem({ finding, session }: { finding: Finding; session: Session }) {
  const p = useProjectPath()
  const act = useAction()
  const add = useAddComment()
  const span = session.timeline && anchorSpan(finding.anchor, session.timeline)
  const focused = useReviewUi((s) => s.focused === finding.id)

  return (
    <li
      className={cn(
        "-mx-2 flex flex-col gap-2 rounded-md px-2 py-2 transition-colors",
        focused && "bg-surface-2"
      )}
    >
      <button
        type="button"
        className="flex flex-col gap-1 text-left"
        onClick={() => {
          useReviewUi.getState().focus(finding.id)
          if (span) useReviewUi.getState().seek(span.start)
        }}
      >
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{finding.kind}</span>
          {span && <span className="tabular-nums">{formatTime(span.start)}</span>}
        </span>
        <span>{finding.text}</span>
      </button>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            void act(
              () =>
                add({
                  text: finding.text,
                  anchor: finding.anchor,
                  finding: finding.id,
                }),
              "转为评论失败"
            )
          }
        >
          转为评论
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            void act(() => unwrap(api.findings({ id: finding.id }).dismiss.post({ p })), "忽略失败")
          }
        >
          忽略
        </Button>
      </div>
    </li>
  )
}

/**
 * Closing accepts the reply. Reopening says why it isn't right yet and becomes a new comment in
 * the current round, at the same place, linked to the old one.
 */
function Verdict({ view, session }: { view: CommentView; session: Session }) {
  const p = useProjectPath()
  const act = useAction()
  const add = useAddComment()
  const [reopening, setReopening] = useState(false)
  const [text, setText] = useState("")
  const id = view.comment.id
  const canReopen = !!session.phase && session.phase.kind !== "done"

  const resolve = (resolution: "closed" | "reopened") =>
    act(() => unwrap(api.comments({ id }).resolution.post({ p, resolution })), "操作失败")

  const reopen = () =>
    act(async () => {
      if (!text.trim()) return
      // The follow-up comment first: a failed add must not leave the old one marked reopened.
      await add({ text, anchor: view.comment.anchor, reopens: id })
      await unwrap(api.comments({ id }).resolution.post({ p, resolution: "reopened" }))
    }, "重新打开失败")

  if (reopening) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          autoFocus
          rows={2}
          value={text}
          placeholder="说明还需要修改的地方"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="xs"
            disabled={!text.trim()}
            onClick={() => void reopen()}
          >
            重新打开
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setReopening(false)}>
            取消
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="xs" onClick={() => void resolve("closed")}>
        标为已解决
      </Button>
      {canReopen && (
        <Button variant="ghost" size="xs" onClick={() => setReopening(true)}>
          重新打开
        </Button>
      )}
    </div>
  )
}
