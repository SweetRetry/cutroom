import { ASSET_ORIGINS, ASSET_ORIGIN_LABEL, type Asset } from "@workspace/core/schema"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { useProjectData, useProjectPath } from "@/lib/project/hooks"
import type { Session } from "@/lib/review/session"

/**
 * Every asset, whoever brought it in, for reference while reviewing. Claude Code indexes them;
 * a downloaded one links its license. Origins get headings only when there is more than one.
 */
export function AssetList({ session }: { session: Session }) {
  const { data } = useProjectData()
  const assets = data?.assets.assets ?? []
  const used = new Set(session.timeline?.tracks.flatMap((t) => t.clips.map((c) => c.asset)) ?? [])
  const origins = ASSET_ORIGINS.filter((o) => assets.some((a) => a.origin === o))

  if (assets.length === 0) return <p className="px-4 text-muted-foreground">暂无素材</p>

  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      {origins.map((origin) => (
        <section key={origin} className="flex flex-col gap-2">
          {origins.length > 1 && (
            <h3 className="text-xs font-medium text-muted-foreground">
              {ASSET_ORIGIN_LABEL[origin]}
            </h3>
          )}
          <ul className="flex flex-col gap-3">
            {assets
              .filter((a) => a.origin === origin)
              .map((a) => (
                <AssetRow key={a.id} asset={a} used={used.has(a.id)} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function AssetRow({ asset, used }: { asset: Asset; used: boolean }) {
  const p = useProjectPath()
  const thumb =
    asset.kind === "image" || asset.kind === "sticker"
      ? mediaUrl(p, asset.path)
      : asset.kind === "video"
        ? thumbUrl(p, asset.path, Math.min(1, (asset.duration ?? 2) / 2), 128)
        : undefined

  return (
    <li className="flex gap-2">
      <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2 text-xs text-subtle-foreground">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          asset.kind
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate">{asset.name ?? asset.path.split("/").pop()}</span>
          {asset.duration !== undefined && (
            <span className="ml-auto shrink-0 text-xs text-subtle-foreground tabular-nums">
              {asset.duration.toFixed(1)}s
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-2 text-xs">
          <span className="truncate text-muted-foreground" title={asset.summary}>
            {asset.summary}
          </span>
          {!used && <span className="ml-auto shrink-0 text-subtle-foreground">未使用</span>}
        </span>
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
      </div>
    </li>
  )
}
