import { Button } from "@workspace/ui/components/button"
import { toast } from "sonner"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import type { Session } from "@/lib/review/session"

/** What to say in Claude Code when it wasn't waiting; the cutroom skill knows it. */
const PROMPT = "看评论"

/**
 * Comments are written one by one and go to Claude Code together. This shows only while some
 * are waiting: Claude Code usually sits in `cutroom review` for exactly this send, and when it
 * isn't, the toast says how to hand them over.
 */
export function SendBar({ session }: { session: Session }) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const drafts = session.comments?.filter((c) => c.status === "draft").length ?? 0
  if (drafts === 0) return null

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
    <div className="flex items-center gap-2 px-4 pb-2">
      <span className="text-muted-foreground tabular-nums">{drafts} 条评论未发送</span>
      <Button size="sm" className="ml-auto" onClick={() => void send()}>
        发给 Claude Code
      </Button>
    </div>
  )
}
