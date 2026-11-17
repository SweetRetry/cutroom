import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { GitCompareArrows } from "lucide-react"
import { toast } from "sonner"

import { Link } from "@tanstack/react-router"
import type { RoundPhase } from "@workspace/core/review/state"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"
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

const WAITING: Partial<Record<RoundPhase["kind"], string>> = {
  "awaiting-plan": "等待计划",
  "plan-ready": "计划待你确认",
  objected: "等待改写计划",
  approved: "计划已通过，等待执行",
  done: "等待新版本",
}

const PROMPT = "处理本轮评论"

function RoundAction({ session, phase }: { session: Session; phase: RoundPhase }) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const drafts = session.comments?.filter((c) => c.status === "draft").length ?? 0

  if (phase.kind !== "drafting") {
    const attention = phase.kind === "plan-ready"
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span
          className={cn("size-1.5 rounded-full", attention ? "bg-warning" : "bg-subtle-foreground")}
        />
        {WAITING[phase.kind]}
      </span>
    )
  }

  const submit = async () => {
    try {
      await unwrap(api.round.submit.post({ p }))
    } catch (error) {
      toast.error("没能提交", { description: error instanceof Error ? error.message : undefined })
      return
    }
    await refresh()
    toast.success(`已提交 ${drafts} 条评论`, {
      description: `下一步先出计划，确认后再改。剪辑的一方可以用这句话开始：“${PROMPT}”。`,
      action: { label: "复制", onClick: () => void navigator.clipboard.writeText(PROMPT) },
      duration: 10000,
    })
  }

  return (
    <Button disabled={drafts === 0} onClick={() => void submit()}>
      提交本轮
      {drafts > 0 && <span className="tabular-nums">{drafts}</span>}
    </Button>
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
