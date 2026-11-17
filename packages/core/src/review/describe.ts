import {
  ANCHOR_KIND_LABEL,
  TRACK_KIND_LABEL,
  type Anchor,
  type Asset,
  type Timeline,
} from "../schema"
import { clipLabel, findClip, formatTime } from "../timeline/query"

/** "片段 海边远景 00:04.2–00:09.8": what the reviewer reads back before sending a comment. */
export function describeAnchor(
  anchor: Anchor | null,
  timeline: Timeline | undefined,
  assets: Map<string, Asset>
) {
  if (!anchor) return { kind: ANCHOR_KIND_LABEL.global, detail: "" }
  const kind = ANCHOR_KIND_LABEL[anchor.kind]
  const time = anchor.time
    ? anchor.time.end - anchor.time.start < 0.05
      ? formatTime(anchor.time.start)
      : `${formatTime(anchor.time.start)}–${formatTime(anchor.time.end)}`
    : ""

  const name = (clipId: string) => {
    const hit = timeline && findClip(timeline, clipId)
    return hit ? clipLabel(hit.track, hit.clip, assets) : clipId
  }

  if (anchor.asset) return { kind: "素材", detail: assets.get(anchor.asset)?.name ?? anchor.asset }
  switch (anchor.kind) {
    case "clip":
      return { kind, detail: `${name(anchor.clip!)} ${time}`.trim() }
    case "seam":
      return { kind, detail: `${name(anchor.seam![0])} 和 ${name(anchor.seam![1])} 之间` }
    case "track": {
      const track = timeline?.tracks.find((t) => t.id === anchor.track)
      return {
        kind,
        detail: track ? (track.name ?? TRACK_KIND_LABEL[track.kind]) : (anchor.track ?? ""),
      }
    }
    default:
      return { kind, detail: time }
  }
}
