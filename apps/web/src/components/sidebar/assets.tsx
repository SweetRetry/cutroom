import { useState } from "react"

import {
  ASSET_KIND_LABEL,
  ASSET_ORIGINS,
  ASSET_ORIGIN_LABEL,
  type Asset,
} from "@workspace/core/schema"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { useProjectData, useProjectPath } from "@/lib/project/hooks"
import type { Session } from "@/lib/review/session"
import { AssetViewer, VIEWABLE } from "./asset-viewer"

/**
 * Every asset, whoever brought it in, for reference while reviewing. Claude Code indexes them;
 * a downloaded one links its license. Origins get headings only when there is more than one.
 */
export function AssetList({ session }: { session: Session }) {
  const { data } = useProjectData()
  const assets = data?.assets.assets ?? []
  const used = new Set(session.timeline?.tracks.flatMap((t) => t.clips.map((c) => c.asset)) ?? [])
  const origins = ASSET_ORIGINS.filter((o) => assets.some((a) => a.origin === o))
  // The viewer steps through what can be shown, in the order the list shows it.
  const viewable = origins.flatMap((o) =>
    assets.filter((a) => a.origin === o && VIEWABLE.has(a.kind))
  )
  const [viewing, setViewing] = useState<number>()

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
                <AssetRow
                  key={a.id}
                  asset={a}
                  used={used.has(a.id)}
                  onOpen={VIEWABLE.has(a.kind) ? () => setViewing(viewable.indexOf(a)) : undefined}
                />
              ))}
          </ul>
        </section>
      ))}
      <AssetViewer assets={viewable} index={viewing} onIndex={setViewing} />
    </div>
  )
}

function AssetRow({ asset, used, onOpen }: { asset: Asset; used: boolean; onOpen?: () => void }) {
  const p = useProjectPath()
  const thumb =
    asset.kind === "image" || asset.kind === "sticker"
      ? mediaUrl(p, asset.path)
      : asset.kind === "video"
        ? thumbUrl(p, asset.path, Math.min(1, (asset.duration ?? 2) / 2), 128)
        : undefined

  return (
    <li className="-mx-2 flex flex-col gap-1">
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="flex gap-2 rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent"
      >
        <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2 text-xs text-subtle-foreground">
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            ASSET_KIND_LABEL[asset.kind]
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
        </div>
      </button>
      {asset.source && (
        <a
          href={asset.source.url}
          target="_blank"
          rel="noreferrer"
          className="link ml-20 self-start text-xs text-muted-foreground"
        >
          {asset.source.license}
        </a>
      )}
    </li>
  )
}
