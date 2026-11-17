import { z } from "zod"

/**
 * The files the review app and Claude Code exchange. Each file has exactly one writer:
 * Claude Code writes the timeline, the asset index and `review/agent.json`; the app writes
 * `review/comments.json` and the frame captures. Times are seconds from the start of the cut.
 */

const seconds = z.number().nonnegative()

// ── Timeline (Claude Code writes `timeline.json`) ─────────────────────────────

const TRACK_KINDS = ["video", "overlay", "text", "voice", "music", "effect"] as const
export type TrackKind = (typeof TRACK_KINDS)[number]

export const TRACK_KIND_LABEL: Record<TrackKind, string> = {
  video: "视频主轨",
  overlay: "叠加",
  text: "字幕与文字",
  voice: "对白与旁白",
  music: "音乐与音效",
  effect: "特效",
}

const clip = z.object({
  id: z.string().min(1),
  start: seconds,
  end: seconds,
  /** Shown on the clip; defaults to the asset name, the text or the effect name. */
  label: z.string().optional(),
  /** Asset id from `assets.json`, for media clips. */
  asset: z.string().optional(),
  /** The span of the source asset this clip plays, in the asset's own seconds. */
  in: seconds.optional(),
  out: seconds.optional(),
  /** Text and subtitle clips. */
  text: z.string().optional(),
  /** Effect clips: the effect's name ("叠化", "暗角"). */
  effect: z.string().optional(),
  /** An effect clip that sits on the cut between two clips. */
  transition: z.boolean().optional(),
  /** Music clips: beat times inside the cut. */
  beats: z.array(seconds).optional(),
})
export type Clip = z.infer<typeof clip>

const track = z.object({
  id: z.string().min(1),
  kind: z.enum(TRACK_KINDS),
  name: z.string().optional(),
  clips: z.array(clip),
})
export type Track = z.infer<typeof track>

export const timelineSchema = z.object({
  fps: z.number().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  duration: seconds,
  tracks: z.array(track),
  /** Snap points for selecting a range: scene cuts and music beats. */
  markers: z
    .object({ scenes: z.array(seconds).default([]), beats: z.array(seconds).default([]) })
    .prefault({}),
})
export type Timeline = z.infer<typeof timelineSchema>

// ── Assets (Claude Code writes `assets.json`) ─────────────────────────────────

export const ASSET_ORIGINS = ["user", "fetched", "generated"] as const
export type AssetOrigin = (typeof ASSET_ORIGINS)[number]

export const ASSET_ORIGIN_LABEL: Record<AssetOrigin, string> = {
  user: "导入",
  fetched: "搜索获取",
  generated: "代码创建",
}

const asset = z.object({
  id: z.string().min(1),
  /** Relative to the project folder. */
  path: z.string().min(1),
  kind: z.enum(["video", "image", "audio", "font", "sticker", "other"]),
  origin: z.enum(ASSET_ORIGINS),
  name: z.string().optional(),
  duration: seconds.optional(),
  /** Assets of the same shot share a group, so "换一个试试" has somewhere to look. */
  group: z.string().optional(),
  summary: z.string().optional(),
  /** Required for fetched assets: where it came from and under which license. */
  source: z.object({ url: z.string(), license: z.string() }).optional(),
})
export type Asset = z.infer<typeof asset>

export const assetIndexSchema = z.object({ assets: z.array(asset) })
export type AssetIndex = z.infer<typeof assetIndexSchema>

// ── Anchors and comments (the app writes `review/comments.json`) ──────────────

const ANCHOR_KINDS = ["point", "range", "clip", "seam", "region", "track", "global"] as const
export type AnchorKind = (typeof ANCHOR_KINDS)[number]

export const ANCHOR_KIND_LABEL: Record<AnchorKind, string> = {
  point: "时间点",
  range: "时间段",
  clip: "片段",
  seam: "接缝",
  region: "画面区域",
  track: "整条轨道",
  global: "全片",
}

