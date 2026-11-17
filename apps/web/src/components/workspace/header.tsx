import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import type { RoundPhase } from "@workspace/core/review/state"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { ProjectMenu } from "./project-menu"

/** The window's top bar. Without a session it is the empty workspace's: only the folder menu. */
export function Header({ session, className }: { session?: Session; className?: string }) {
  return (
    // Narrow screens scroll the whole page; the header stays so the round's action stays in reach.
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-4 border-b bg-background/85 px-4 backdrop-blur lg:static lg:bg-background lg:backdrop-blur-none",
        className
      )}
    >
      <ProjectMenu path={session?.files?.path} name={session?.files?.name} />
      {session && <ReviewActions session={session} />}
    </header>
  )
}

function ReviewActions({ session }: { session: Session }) {
  const { view } = useViewNavigation()
  const { current, editable } = session
  return (
    <>
      <VersionName session={session} />
      <div className="ml-auto flex shrink-0 items-center gap-4">
        {!editable && current ? (
          <Button variant="secondary" onClick={() => void view(undefined)}>
            回到 {current.name}
          </Button>
        ) : (
          session.phase && <RoundAction session={session} phase={session.phase} />
        )}
      </div>
    </>
  )
}

/** What to say in Claude Code when it wasn't waiting; the cutroom skill knows it. */
const PROMPT = "看评论"

/**
 * Sending hands the round's comments to Claude Code, which usually sits in `cutroom review`
 * waiting for exactly this; the header says so, and when it isn't the toast says how to resume.
 * Comments written after a send go out with the next one.
 */
function RoundAction({ session, phase }: { session: Session; phase: RoundPhase }) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const drafts = session.comments?.filter((c) => c.status === "draft").length ?? 0
  const listening = !!session.files?.listening

  // After a send the round stays open: new comments wait here until they're sent too.
  if (phase.kind !== "drafting" && drafts === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-subtle-foreground" />
        已发送，等待新版本
      </span>
    )
  }

  const send = async () => {
    let result
    try {
      result = await unwrap(api.round.send.post({ p }))
    } catch (error) {
      toast.error("发送失败", { description: error instanceof Error ? error.message : undefined })
      return
    }
    await refresh()
    if (result.listening) toast.success(`已发给 Claude Code，${result.count} 条评论`)
    else
      toast.success(`已发送 ${result.count} 条评论`, {
        description: `Claude Code 未在等待。在对话中发送“${PROMPT}”即可读取。`,
        action: { label: "复制", onClick: () => void navigator.clipboard.writeText(PROMPT) },
        duration: 10000,
      })
  }

  return (
    <>
      {listening && (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Claude Code 等待中
        </span>
      )}
      <Button disabled={drafts === 0} onClick={() => void send()}>
        发给 Claude Code
        {drafts > 0 && <span className="tabular-nums">{drafts}</span>}
      </Button>
    </>
  )
}

/**
 * Which version the stage shows, and on which branch. Versions and their comparison live in the
 * left rail's 版本 panel; the name opens it.
 */
function VersionName({ session }: { session: Session }) {
  const setPanel = useReviewUi((s) => s.setPanel)
  const { viewing, comparing, editable } = session
  if (!viewing) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0"
      title="查看所有版本"
      onClick={() => setPanel("versions")}
    >
      <span className="font-medium tabular-nums">{viewing.name}</span>
      {comparing && (
        <span className="text-xs text-muted-foreground tabular-nums">对比 {comparing.name}</span>
      )}
      {session.graph?.branch && editable && (
        <span className="text-xs text-subtle-foreground">{session.graph.branch}</span>
      )}
    </Button>
  )
}
