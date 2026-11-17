import { parseMentions } from "@workspace/core/review/mentions"
import { Fragment } from "react"

import { useReviewUi } from "@/lib/review/ui-store"

/**
 * Comment and reply text, with each `@[name](id)` drawn as the chip it was typed as. A chip
 * opens its asset full screen.
 */
export function RichText({ text }: { text: string }) {
  const openAsset = useReviewUi((s) => s.openAsset)
  return (
    <span className="whitespace-pre-wrap">
      {parseMentions(text).map((part, i) =>
        part.type === "text" ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : (
          <button
            key={i}
            type="button"
            title="查看素材"
            className="rounded-sm bg-surface-3 px-1 py-px font-medium text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              openAsset(part.id)
            }}
          >
            @{part.label}
          </button>
        )
      )}
    </span>
  )
}
