import type { Anchor, Asset, Clip, Timeline, Track } from "../schema"

/** `mm:ss.f`, the precision a reviewer reads and the format the concept doc uses. */
export function formatTime(t: number): string {
  const tenths = Math.floor(Math.max(0, t) * 10 + 1e-6)
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths % 10}`
}

export function clipLabel(track: Track, clip: Clip, assets: Map<string, Asset>): string {
  if (clip.label) return clip.label
  if (track.kind === "text" && clip.text) return clip.text
  if (track.kind === "effect" && clip.effect) return clip.effect
  const asset = clip.asset ? assets.get(clip.asset) : undefined
  return asset?.name ?? asset?.path.split("/").pop() ?? clip.id
}

export function findClip(timeline: Timeline, clipId: string) {
  for (const track of timeline.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId)
    if (index >= 0) return { track, clip: track.clips[index]!, index }
  }
  return undefined
}

/** The time span an anchor covers, if it has one. */
export function anchorSpan(
  anchor: Anchor,
  timeline: Timeline
): { start: number; end: number } | undefined {
  if (anchor.time) return anchor.time
  if (anchor.clip) {
    const hit = findClip(timeline, anchor.clip)
    if (hit) return { start: hit.clip.start, end: hit.clip.end }
  }
  if (anchor.seam) {
    const hit = findClip(timeline, anchor.seam[0])
    if (hit) return { start: hit.clip.end, end: hit.clip.end }
  }
  return undefined
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  // A point (start === end) overlaps a span it lies inside, edges included.
  return a.start <= b.end && b.start <= a.end
}

/** Snap a time to the nearest scene cut, beat or clip edge within `tolerance` seconds. */
export function snapPoints(timeline: Timeline): number[] {
  const points = new Set<number>([
    0,
    timeline.duration,
    ...timeline.markers.scenes,
    ...timeline.markers.beats,
  ])
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      points.add(clip.start)
      points.add(clip.end)
      for (const beat of clip.beats ?? []) points.add(beat)
    }
  }
  return [...points].sort((a, b) => a - b)
}

export function snap(t: number, points: number[], tolerance: number): number {
  let best = t
  let bestDistance = tolerance
  for (const p of points) {
    const d = Math.abs(p - t)
    if (d <= bestDistance) {
      best = p
      bestDistance = d
    }
  }
  return best
}

/** Seams are the cuts between touching clips on the same track. */
export function seams(track: Track): Array<{ left: Clip; right: Clip; at: number }> {
  const sorted = [...track.clips].sort((a, b) => a.start - b.start)
  const out: Array<{ left: Clip; right: Clip; at: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    const left = sorted[i - 1]!
    const right = sorted[i]!
    if (Math.abs(right.start - left.end) < 0.05) out.push({ left, right, at: right.start })
  }
  return out
}

/** Waveform resolution the service computes and the timeline draws. */
export const PEAKS_PER_SECOND = 40

/**
 * Overlapping clips of one track, stacked: each clip goes on the first lane that is free at its
 * start. `room` is how many seconds the clip's lane stays free from its start, so a short clip's
 * name can run on past its end until the next clip on that lane.
 */
export function packLanes(clips: Clip[]) {
  const ends: number[] = []
  const lane = new Map<string, number>()
  for (const clip of [...clips].sort((a, b) => a.start - b.start || b.end - a.end)) {
    let i = ends.findIndex((end) => end <= clip.start + 1e-6)
    if (i < 0) i = ends.push(0) - 1
    ends[i] = clip.end
    lane.set(clip.id, i)
  }
  const room = new Map<string, number>()
  for (const clip of clips) {
    const next = clips
      .filter((c) => lane.get(c.id) === lane.get(clip.id) && c.start > clip.start)
      .reduce((min, c) => Math.min(min, c.start), Infinity)
    room.set(clip.id, next - clip.start)
  }
  return { count: Math.max(1, ends.length), lane, room }
}

/** The name before a colon: "打击震屏：s1 群战爆裂…" reads as "打击震屏" on a crowded lane. */
export function shortLabel(label: string) {
  const head = label.split(/[：:]/)[0]!.trim()
  return head || label
}