const region = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
})
export type Region = z.infer<typeof region>

export const anchorSchema = z.object({
  kind: z.enum(ANCHOR_KINDS),
  time: z.object({ start: seconds, end: seconds }).optional(),
  track: z.string().optional(),
  clip: z.string().optional(),
  seam: z.tuple([z.string(), z.string()]).optional(),
  region: region.optional(),
  /** A comment about an asset itself ("这首歌太吵"), from the asset list. */
  asset: z.string().optional(),
})
export type Anchor = z.infer<typeof anchorSchema>

export const INTENTS = ["issue", "change", "add", "feel", "keep", "question"] as const
export type Intent = (typeof INTENTS)[number]

export const INTENT_LABEL: Record<Intent, string> = {
  issue: "问题",
  change: "修改",
  add: "添加",
  feel: "感觉",
  keep: "保留",
  question: "提问",
}

/** Filled in by the app when a comment is written, so Claude Code needn't look anything up. */
const context = z.object({
  /** PNG of the anchor's first frame with the region drawn on it, relative to the project. */
  frame: z.string().optional(),
  source: z.object({ asset: z.string(), path: z.string(), in: seconds, out: seconds }).optional(),
  neighbors: z.array(z.string()).default([]),
  /** What else plays at the anchor, per track: subtitle text, music, effects. */
  concurrent: z
    .array(z.object({ track: z.string(), clip: z.string(), label: z.string() }))
    .default([]),
  /** Earlier comments at the same place, with what Claude Code replied. */
  history: z
    .array(
      z.object({
        comment: z.string(),
        version: z.string(),
        text: z.string(),
        reply: z.string().optional(),
      })
    )
    .default([]),
})
export type CommentContext = z.infer<typeof context>

const comment = z.object({
  id: z.string().regex(/^c-\d+$/),
  /** The version this comment was written on; it is also the round it belongs to. */
  version: z.string(),
  intent: z.enum(INTENTS),
  text: z.string(),
  anchor: anchorSchema,
  context,
  createdAt: z.string(),
  /** Set when the comment re-raises an earlier one that came back unsatisfying. */
  reopens: z.string().optional(),
  /** Set when the comment confirms one of Claude Code's own findings. */
  finding: z.string().optional(),
  /** The reviewer's verdict on Claude Code's reply. */
  resolution: z.enum(["closed", "reopened"]).optional(),
})
export type ReviewComment = z.infer<typeof comment>

/** A version whose comments the reviewer has sent to the editing side. */
const round = z.object({
  version: z.string(),
  submittedAt: z.string(),
})
export type Round = z.infer<typeof round>

export const commentsFileSchema = z.object({
  comments: z.array(comment).default([]),
  rounds: z.array(round).default([]),
  /** Findings the reviewer marked "没关系". */
  dismissed: z.array(z.string()).default([]),
})
export type CommentsFile = z.infer<typeof commentsFileSchema>

// ── Claude Code's side of the review (`review/agent.json`) ────────────────────

const reply = z.object({
  comment: z.string(),
  text: z.string(),
  /** False when the comment was not carried out; `text` then says why. */
  done: z.boolean(),
})

export const replySchema = reply
export type Reply = z.infer<typeof reply>

const agentRound = z.object({
  version: z.string(),
  replies: z.array(reply).default([]),
  /** The version this round produced. */
  result: z.string().optional(),
})
export type AgentRound = z.infer<typeof agentRound>

const finding = z.object({
  id: z.string().regex(/^f-\d+$/),
  version: z.string(),
  kind: z.string(),
  text: z.string(),
  anchor: anchorSchema,
})
export type Finding = z.infer<typeof finding>

export const agentFileSchema = z.object({
  rounds: z.array(agentRound).default([]),
  findings: z.array(finding).default([]),
})
export type AgentFile = z.infer<typeof agentFileSchema>
