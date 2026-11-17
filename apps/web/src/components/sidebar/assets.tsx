import { Button } from "@workspace/ui/components/button"
import { ASSET_ORIGINS, ASSET_ORIGIN_LABEL, type Asset } from "@workspace/core/schema"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { useProjectData, useProjectPath } from "@/lib/project/hooks"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"

/**
 * Every asset, whoever brought it in. Claude Code indexes them; a fetched one shows where it
 * came from and its license. "评论" attaches the next comment to the asset itself.
 */
export function AssetList({ session }: { session: Session }) {
  const { data } = useProjectData()
  const assets = data?.assets.assets ?? []
  const used = new Set(session.timeline?.tracks.flatMap((t) => t.clips.map((c) => c.asset)) ?? [])

  if (assets.length === 0) {
    return <p className="px-4 text-muted-foreground">还没有素材索引。</p>
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      {ASSET_ORIGINS.map((origin) => {
        const group = assets.filter((a) => a.origin === origin)
        if (group.length === 0) return null
        return (
          <section key={origin} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {ASSET_ORIGIN_LABEL[origin]}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.map((a) => (
                <AssetRow key={a.id} asset={a} used={used.has(a.id)} editable={session.editable} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AssetRow({ asset, used, editable }: { asset: Asset; used: boolean; editable: boolean }) {
  const p = useProjectPath()
  const thumb =
    asset.kind === "image" || asset.kind === "sticker"
      ? mediaUrl(p, asset.path)
      : asset.kind === "video"
        ? thumbUrl(p, asset.path, Math.min(1, (asset.duration ?? 2) / 2), 128)
        : undefined

  return (
    <li className="group flex gap-2">
      <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2 text-xs text-subtle-foreground">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          asset.kind
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="truncate">{asset.name ?? asset.path.split("/").pop()}</span>
          {asset.duration !== undefined && (
            <span className="ml-auto shrink-0 text-xs text-subtle-foreground tabular-nums">
              {asset.duration.toFixed(1)}s
            </span>
          )}
        </span>
        {asset.summary && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{asset.summary}</span>
        )}
        {asset.source && (
          <a
            href={asset.source.url}
            target="_blank"
            rel="noreferrer"
            className="link self-start text-xs text-muted-foreground"
          >
            {asset.source.license}
          </a>
        )}
        <span className="flex items-center gap-2 text-xs text-subtle-foreground">
          {asset.group && <span>{asset.group}</span>}
          {!used && <span>未使用</span>}
          {editable && (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() =>
                useReviewUi.getState().setAnchor({ kind: "global", asset: asset.id }, true)
              }
            >
              评论
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}
