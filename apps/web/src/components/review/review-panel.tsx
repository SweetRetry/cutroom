import { Button } from "@workspace/ui/components/button"
import { Message, MessageContent } from "@workspace/ui/components/message"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Textarea } from "@workspace/ui/components/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { Check, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { api, unwrap } from "@/lib/api"
import { useAction, useAssets, useProjectPath } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { useAddComment } from "@/lib/review/use-add-comment"
import { describeAnchor } from "@workspace/core/review/describe"
import type { CommentView } from "@workspace/core/review/state"
import type { Anchor, Finding } from "@workspace/core/schema"
import { anchorSpan, formatTime } from "@workspace/core/timeline/query"
import { Composer } from "./composer"
import { RichText } from "./rich-text"
import { SendBar } from "./send-bar"
import { StatusDot } from "./status"

const when = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * The round as a conversation, read top to bottom: Claude Code hands over the version (with its
 * replies to the last round and what its own check found), the reviewer's comments follow as
 * their own bubbles with a note at each send, and once the next version is out Claude Code's
 * replies to them close the thread. The comment box sits at the bottom, as in any chat.
 */
export function ReviewPanel({ session, className }: { session: Session; className?: string }) {
  const { phase, comments = [], previous, findings = [], editable, viewing, graph } = session
  const writable = editable && !!phase && phase.kind !== "done"
  const version = graph?.versions.find((v) => v.oid === viewing?.oid)
  const next = phase?.kind === "done" && graph?.versions.find((v) => v.name === phase.result)
  const confirmed = new Set(comments.map((c) => c.comment.finding).filter(Boolean))
  const open = writable ? findings.filter((f) => !confirmed.has(f.id)) : []
  const sends = (session.files?.comments.rounds ?? []).filter((r) => r.version === viewing?.name)

  // Newest at the bottom: follow it as messages arrive, the way a chat does.
  const end = useRef<HTMLDivElement>(null)
  const count = comments.length + sends.length
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [count])

  return (
    <aside className={cn("flex min-h-0 flex-col lg:bg-sidebar", className)}>
      {/* Level with the header. Whether Claude Code is waiting is the one live status. */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <h2 className="text-xs font-medium text-muted-foreground">{viewing?.name} 的评论</h2>
        {editable && session.files?.listening && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            Claude Code 等待中
          </span>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-4 pb-6">
          {version && (
            <Handoff
              name={version.name}
              summary={version.summary}
              time={version.time}
              replies={previous?.comments.filter((c) => c.status !== "draft") ?? []}
              session={session}
            >
              {open.length > 0 && (
                <Block title="预检时发现的疑点">
                  {open.map((f) => (
                    <FindingItem key={f.id} finding={f} session={session} />
                  ))}
                </Block>
              )}
            </Handoff>
          )}

          <Thread comments={comments} sends={sends} session={session} />

          {next && (
            <Handoff
              name={next.name}
              summary={next.summary}
              time={next.time}
              replies={comments.filter((c) => c.status !== "draft")}
              session={session}
            />
          )}
          <div ref={end} />
        </div>
      </ScrollArea>
      {writable && (
        <>
          <SendBar session={session} />
          <Composer session={session} />
        </>
      )}
      {!editable && session.current && (
        <p className="p-4 text-muted-foreground">
          历史版本仅供查看，评论写在当前版本 {session.current.name} 上。
        </p>
      )}
    </aside>
  )
}

/** Claude Code's turn: a version handed over, and what it says about the comments it answered. */
function Handoff({
  name,
  summary,
  time,
  replies,
  session,
  children,
}: {
  name: string
  summary: string
  time: string
  replies: CommentView[]
  session: Session
  children?: ReactNode
}) {
  const { view } = useViewNavigation()
  const shown = name === session.viewing?.name
  return (
    <Message from="assistant">
      <MessageContent>
        <div className="flex flex-col gap-3">
          <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Claude Code</span>
            <span className="tabular-nums">{when.format(new Date(time))}</span>
          </span>
          <p>
            交来 <span className="font-medium tabular-nums">{name}</span>：{summary}
          </p>
          {replies.length > 0 && (
            <Block title={`回复了 ${replies.length} 条评论`}>
              {replies.map((r) => (
                <Reply key={r.comment.id} view={r} session={session} />
              ))}
            </Block>
          )}
          {children}
          {!shown && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => void view(name)}
            >
              查看 {name}
            </Button>
          )}
        </div>
      </MessageContent>
    </Message>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-4">{children}</ul>
    </section>
  )
}

