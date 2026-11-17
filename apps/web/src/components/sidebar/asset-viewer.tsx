import { Button } from "@workspace/ui/components/button"
import {
  Lightbox,
  LightboxClose,
  LightboxContent,
  LightboxDescription,
  LightboxTitle,
} from "@workspace/ui/components/lightbox"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"

import type { Asset } from "@workspace/core/schema"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { useProjectPath } from "@/lib/project/hooks"

/** Kinds the browser can show. A font or an unknown file has nothing to open. */
export const VIEWABLE = new Set<Asset["kind"]>(["video", "image", "sticker", "audio"])

/**
 * Looking at an asset the way an editor does: the whole window, the picture as large as it
 * fits, nothing around it. The arrow keys step through the list in the order the sidebar shows.
 */
export function AssetViewer({
  assets,
  index,
  onIndex,
}: {
  assets: Asset[]
  index: number | undefined
  onIndex: (index: number | undefined) => void
}) {
  const asset = index === undefined ? undefined : assets[index]
  // The last asset stays rendered while the viewer fades out.
  const [shown, setShown] = useState(asset)
  if (asset && asset !== shown) setShown(asset)
  // Pixel size read from the file once it loads; the index doesn't record it.
  const [sizes, setSizes] = useState<Record<string, string>>({})
  const step = (d: number) =>
    index !== undefined && onIndex((index + d + assets.length) % assets.length)

  return (
    <Lightbox open={!!asset} onOpenChange={(open) => !open && onIndex(undefined)}>
      <LightboxContent
        onKeyDown={(e) => {
          if (assets.length < 2 || e.target instanceof HTMLMediaElement) return
          if (e.key === "ArrowLeft") step(-1)
          else if (e.key === "ArrowRight") step(1)
        }}
      >
        {shown && (
          <>
            <header className="flex h-12 shrink-0 items-center gap-3 pr-2 pl-4">
              <LightboxTitle>{shown.name ?? shown.path.split("/").pop()}</LightboxTitle>
              {/* What the picture can't show by itself: how long and how many pixels. */}
              {shown.duration !== undefined && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {shown.duration.toFixed(1)}s
                </span>
              )}
              {sizes[shown.id] && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {sizes[shown.id]}
                </span>
              )}
              {shown.source && (
                <a
                  href={shown.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="link shrink-0 text-xs text-muted-foreground"
                >
                  {shown.source.license}
                </a>
              )}
              {assets.length > 1 && index !== undefined && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {index + 1} / {assets.length}
                </span>
              )}
              <LightboxClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="关闭（Esc）"
                    className={cn(assets.length < 2 && "ml-auto")}
                  />
                }
              >
                <X />
              </LightboxClose>
            </header>
            {/* Empty space around the picture closes, as in any viewer; Esc does the same. */}
            <div
              className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:px-4"
              onClick={(e) => {
                if (!(e.target as Element).closest("video, audio, img, button")) onIndex(undefined)
              }}
            >
              {assets.length > 1 && <Step dir={-1} onClick={() => step(-1)} />}
              <Media
                key={shown.id}
                asset={shown}
                onSize={(size) => setSizes((s) => ({ ...s, [shown.id]: size }))}
              />
              {assets.length > 1 && <Step dir={1} onClick={() => step(1)} />}
            </div>
            <div className="px-4 pt-3 pb-4">
              <LightboxDescription className="mx-auto max-w-3xl text-center">
                {shown.summary}
              </LightboxDescription>
            </div>
          </>
        )}
      </LightboxContent>
    </Lightbox>
  )
}

function Step({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("shrink-0", dir < 0 ? "order-first" : "order-last")}
      aria-label={dir < 0 ? "上一个（←）" : "下一个（→）"}
      onClick={onClick}
    >
      {dir < 0 ? <ChevronLeft /> : <ChevronRight />}
    </Button>
  )
}

/**
 * The asset at the largest size that fits. Video starts on its middle frame as a poster and
 * plays; a sticker sits on a checkerboard so its transparency shows.
 */
function Media({ asset, onSize }: { asset: Asset; onSize: (size: string) => void }) {
  const p = useProjectPath()
  const src = mediaUrl(p, asset.path)
  const measured = (w: number, h: number) => w > 0 && onSize(`${w}×${h}`)
  const fit = "max-h-full max-w-full min-w-0 object-contain"

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex h-full min-w-0 flex-1 items-center justify-center py-2"
    >
      {asset.kind === "video" ? (
        <video
          src={src}
          poster={thumbUrl(p, asset.path, Math.min(1, (asset.duration ?? 2) / 2), 640)}
          controls
          autoPlay
          className={fit}
          onLoadedMetadata={(e) =>
            measured(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
          }
        />
      ) : asset.kind === "audio" ? (
        <audio src={src} controls autoPlay className="w-full max-w-xl" />
      ) : (
        <img
          src={src}
          alt=""
          className={cn(fit, asset.kind === "sticker" && "checkerboard")}
          onLoad={(e) => measured(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        />
      )}
    </motion.div>
  )
}
