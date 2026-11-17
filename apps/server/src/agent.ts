import { PATHS } from "@workspace/core/project/layout"
import { roundPhase } from "@workspace/core/review/state"
import {
  assetIndexSchema,
  timelineSchema,
  type AgentFile,
  type AgentRound,
  type Anchor,
  type Reply,
} from "@workspace/core/schema"

import { notify } from "./events"
import { git } from "./git"
import { ProjectError, type Project } from "./project"

/**
 * The editing side's two moves, both made through `cutroom review`: hand over a version, then
 * wait for the reviewer to send comments on it. The rules are checked here, at the moment of
 * writing: a render, a valid timeline and asset index, and a reply to every sent comment.
 */

type Finding = { kind: string; text: string; anchor: Anchor }
export type Handoff = { summary?: string; replies?: Reply[]; findings?: Finding[] }

/**
 * Commits the next version when its render is on disk, then names the version to review. With
 * no new render it only names the current one, so running it again after a crash just waits
 * again. Replies and findings belong to a new version and are refused without one.
 */
export async function handoff(project: Project, input: Handoff) {
  await project.init()
  const [graph, working] = await Promise.all([project.versions(), project.working()])
  const current = graph?.current
  const next = `v${(graph?.versions.reduce((max, v) => Math.max(max, v.n), 0) ?? 0) + 1}`
  const render = PATHS.render(next)

  if (!(await project.exists(render))) {
    if (!current) throw new ProjectError(`还没有版本。先渲染到 ${render}`)
    if (input.summary || input.replies?.length || input.findings?.length)
      throw new ProjectError(`摘要、回复和预检发现要跟新版本一起交，先渲染到 ${render}`)
    return { version: current.name, committed: false }
  }

  const line = input.summary?.trim().split("\n")[0]
  if (!line) throw new ProjectError(`${render} 已渲染，用 -m 写一句这一版的摘要`)
  await checkFiles(project)

  const replies = input.replies ?? []
  const phase = current && roundPhase(current.name, working.comments, working.agent)
  if (current && phase?.kind === "sent") {
    const ids = new Set(
      working.comments.comments.filter((c) => c.version === current.name).map((c) => c.id)
    )
    const stray = replies.filter((r) => !ids.has(r.comment)).map((r) => r.comment)
    if (stray.length) throw new ProjectError(`这些不是 ${current.name} 的评论：${stray.join("、")}`)
    const unanswered = [...ids].filter((id) => !replies.some((r) => r.comment === id))
    if (unanswered.length)
      throw new ProjectError(
        `这些评论还没有回复：${unanswered.join("、")}。没做的也要写 done: false 和原因`
      )
  } else if (replies.length) {
    throw new ProjectError("没有发过来的评论，不需要回复")
  }

  await project.write(async () => {
    let agent = (await project.working()).agent
    if (current && phase?.kind === "sent")
      agent = upsertRound(agent, current.name, { replies, result: next })
    if (input.findings?.length) agent = addFindings(agent, next, input.findings)
    await project.putJson(PATHS.agent, agent)
    await git(project.root, "add", "-A")
    await git(
      project.root,
      "-c",
      "user.name=Cutroom",
      "-c",
      "user.email=cutroom@localhost",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      `${next}: ${line}`
    )
  })
  return { version: next, committed: true }
}

/** The timeline and asset index the editing side wrote directly, checked before they're versioned. */
async function checkFiles(project: Project) {
  const timeline = await project.readJson(PATHS.timeline, timelineSchema)
  if (!timeline) throw new ProjectError(`${PATHS.timeline} 不存在`)
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.end < clip.start) throw new ProjectError(`${clip.id} 的 end 早于 start`)
      if (clip.end > timeline.duration + 0.05) throw new ProjectError(`${clip.id} 超出 duration`)
    }
  }
  const ids = timeline.tracks.flatMap((t) => t.clips.map((c) => c.id))
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new ProjectError(`片段 id ${dup} 重复`)

  const index = await project.readJson(PATHS.assets, assetIndexSchema)
  const missing = []
  for (const asset of index?.assets ?? []) {
    if (asset.origin === "fetched" && !asset.source)
      missing.push(`${asset.id} 缺 source（出处和授权）`)
    if (!(await project.exists(asset.path))) missing.push(`${asset.id} 的文件 ${asset.path} 不存在`)
  }
  if (missing.length) throw new ProjectError(missing.join("；"))
}

/**
 * What `cutroom review` prints once the reviewer sends: the comments on `version`, and the
 * reviewer's verdicts on the replies that produced it. Null while they're still writing. Each
 * call also marks the editing side as listening, which the page shows.
 */
export async function sent(project: Project, version: string) {
  const wasListening = project.listening
  project.lastWait = Date.now()
  if (!wasListening) notify(project, "working")

  const { comments, agent } = await project.working()
  if (roundPhase(version, comments, agent).kind === "drafting") return null
  const previous = agent.rounds.find((r) => r.result === version)?.version
  return {
    version,
    comments: comments.comments.filter((c) => c.version === version),
    verdicts: previous
      ? comments.comments
          .filter((c) => c.version === previous && c.resolution)
          .map((c) => ({ comment: c.id, resolution: c.resolution }))
      : [],
  }
}

function addFindings(agent: AgentFile, version: string, findings: Finding[]): AgentFile {
  let n = agent.findings.reduce((max, f) => Math.max(max, Number(f.id.slice(2))), 0)
  const added = findings.map((f) => ({ ...f, id: `f-${String(++n).padStart(2, "0")}`, version }))
  return { ...agent, findings: [...agent.findings, ...added] }
}

function upsertRound(agent: AgentFile, version: string, patch: Partial<AgentRound>): AgentFile {
  const existing = agent.rounds.find((r) => r.version === version)
  const round: AgentRound = { version, replies: [], ...existing, ...patch }
  return {
    ...agent,
    rounds: existing
      ? agent.rounds.map((r) => (r === existing ? round : r))
      : [...agent.rounds, round],
  }
}