/** Moves the playhead to a place and highlights its comment on the timeline. */
function useReveal(session: Session) {
  return (anchor: Anchor, id: string) => {
    const ui = useReviewUi.getState()
    ui.focus(id)
    const span = session.timeline && anchorSpan(anchor, session.timeline)
    if (span) ui.seek(span.start)
  }
}

/** Where a comment points, as one line that can be clicked to go there. */
function Place({ anchor, session }: { anchor: Anchor; session: Session }) {
  const assets = useAssets()
  const place = describeAnchor(anchor, session.timeline, assets)
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      <span className="font-medium text-foreground">{place.kind}</span> {place.detail}
    </span>
  )
}

/** The reviewer's comments in the order written, with a note where each send went out. */
function Thread({
  comments,
  sends,
  session,
}: {
  comments: CommentView[]
  sends: { submittedAt: string }[]
  session: Session
}) {
  const items: Array<{ at: number; node: ReactNode }> = [
    ...comments.map((view) => ({
      at: Date.parse(view.comment.createdAt),
      node: <Bubble key={view.comment.id} view={view} session={session} />,
    })),
    ...sends.map((send, i) => {
      const at = Date.parse(send.submittedAt)
      const n = comments.filter((c) => {
        const t = Date.parse(c.comment.createdAt)
        return t <= at && (i === 0 || t > Date.parse(sends[i - 1]!.submittedAt))
      }).length
      return {
        // A send sorts after the comments it carried, which were written at or before it.
        at: at + 0.5,
        node: (
          <Message key={send.submittedAt} from="system">
            <MessageContent>
              <span className="flex justify-center gap-2">
                <span>已发给 Claude Code {n} 条</span>
                <span className="tabular-nums">{when.format(new Date(at))}</span>
              </span>
            </MessageContent>
          </Message>
        ),
      }
    }),
  ].sort((a, b) => a.at - b.at)

  if (items.length === 0)
    return (
      <Message from="system">
        <MessageContent>在时间轴上选取位置，或直接写对全片的评论</MessageContent>
      </Message>
    )
  return <>{items.map((i) => i.node)}</>
}

function Bubble({ view, session }: { view: CommentView; session: Session }) {
  const { comment, status } = view
  const focused = useReviewUi((s) => s.focused === comment.id)
  const reveal = useReveal(session)
  return (
    <Message from="user">
      <MessageContent highlighted={focused}>
        <button
          type="button"
          className="flex flex-col gap-1 text-left"
          onClick={() => reveal(comment.anchor, comment.id)}
        >
          <Place anchor={comment.anchor} session={session} />
          <RichText text={comment.text} />
        </button>
        {(status === "draft" || status === "missed") && (
          <span className="flex min-h-6 items-center gap-2">
            <StatusDot status={status} />
            {status === "draft" && <DeleteDraft id={comment.id} />}
          </span>
        )}
      </MessageContent>
    </Message>
  )
}

const ANSWER = {
  replied: { label: "已修改", tone: "bg-primary" },
  skipped: { label: "未修改", tone: "bg-warning" },
  missed: { label: "没有回复", tone: "bg-destructive" },
} as const

/**
 * One comment Claude Code answered: the comment quoted, what it did or why not, and the
 * reviewer's verdict. Accepting is an icon at the end of the answer line; reopening asks why,
 * in a box under the reply, and becomes a new comment at the same place.
 */
