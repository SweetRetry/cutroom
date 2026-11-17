import { PATHS } from "@workspace/core/project/layout"
import { buildContext } from "@workspace/core/review/context"
import { nextCommentId, roundPhase } from "@workspace/core/review/state"
import type { Anchor, Intent, ReviewComment } from "@workspace/core/schema"
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

async function drafting(project: Project) {
  const round = await currentRound(project)
  if (round.phase.kind !== "drafting") throw new ProjectError("本轮已发出，等下一版再写评论")
  return round
}

export type NewComment = {
  intent: Intent
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
  const { version, timeline, working } = await drafting(project)
  const text = input.text.trim()
  if (!text) throw new ProjectError("评论不能为空")

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
      intent: input.intent,
      text,
      anchor: input.anchor,
      context,
      createdAt: new Date().toISOString(),
      ...(input.reopens && { reopens: input.reopens }),
      ...(input.finding && { finding: input.finding }),
    }
    await project.putJson(PATHS.comments, { ...file, comments: [...file.comments, comment] })
    return comment
  })
}

export async function deleteDraft(project: Project, id: string) {
  const { version } = await drafting(project)
  await project.updateComments((file) => {
    const target = file.comments.find((c) => c.id === id)
    if (!target || target.version !== version.name) throw new ProjectError(`${id} 不是本轮的评论`)
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

/** Sends the round's comments to the editing side; `cutroom review` is waiting for this. */
export async function send(project: Project) {
  const { version, working } = await drafting(project)
  const drafts = working.comments.comments.filter((c) => c.version === version.name)
  if (drafts.length === 0) throw new ProjectError("本轮还没有评论")
  await project.updateComments((file) => ({
    ...file,
    rounds: [...file.rounds, { version: version.name, submittedAt: new Date().toISOString() }],
  }))
  return { count: drafts.length, listening: project.listening }
}

export async function dismissFinding(project: Project, id: string) {
  await drafting(project)
  await project.updateComments((file) => ({
    ...file,
    dismissed: [...new Set([...file.dismissed, id])],
  }))
}
