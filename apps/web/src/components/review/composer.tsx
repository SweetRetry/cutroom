import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useAssets } from "@/lib/project/hooks"
import { describeAnchor } from "@workspace/core/review/describe"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { useAddComment } from "@/lib/review/use-add-comment"

export function Composer({ session }: { session: Session }) {
  const anchor = useReviewUi((s) => s.anchor)
  const composeTick = useReviewUi((s) => s.composeTick)
  const setAnchor = useReviewUi((s) => s.setAnchor)
  const assets = useAssets()
  const add = useAddComment()
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composeTick > 0) box.current?.focus()
  }, [composeTick])

  const place = describeAnchor(anchor, session.timeline, assets)

  const send = async (draft: { text: string }) => {
    if (saving || !draft.text.trim()) return
    setSaving(true)
    try {
      const id = await add({ ...draft, anchor })
      if (!id) return
      setText("")
      setAnchor(null)
      useReviewUi.getState().focus(id)
    } catch (error) {
      toast.error("评论没有保存", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  // At rest the composer is one box. Picking a place or typing opens the rest of it.
  const open = !!anchor || !!text.trim()

  return (
    <div className="flex flex-col gap-2 border-t p-4">
      {anchor && (
        <div className="flex min-h-7 items-center gap-2">
          <span className="shrink-0 font-medium">{place.kind}</span>
          <span
            className="min-w-0 truncate text-muted-foreground tabular-nums"
            title={place.detail}
          >
            {place.detail}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="改为评论全片"
                  className="ml-auto"
                  onClick={() => setAnchor(null)}
                >
                  <X />
                </Button>
              }
            />
            <TooltipContent>改为评论全片 Esc</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Textarea
        ref={box}
        value={text}
        placeholder={anchor ? "哪里不对，或者想要什么" : "评论全片，或先在时间轴上选个位置"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send({ text })
          if (e.key === "Escape") e.currentTarget.blur()
        }}
      />

      {open && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  disabled={saving || !text.trim()}
                  onClick={() => void send({ text })}
                >
                  添加评论
                </Button>
              }
            />
            <TooltipContent>⌘ Enter</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
