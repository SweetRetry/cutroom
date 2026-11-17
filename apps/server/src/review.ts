import { PATHS } from "@workspace/core/project/layout"
import { buildContext } from "@workspace/core/review/context"
import { mentionedIds } from "@workspace/core/review/mentions"
import { isSent, nextCommentId, roundPhase } from "@workspace/core/review/state"
import type { Anchor, ReviewComment, Round } from "@workspace/core/schema"
import { anchorSpan } from "@workspace/core/timeline/query"

import { frame } from "./media"
import { ProjectError, type Project } from "./project"

/**
 * What the reviewer can do. Each action checks the round's phase here, on the writer, so a
 * stale browser tab can't add to a round already sent to the editing side.
 */

/** The version under review, its timeline and the review files, or an error naming why not. */
async function currentRound(project: Project) {
  const graph = await project.versions()
  const version = graph?.current
  if (!version) throw new ProjectError("还没有版本，等第一版出来")
  const [timeline, working] = await Promise.all([project.timelineAt(version), project.working()])
  if (!timeline) throw new ProjectError(`${version.name} 的提交里没有 timeline.json`)
  const phase = roundPhase(version.name, working.comments, working.agent)
  return { graph: graph!, version, timeline, working, phase }
}

/** Open until the next version is out; sending doesn't close it, so a late thought can follow. */
async function writable(project: Project) {
  const round = await currentRound(project)
  if (round.phase.kind === "done")
    throw new ProjectError(`${round.version.name} 已经出了 ${round.phase.result}，评论写在新版本上`)
  return round
}

export type NewComment = {
  text: string
  anchor: Anchor
  reopens?: string
  finding?: string
}

/**
 * Turns one sentence and a place into the full record Claude Code reads: the anchor, the
 * surroundings and a frame grab. The reviewer never types a timecode or a clip id.
 */
export async function addComment(project: Project, input: NewComment): Promise<ReviewComment> {
  const { version, timeline, working } = await writable(project)
  const text = input.text.trim()
  if (!text) throw new ProjectError("评论不能为空")
  const known = new Set(working.assets.assets.map((a) => a.id))
  const unknown = mentionedIds(text).filter((id) => !known.has(id))
  if (unknown.length) throw new ProjectError(`提到的素材不在 assets.json 里：${unknown.join("、")}`)

  const context = buildContext({
    anchor: input.anchor,
    timeline,
    assets: new Map(working.assets.assets.map((a) => [a.id, a])),
    comments: working.comments.comments,
    agent: working.agent,
  })

  return project.write(async () => {
    const file = (await project.working()).comments
    const id = nextCommentId(file.comments)
    const span = anchorSpan(input.anchor, timeline)
    const render = PATHS.render(version.name)
    if (span && (await project.exists(render))) {
      // A range or clip is shown by its middle; a point, cut or region by its exact frame.
      const kind = input.anchor.kind
      const at = kind === "range" || kind === "clip" ? (span.start + span.end) / 2 : span.start
      try {
        const path = `${PATHS.frames}/${id}.png`
        await project.putFile(path, await frame(project, render, at, input.anchor.region))
        context.frame = path
      } catch {
        // The comment still carries its anchor and context; Claude Code can render the frame.
      }
    }
    const comment: ReviewComment = {
      id,
      version: version.name,
      text,
      anchor: input.anchor,
      context,
      createdAt: after(file.rounds.filter((r) => r.version === version.name)),
      ...(input.reopens && { reopens: input.reopens }),
      ...(input.finding && { finding: input.finding }),
    }
    await project.putJson(PATHS.comments, { ...file, comments: [...file.comments, comment] })
    return comment
  })
}

/**
 * Now, but always later than the version's last send: whether a comment went out is read from
 * that order (`isSent`), so one written in the same millisecond as a send must not count as sent.
 * The write queue makes this the only writer of both times.
 */
function after(sends: Round[]) {
  const last = Math.max(0, ...sends.map((r) => Date.parse(r.submittedAt)))
  return new Date(Math.max(Date.now(), last + 1)).toISOString()
}

export async function deleteDraft(project: Project, id: string) {
  const { version } = await writable(project)
  await project.updateComments((file) => {
    const target = file.comments.find((c) => c.id === id)
    if (!target || target.version !== version.name) throw new ProjectError(`${id} 不是本轮的评论`)
    if (isSent(target, file.rounds)) throw new ProjectError(`${id} 已经发给 Claude Code，不能删除`)
    return { ...file, comments: file.comments.filter((c) => c.id !== id) }
  })
}

/** Closing accepts Claude Code's reply; reopening is recorded after the follow-up comment exists. */
export async function resolve(project: Project, id: string, resolution: "closed" | "reopened") {
  await project.updateComments((file) => {
    if (!file.comments.some((c) => c.id === id)) throw new ProjectError(`没有评论 ${id}`)
    return { ...file, comments: file.comments.map((c) => (c.id === id ? { ...c, resolution } : c)) }
  })
}

/**
 * Sends the round's unsent comments to the editing side; `cutroom review` is waiting for this.
 * Sending again later adds another batch to the same round.
 */
export async function send(project: Project) {
  const { version, working } = await writable(project)
  const { comments, rounds } = working.comments
  const drafts = comments.filter((c) => c.version === version.name && !isSent(c, rounds))
  if (drafts.length === 0) throw new ProjectError("没有未发送的评论")
  await project.updateComments((file) => ({
    ...file,
    rounds: [...file.rounds, { version: version.name, submittedAt: new Date().toISOString() }],
  }))
  return { count: drafts.length, listening: project.listening }
}

export async function dismissFinding(project: Project, id: string) {
  await writable(project)
  await project.updateComments((file) => ({
    ...file,
    dismissed: [...new Set([...file.dismissed, id])],
  }))
}
