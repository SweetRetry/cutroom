import type { AgentFile, Anchor, Asset, CommentContext, ReviewComment, Timeline } from "../schema"
import { anchorSpan, clipLabel, findClip, overlaps } from "../timeline/query"

type Inputs = {
  anchor: Anchor
  timeline: Timeline
  assets: Map<string, Asset>
  comments: ReviewComment[]
  agent: AgentFile
}

/**
 * The surroundings the reviewer would otherwise have to spell out: which source the shot comes
 * from, what sits next to it, what else plays at that moment and what was said here before.
 * The frame capture is added separately, after it is written to disk.
 */
export function buildContext({
  anchor,
  timeline,
  assets,
  comments,
  agent,
}: Inputs): CommentContext {
  const span = anchorSpan(anchor, timeline)
  const subject = subjectClip(anchor, timeline, span)

  const context: CommentContext = { neighbors: [], concurrent: [], history: [] }

  if (subject) {
    const sorted = [...subject.track.clips].sort((a, b) => a.start - b.start)
    const i = sorted.findIndex((c) => c.id === subject.clip.id)
    context.neighbors = [sorted[i - 1]?.id, sorted[i + 1]?.id].filter((id): id is string => !!id)
    const { clip } = subject
    const asset = clip.asset ? assets.get(clip.asset) : undefined
    if (asset && clip.in !== undefined && clip.out !== undefined) {
      context.source = { asset: asset.id, path: asset.path, in: clip.in, out: clip.out }
    }
  }

  if (span) {
    for (const track of timeline.tracks) {
      if (subject && track.id === subject.track.id) continue
      for (const clip of track.clips) {
        if (overlaps(span, clip)) {
          context.concurrent.push({
            track: track.id,
            clip: clip.id,
            label: clipLabel(track, clip, assets),
          })
        }
      }
    }
  }

  for (const earlier of comments) {
    if (!samePlace(anchor, span, earlier.anchor, timeline)) continue
    const reply = agent.rounds
      .find((r) => r.version === earlier.version)
      ?.replies.find((r) => r.comment === earlier.id)
    context.history.push({
      comment: earlier.id,
      version: earlier.version,
      text: earlier.text,
      reply: reply?.text,
    })
  }

  return context
}

/** The clip a comment is about: the clicked one, or the main-track shot under its start. */
function subjectClip(anchor: Anchor, timeline: Timeline, span: { start: number } | undefined) {
  if (anchor.clip) return findClip(timeline, anchor.clip)
  if (anchor.seam) return findClip(timeline, anchor.seam[0])
  if (!span) return undefined
  const main = timeline.tracks.find((t) => t.kind === "video")
  const clip = main?.clips.find((c) => c.start <= span.start && span.start < c.end)
  return main && clip ? { track: main, clip, index: main.clips.indexOf(clip) } : undefined
}

function samePlace(
  anchor: Anchor,
  span: { start: number; end: number } | undefined,
  other: Anchor,
  timeline: Timeline
): boolean {
  if (anchor.clip && other.clip === anchor.clip) return true
  if (anchor.kind === "global" || other.kind === "global") return false
  if (anchor.kind === "track" || other.kind === "track") return anchor.track === other.track
  const otherSpan = anchorSpan(other, timeline)
  return !!span && !!otherSpan && overlaps(span, otherSpan)
}
