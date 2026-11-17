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

/**
 * One difference between two versions. `track` is the track it is on in the newer version, or in
 * the older one for a removal. A split is one older clip recut into several pieces of the same
 * source span; `clip` is its first piece, so seeking and sorting treat it like any other change.
 */
export type ClipChange =
  | { kind: "added"; track: string; clip: Clip }
  | { kind: "removed"; track: string; clip: Clip }
  | { kind: "changed"; track: string; clip: Clip; before: Clip; fields: ClipField[] }
  | { kind: "split"; track: string; clip: Clip; before: Clip; pieces: Clip[] }

export type TimelineDiff = {
  /** Every difference, in the order they play. */
  changes: ClipChange[]
  /** The change each clip of the newer version belongs to, by clip id, for marking its lane. */
  byClip: Map<string, ClipChange>
}

type Placed = { track: string; clip: Clip }

/**
 * Clip ids are stable across versions (format.md requires it), so the diff matches on them first.
 * A clip under a new id whose source span lies inside an older clip's span of the same asset was
 * cut out of that clip, so it counts as part of a split, not as new material.
 */
export function diffTimelines(older: Timeline, newer: Timeline): TimelineDiff {
  const before = placed(older)
  const after = placed(newer)

  // New-id clips taken from inside an older clip, grouped by that clip's id.
  const cutFrom = new Map<string, Placed[]>()
  for (const entry of after.values()) {
    if (before.has(entry.clip.id)) continue
    const parent = container(entry.clip, before.values(), after)
    if (parent) cutFrom.set(parent.clip.id, [...(cutFrom.get(parent.clip.id) ?? []), entry])
  }

  const changes: ClipChange[] = []
  // Older and newer ids already accounted for by a split, kept apart since an id can be reused.
  const doneBefore = new Set<string>()
  const doneAfter = new Set<string>()
  for (const [id, cut] of cutFrom) {
    const prev = before.get(id)!
    const kept = after.get(id)
    const pieces = [...cut]
    if (kept && within(kept.clip, prev.clip)) pieces.push(kept)
    pieces.sort((a, b) => a.clip.start - b.clip.start)
    for (const piece of pieces) doneAfter.add(piece.clip.id)
    doneBefore.add(id)
    if (pieces.length === 1) {
      // Recut under a new id: one clip became one shorter clip, which reads as a change.
      const change = changed(prev, pieces[0]!)
      if (change) changes.push(change)
      continue
    }
    changes.push({
      kind: "split",
      track: pieces[0]!.track,
      clip: pieces[0]!.clip,
      before: prev.clip,
      pieces: pieces.map((p) => p.clip),
    })
  }

  for (const entry of after.values()) {
    if (doneAfter.has(entry.clip.id)) continue
    const prev = before.get(entry.clip.id)
    if (!prev) changes.push({ kind: "added", ...entry })
    else {
      const change = changed(prev, entry)
      if (change) changes.push(change)
    }
  }
  for (const entry of before.values())
    if (!doneBefore.has(entry.clip.id) && !after.has(entry.clip.id))
      changes.push({ kind: "removed", ...entry })

  changes.sort((a, b) => a.clip.start - b.clip.start)
  const byClip = new Map<string, ClipChange>()
  for (const change of changes) {
    if (change.kind === "removed") continue
    for (const clip of change.kind === "split" ? change.pieces : [change.clip])
      byClip.set(clip.id, change)
  }
  return { changes, byClip }
}

function placed(timeline: Timeline) {
  const map = new Map<string, Placed>()
  for (const track of timeline.tracks)
    for (const clip of track.clips) map.set(clip.id, { track: track.id, clip })
  return map
}

function changed(prev: Placed, next: Placed): ClipChange | undefined {
  const fields = (Object.keys(FIELD_KEYS) as ClipField[]).filter((field) =>
    field === "track"
      ? prev.track !== next.track
      : FIELD_KEYS[field].some((key) => !same(prev.clip[key], next.clip[key]))
  )
  return fields.length > 0 ? { kind: "changed", ...next, before: prev.clip, fields } : undefined
}

/**
 * The tightest older clip whose source span holds this clip's, if any. An older clip whose own id
 * still plays the overlapping footage is not a parent: the new clip repeats that footage instead.
 */
function container(clip: Clip, candidates: Iterable<Placed>, after: Map<string, Placed>) {
  let best: Placed | undefined
  for (const entry of candidates) {
    if (!within(clip, entry.clip)) continue
    const kept = after.get(entry.clip.id)
    if (kept && overlaps(clip, kept.clip)) continue
    if (!best || length(entry.clip) < length(best.clip)) best = entry
  }
  return best
}

const EPSILON = 1e-3

function within(inner: Clip, outer: Clip) {
  if (!inner.asset || inner.asset !== outer.asset) return false
  if (inner.in === undefined || outer.in === undefined) return false
  return inner.in >= outer.in - EPSILON && sourceOut(inner) <= sourceOut(outer) + EPSILON
}

function overlaps(a: Clip, b: Clip) {
  if (!a.asset || a.asset !== b.asset || a.in === undefined || b.in === undefined) return false
  return a.in < sourceOut(b) - EPSILON && b.in < sourceOut(a) - EPSILON
}

/** Where the clip stops reading its asset; a clip without `out` plays at normal speed. */
function sourceOut(clip: Clip) {
  return clip.out ?? (clip.in ?? 0) + (clip.end - clip.start)
}

function length(clip: Clip) {
  return sourceOut(clip) - (clip.in ?? 0)
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}
