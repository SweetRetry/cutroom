import type { AgentFile, AgentRound, CommentsFile, ReviewComment, Round } from "../schema"

/**
 * One round reviews one version: the reviewer comments on it, submits the batch, Claude Code
 * plans, the reviewer decides, Claude Code executes and produces the next version. The phase is
 * derived from the two review files, never stored, so neither writer can leave it inconsistent.
 */
export type RoundPhase =
  | { kind: "drafting" }
  | { kind: "awaiting-plan" }
  | { kind: "plan-ready"; revision: number }
  | { kind: "objected"; revision: number }
  | { kind: "approved"; revision: number }
  | { kind: "done"; result: string }

export function roundPhase(version: string, comments: CommentsFile, agent: AgentFile): RoundPhase {
  const round = comments.rounds.find((r) => r.version === version)
  const agentRound = agent.rounds.find((r) => r.version === version)
  if (agentRound?.result) return { kind: "done", result: agentRound.result }
  if (!round) return { kind: "drafting" }
  if (!agentRound || agentRound.plan.length === 0) return { kind: "awaiting-plan" }
  const { revision } = agentRound
  const decision = round.decision
  if (!decision || decision.revision < revision) return { kind: "plan-ready", revision }
  return decision.status === "approved"
    ? { kind: "approved", revision }
    : { kind: "objected", revision }
}

/**
 * `missed` is a submitted comment the round finished without replying to. Claude Code must
 * explain every comment it doesn't carry out, so a missed comment is a broken contract the
 * reviewer has to see, not a quiet "pending".
 */
export type CommentStatus = "draft" | "pending" | "replied" | "missed" | "closed" | "reopened"

export const COMMENT_STATUS_LABEL: Record<CommentStatus, string> = {
  draft: "未提交",
  pending: "待处理",
  replied: "已处理",
  missed: "未回复",
  closed: "已关闭",
  reopened: "已重新打开",
}

export type CommentView = {
  comment: ReviewComment
  status: CommentStatus
  plan?: AgentRound["plan"][number]
  reply?: AgentRound["replies"][number]
}

export function commentView(
  comment: ReviewComment,
  rounds: Round[],
  agent: AgentFile
): CommentView {
  const agentRound = agent.rounds.find((r) => r.version === comment.version)
  const plan = agentRound?.plan.find((p) => p.comment === comment.id)
  const reply = agentRound?.replies.find((r) => r.comment === comment.id)
  return { comment, status: statusOf(comment, rounds, agentRound, reply), plan, reply }
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

/** Comments of a submitted round that the current plan revision says nothing about. */
export function unplanned(version: string, comments: CommentsFile, agent: AgentFile): string[] {
  const agentRound = agent.rounds.find((r) => r.version === version)
  if (!agentRound || agentRound.plan.length === 0) return []
  const planned = new Set(agentRound.plan.map((p) => p.comment))
  return comments.comments
    .filter((c) => c.version === version && !planned.has(c.id))
    .map((c) => c.id)
}

export function nextCommentId(comments: ReviewComment[]): string {
  const max = comments.reduce((m, c) => Math.max(m, Number(c.id.slice(2))), 0)
  return `c-${String(max + 1).padStart(2, "0")}`
}
