import type { Clip, Timeline } from "../schema"

/** What about a clip can differ, grouped the way a reviewer reads it. */
export type ClipField = "track" | "time" | "source" | "content" | "beats"

export const CLIP_FIELD_LABEL: Record<ClipField, string> = {
  track: "轨道",
  time: "时间",
  source: "素材与入出点",
  content: "内容",
  beats: "节拍点",
}

const FIELD_KEYS: Record<ClipField, (keyof Clip)[]> = {
  track: [],
  time: ["start", "end"],
  source: ["asset", "in", "out"],
  content: ["label", "text", "effect", "transition"],
  beats: ["beats"],
}

/** One clip that differs between two versions. `track` is the track it is on in that version. */
export type ClipChange =
  | { kind: "added"; track: string; clip: Clip }
  | { kind: "removed"; track: string; clip: Clip }
  | { kind: "changed"; track: string; clip: Clip; before: Clip; fields: ClipField[] }

export type TimelineDiff = {
  /** Every difference, in the order they play. */
  changes: ClipChange[]
  /** Added and changed clips of the newer version, by clip id, for marking them on its lanes. */
  byClip: Map<string, ClipChange>
}

/** Clip ids are stable across versions (CLAUDE.md requires it), so the diff matches on them. */
export function diffTimelines(older: Timeline, newer: Timeline): TimelineDiff {
  const before = new Map<string, { track: string; clip: Clip }>()
  for (const track of older.tracks)
    for (const clip of track.clips) before.set(clip.id, { track: track.id, clip })

  const changes: ClipChange[] = []
  const seen = new Set<string>()
  for (const track of newer.tracks) {
    for (const clip of track.clips) {
      seen.add(clip.id)
      const prev = before.get(clip.id)
      if (!prev) {
        changes.push({ kind: "added", track: track.id, clip })
        continue
      }
      const fields = (Object.keys(FIELD_KEYS) as ClipField[]).filter((field) =>
        field === "track"
          ? prev.track !== track.id
          : FIELD_KEYS[field].some((key) => !same(prev.clip[key], clip[key]))
      )
      if (fields.length > 0)
        changes.push({ kind: "changed", track: track.id, clip, before: prev.clip, fields })
    }
  }
  for (const entry of before.values())
    if (!seen.has(entry.clip.id)) changes.push({ kind: "removed", ...entry })

  changes.sort((a, b) => a.clip.start - b.clip.start)
  return {
    changes,
    byClip: new Map(changes.filter((c) => c.kind !== "removed").map((c) => [c.clip.id, c])),
  }
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}