function Reply({ view, session }: { view: CommentView; session: Session }) {
  const { comment, reply, status } = view
  const reveal = useReveal(session)
  const [reopening, setReopening] = useState(false)
  const answer = !reply ? ANSWER.missed : reply.done ? ANSWER.replied : ANSWER.skipped
  const judged = status === "closed" || status === "reopened"
  const canReopen = !!session.phase && session.phase.kind !== "done"
  return (
    <li className="flex flex-col gap-2">
      <button
        type="button"
        className="flex flex-col gap-1 border-l-2 pl-3 text-left text-muted-foreground"
        onClick={() => reveal(comment.anchor, comment.id)}
      >
        <Place anchor={comment.anchor} session={session} />
        <span className="line-clamp-2">
          <RichText text={comment.text} />
        </span>
      </button>
      <span className="flex min-h-6 items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", answer.tone)} />
          {answer.label}
        </span>
        {judged ? (
          <StatusDot status={status} className="ml-auto" />
        ) : (
          session.editable &&
          !reopening && (
            <span className="ml-auto flex items-center gap-1">
              {canReopen && (
                <Button variant="ghost" size="xs" onClick={() => setReopening(true)}>
                  重新打开
                </Button>
              )}
              <Resolve id={comment.id} />
            </span>
          )
        )}
      </span>
      {reply && <RichText text={reply.text} />}
      {reopening && <Reopen view={view} onDone={() => setReopening(false)} />}
    </li>
  )
}

/** Accepting the reply closes the comment. */
function Resolve({ id }: { id: string }) {
  const p = useProjectPath()
  const act = useAction()
  return (
    <IconAction
      label="标为已解决"
      onClick={() =>
        void act(
          () => unwrap(api.comments({ id }).resolution.post({ p, resolution: "closed" })),
          "操作失败"
        )
      }
    >
      <Check />
    </IconAction>
  )
}

/** Why it isn't right yet: a new comment in the current round, linked to the old one. */
function Reopen({ view, onDone }: { view: CommentView; onDone: () => void }) {
  const p = useProjectPath()
  const act = useAction()
  const add = useAddComment()
  const [text, setText] = useState("")
  const id = view.comment.id

  const reopen = () =>
    act(async () => {
      if (!text.trim()) return
      // The follow-up comment first: a failed add must not leave the old one marked reopened.
      await add({ text, anchor: view.comment.anchor, reopens: id })
      await unwrap(api.comments({ id }).resolution.post({ p, resolution: "reopened" }))
      onDone()
    }, "重新打开失败")

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={2}
        value={text}
        placeholder="说明还需要修改的地方"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="xs" disabled={!text.trim()} onClick={() => void reopen()}>
          重新打开
        </Button>
        <Button variant="ghost" size="xs" onClick={onDone}>
          取消
        </Button>
      </div>
    </div>
  )
}

/** Removing the one draft in front of you: an icon at the row's end (DESIGN.md › Iconography). */
function DeleteDraft({ id }: { id: string }) {
  const p = useProjectPath()
  const act = useAction()
  return (
    <IconAction
      label="删除"
      className="ml-auto"
      onClick={() =>
        void act(() => unwrap(api.comments({ id }).delete(undefined, { query: { p } })), "删除失败")
      }
    >
      <Trash2 />
    </IconAction>
  )
}

function IconAction({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className={className}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            void act(
              () => add({ text: finding.text, anchor: finding.anchor, finding: finding.id }),
              "转为评论失败"
            )
          }
        >
          转为评论
        </Button>
        <IconAction
          label="忽略"
          className="ml-auto"
          onClick={() =>
            void act(() => unwrap(api.findings({ id: finding.id }).dismiss.post({ p })), "忽略失败")
          }
        >
          <X />
        </IconAction>
      </div>
    </li>
  )
}
