import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import {
  MentionEditor,
  type MentionEditorHandle,
  type MentionItem,
  type MentionSegment,
} from "@workspace/ui/components/mention-editor"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { ArrowUp, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { useAssets, useProjectPath } from "@/lib/project/hooks"
import { describeAnchor } from "@workspace/core/review/describe"
import { writeMentions } from "@workspace/core/review/mentions"
import { ASSET_KIND_LABEL } from "@workspace/core/schema"
import { assetLabel } from "../sidebar/asset-viewer"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { useAddComment } from "@/lib/review/use-add-comment"

export function Composer({ session }: { session: Session }) {
  const anchor = useReviewUi((s) => s.anchor)
  const composeTick = useReviewUi((s) => s.composeTick)
  const setAnchor = useReviewUi((s) => s.setAnchor)
  const assets = useAssets()
  const add = useAddComment()
  const quote = useReviewUi((s) => s.quote)
  const p = useProjectPath()
  const [segments, setSegments] = useState<MentionSegment[]>([])
  const [saving, setSaving] = useState(false)
  const box = useRef<MentionEditorHandle>(null)
  const text = writeMentions(segments)

  useEffect(() => {
    if (composeTick > 0) box.current?.focus()
  }, [composeTick])

  // "引用到评论" in the asset viewer drops the asset here as a chip.
  useEffect(() => {
    if (quote) box.current?.insert(quote)
  }, [quote])

  // Every asset can be named with @, the ones the browser can't show included.
  const items: MentionItem[] = [...assets.values()].map((a) => ({
    id: a.id,
    label: assetLabel(a),
    description: ASSET_KIND_LABEL[a.kind],
    icon: <AssetIcon src={thumbOf(p, a)} />,
  }))

  const place = describeAnchor(anchor, session.timeline, assets)

  const send = async (draft: { text: string }) => {
    if (saving || !draft.text.trim()) return
    setSaving(true)
    try {
      const id = await add({ ...draft, anchor })
      if (!id) return
      box.current?.clear()
      setAnchor(null)
      useReviewUi.getState().focus(id)
    } catch (error) {
      toast.error("评论保存失败", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  // One field holds the whole draft: where it points, what it says, and its submit.
  return (
    <div className="px-4 pb-4">
      <InputGroup>
        {anchor && (
          <InputGroupAddon align="block-start">
            <InputGroupText className="min-w-0">
              <span className="shrink-0 text-foreground">{place.kind}</span>
              <span className="truncate font-normal tabular-nums" title={place.detail}>
                {place.detail}
              </span>
            </InputGroupText>
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="改为评论全片"
                    className="ml-auto"
                    onClick={() => setAnchor(null)}
                  >
                    <X />
                  </InputGroupButton>
                }
              />
              <TooltipContent>改为评论全片 Esc</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        )}
        <MentionEditor
          ref={box}
          items={items}
          aria-label="评论"
          placeholder={
            anchor
              ? "描述问题或想要的效果，@ 引用素材"
              : "评论全片，或在时间轴上选取位置；@ 引用素材"
          }
          onChange={setSegments}
          onSubmit={() => void send({ text })}
        />
        <InputGroupAddon align="block-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <InputGroupButton
                  size="icon-sm"
                  aria-label="添加评论"
                  className="ml-auto"
                  disabled={saving || !text.trim()}
                  onClick={() => void send({ text })}
                >
                  <ArrowUp />
                </InputGroupButton>
              }
            />
            <TooltipContent>添加评论 ⌘↵</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function thumbOf(p: string, asset: { kind: string; path: string; duration?: number }) {
  if (asset.kind === "image" || asset.kind === "sticker") return mediaUrl(p, asset.path)
  if (asset.kind === "video")
    return thumbUrl(p, asset.path, Math.min(1, (asset.duration ?? 2) / 2), 64)
  return undefined
}

function AssetIcon({ src }: { src?: string }) {
  return (
    <span className="flex h-4 w-7 shrink-0 overflow-hidden rounded-xs bg-surface-3">
      {src && <img src={src} alt="" loading="lazy" className="size-full object-cover" />}
    </span>
  )
}
