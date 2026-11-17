import type { AgentFile, AgentRound, CommentsFile, ReviewComment, Round } from "../schema"

/**
 * One round reviews one version: the reviewer comments on it and sends the batch, the editing
 * side works on it and produces the next version. The phase is derived from the two review
 * files, never stored, so neither writer can leave it inconsistent.
 */
export type RoundPhase = { kind: "drafting" } | { kind: "sent" } | { kind: "done"; result: string }

export function roundPhase(version: string, comments: CommentsFile, agent: AgentFile): RoundPhase {
  const result = agent.rounds.find((r) => r.version === version)?.result
  if (result) return { kind: "done", result }
  return comments.rounds.some((r) => r.version === version)
    ? { kind: "sent" }
    : { kind: "drafting" }
}

/**
 * `missed` is a submitted comment the round finished without replying to. Claude Code must
 * explain every comment it doesn't carry out, so a missed comment is a broken contract the
 * reviewer has to see, not a quiet "pending".
 */
export type CommentStatus = "draft" | "pending" | "replied" | "missed" | "closed" | "reopened"

export const COMMENT_STATUS_LABEL: Record<CommentStatus, string> = {
  draft: "未提交",
  pending: "已发送",
  replied: "已处理",
  missed: "未回复",
  closed: "已关闭",
  reopened: "已重新打开",
}

export type CommentView = {
  comment: ReviewComment
  status: CommentStatus
  reply?: AgentRound["replies"][number]
}

export function commentView(
  comment: ReviewComment,
  rounds: Round[],
  agent: AgentFile
): CommentView {
  const agentRound = agent.rounds.find((r) => r.version === comment.version)
  const reply = agentRound?.replies.find((r) => r.comment === comment.id)
  return { comment, status: statusOf(comment, rounds, agentRound, reply), reply }
}

function statusOf(
  comment: ReviewComment,
  rounds: Round[],
  agentRound: AgentRound | undefined,
  reply: CommentView["reply"]
): CommentStatus {
  if (comment.resolution) return comment.resolution
  if (!rounds.some((r) => r.version === comment.version)) return "draft"
  if (reply) return "replied"
  return agentRound?.result ? "missed" : "pending"
}

export function nextCommentId(comments: ReviewComment[]): string {
  const max = comments.reduce((m, c) => Math.max(m, Number(c.id.slice(2))), 0)
  return `c-${String(max + 1).padStart(2, "0")}`
}
