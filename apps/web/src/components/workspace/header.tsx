import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { GitCompareArrows } from "lucide-react"
import { toast } from "sonner"

import { Link } from "@tanstack/react-router"
import type { RoundPhase } from "@workspace/core/review/state"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"
import { ChangesPopover } from "../review/changes"
import { VersionSwitcher } from "./versions"

export function Header({ session, className }: { session: Session; className?: string }) {
  const { view } = useViewNavigation()
  const { current, editable } = session

  return (
    // Narrow screens scroll the whole page; the header stays so the round's action stays in reach.
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-4 border-b bg-background/85 px-4 backdrop-blur lg:static lg:bg-background lg:backdrop-blur-none",
        className
      )}
    >
      <Link
        to="/"
        search={{}}
        className="min-w-0 truncate font-medium transition-colors hover:text-muted-foreground"
        title="换一个项目"
      >
        {session.files?.name ?? ""}
      </Link>
      <VersionSwitcher session={session} />
      <CompareToggle session={session} />
      <ChangesPopover session={session} />
      <div className="ml-auto flex shrink-0 items-center gap-4">
        {!editable && current ? (
          <Button variant="secondary" onClick={() => void view(undefined)}>
            回到 {current.name}
          </Button>
        ) : (
          session.phase && <RoundAction session={session} phase={session.phase} />
        )}
      </div>
    </header>
  )
}

/** What to say in Claude Code when it wasn't waiting; the cutroom skill knows it. */
const PROMPT = "看评论"

/**
 * Sending ends the reviewer's half of the round. Claude Code usually sits in `cutroom review`
 * waiting for exactly this, and the header says so; when it isn't, the toast says how to resume.
 */
function RoundAction({ session, phase }: { session: Session; phase: RoundPhase }) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const drafts = session.comments?.filter((c) => c.status === "draft").length ?? 0
  const listening = !!session.files?.listening

  if (phase.kind !== "drafting") {
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
 * Comparing is how a reviewer sees what a version changed, so it sits next to the version name
 * and defaults to the version this one was cut from. Any other pair is in the version list.
 */
function CompareToggle({ session }: { session: Session }) {
  const { compare } = useViewNavigation()
  const { comparing, base } = session
  if (comparing)
    return (
      <Button variant="secondary" size="sm" onClick={() => void compare(undefined)}>
        结束对比 {comparing.name}
      </Button>
    )
  if (!base) return null
  return (
    <Button variant="ghost" size="sm" onClick={() => void compare(base.name)}>
      <GitCompareArrows data-icon="inline-start" />
      对比 {base.name}
    </Button>
  )
}
