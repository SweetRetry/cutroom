import { PATHS } from "@workspace/core/project/layout"
import { roundPhase } from "@workspace/core/review/state"
import {
  timelineSchema,
  type AgentFile,
  type AgentRound,
  type Anchor,
  type AssetIndex,
  type Timeline,
} from "@workspace/core/schema"

import { git } from "./git"
import { ProjectError, type Project } from "./project"

/**
 * Claude Code's side of a round, behind the MCP tools. Every rule CLAUDE.md states is checked
 * here, at the moment of writing: a plan must cover each comment, replies wait for approval,
 * and a version can't close a round that left a comment unanswered.
 */

async function state(project: Project) {
  const [graph, working] = await Promise.all([project.versions(), project.working()])
  if (graph === null) throw new ProjectError("这个文件夹还不是 git 仓库，先调用 init_project")
  const current = graph.current
  const next = (graph.versions.reduce((max, v) => Math.max(max, v.n), 0) || 0) + 1
  const phase = current ? roundPhase(current.name, working.comments, working.agent) : undefined
  const roundComments = current
    ? working.comments.comments.filter((c) => c.version === current.name)
    : []
  return { graph, working, current, next: `v${next}`, phase, roundComments }
}

export async function getRound(project: Project) {
  const { current, next, phase, roundComments, working } = await state(project)
  const agentRound = current && working.agent.rounds.find((r) => r.version === current.name)
  const round = current && working.comments.rounds.find((r) => r.version === current.name)
  const previous = current && working.agent.rounds.find((r) => r.result === current.name)
  const toDo: Record<string, string> = {
    drafting: "本轮评论还没提交。等提交后再处理。",
    "awaiting-plan": "调用 write_plan，为每条评论写一项，然后停下等确认。",
    "plan-ready": "计划等待确认。可以改写计划，但不要执行。",
    objected: "计划有异议（见 decision.objections）。改写计划后再次调用 write_plan，然后停下。",
    approved: "计划已通过。执行、渲染到 nextRender，调用 write_replies，再调用 commit_version。",
    done: "这一轮已经结束。",
  }
  return {
    project: project.root,
    current: current?.name ?? null,
    nextVersion: next,
    nextRender: PATHS.render(next),
    phase: phase?.kind ?? "first-cut",
    whatToDo: phase
      ? toDo[phase.kind]
      : "还没有版本。写 assets.json 和 timeline.json，渲染到 nextRender，再调用 commit_version。",
    comments: roundComments,
    decision: round?.decision ?? null,
    plan: agentRound ? { revision: agentRound.revision, items: agentRound.plan } : null,
    replies: agentRound?.replies ?? [],
    /** Verdicts on the previous round's replies; "reopened" ones came back as new comments. */
    verdicts: previous
      ? working.comments.comments
          .filter((c) => c.version === previous.version)
          .map((c) => ({ comment: c.id, resolution: c.resolution ?? null }))
      : [],
  }
}

export async function writeTimeline(project: Project, timeline: Timeline) {
  const parsed = timelineSchema.parse(timeline)
  for (const track of parsed.tracks) {
    for (const clip of track.clips) {
      if (clip.end < clip.start) throw new ProjectError(`${clip.id} 的 end 早于 start`)
      if (clip.end > parsed.duration + 0.05) throw new ProjectError(`${clip.id} 超出 duration`)
    }
  }
  const ids = parsed.tracks.flatMap((t) => t.clips.map((c) => c.id))
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new ProjectError(`片段 id ${dup} 重复`)
  await project.write(() => project.putJson(PATHS.timeline, parsed))
}

export async function writeAssets(project: Project, index: AssetIndex) {
  const missing = []
  for (const asset of index.assets) {
    if (asset.origin === "fetched" && !asset.source)
      missing.push(`${asset.id} 缺 source（出处和授权）`)
    if (!(await project.exists(asset.path))) missing.push(`${asset.id} 的文件 ${asset.path} 不存在`)
  }
  if (missing.length) throw new ProjectError(missing.join("；"))
  await project.write(() => project.putJson(PATHS.assets, index))
}

type PlanItem = AgentRound["plan"][number]

export async function writePlan(project: Project, items: PlanItem[]) {
  const { current, phase, roundComments } = await state(project)
  if (!current || !phase) throw new ProjectError("还没有版本，没有计划可写")
  if (phase.kind !== "awaiting-plan" && phase.kind !== "plan-ready" && phase.kind !== "objected") {
    throw new ProjectError(`现在是 ${phase.kind}，不能写计划`)
  }
  const ids = new Set(roundComments.map((c) => c.id))
  const stray = items.filter((i) => !ids.has(i.comment)).map((i) => i.comment)
  if (stray.length) throw new ProjectError(`这些不是本轮的评论：${stray.join("、")}`)
  const missing = [...ids].filter((id) => !items.some((i) => i.comment === id))
  if (missing.length) throw new ProjectError(`计划要覆盖每条评论，缺：${missing.join("、")}`)

  // A plan rewritten after the reviewer answered is a new revision; their answer was to the old one.
  const revision =
    phase.kind === "awaiting-plan"
      ? 1
      : phase.kind === "objected"
        ? phase.revision + 1
        : phase.revision
  await project.updateAgent((agent) => upsertRound(agent, current.name, { revision, plan: items }))
  return revision
}

export async function writeReplies(project: Project, replies: AgentRound["replies"]) {
  const { current, phase, roundComments } = await state(project)
  if (!current || phase?.kind !== "approved") throw new ProjectError("计划通过后才能写回复")
  const ids = new Set(roundComments.map((c) => c.id))
  const stray = replies.filter((r) => !ids.has(r.comment)).map((r) => r.comment)
  if (stray.length) throw new ProjectError(`这些不是本轮的评论：${stray.join("、")}`)
  await project.updateAgent((agent) => {
    const existing = agent.rounds.find((r) => r.version === current.name)?.replies ?? []
    const merged = [
      ...existing.filter((e) => !replies.some((r) => r.comment === e.comment)),
      ...replies,
    ]
    return upsertRound(agent, current.name, { replies: merged })
  })
}

export async function addFindings(
  project: Project,
  findings: Array<{ kind: string; text: string; anchor: Anchor }>
) {
  const { current } = await state(project)
  if (!current) throw new ProjectError("先 commit_version，再对这个版本写预检发现")
  return (
    await project.updateAgent((agent) => {
      let n = agent.findings.reduce((max, f) => Math.max(max, Number(f.id.slice(2))), 0)
      const added = findings.map((f) => ({
        ...f,
        id: `f-${String(++n).padStart(2, "0")}`,
        version: current.name,
      }))
      return { ...agent, findings: [...agent.findings, ...added] }
    })
  ).findings.slice(-findings.length)
}

/**
 * Records a version: the render must exist, the timeline must parse, and when a round was
 * under review every comment in it must have a reply. Then one `vN:` commit with everything.
 */
export async function commitVersion(project: Project, summary: string) {
  const { current, next, phase, roundComments, working } = await state(project)
  const render = PATHS.render(next)
  if (!(await project.exists(render))) throw new ProjectError(`先渲染到 ${render}`)
  const timeline = await project.readJson(PATHS.timeline, timelineSchema)
  if (!timeline) throw new ProjectError("timeline.json 不存在，先调用 write_timeline")

  const closesRound = current && phase && phase.kind !== "drafting"
  if (current && closesRound) {
    if (phase.kind !== "approved")
      throw new ProjectError(`本轮还在 ${phase.kind}，计划通过后才能出新版本`)
    const replied = new Set(
      working.agent.rounds.find((r) => r.version === current.name)?.replies.map((r) => r.comment)
    )
    const unanswered = roundComments.filter((c) => !replied.has(c.id)).map((c) => c.id)
    if (unanswered.length)
      throw new ProjectError(
        `这些评论还没有回复：${unanswered.join("、")}。没做的也要写 done: false 和原因`
      )
  }

  const line = summary.trim().split("\n")[0]
  if (!line) throw new ProjectError("summary 不能为空")
  return project.write(async () => {
    if (current && closesRound) {
      const agentFile = (await project.working()).agent
      await project.putJson(PATHS.agent, upsertRound(agentFile, current.name, { result: next }))
    }
    await git(project.root, "add", "-A")
    await git(
      project.root,
      "-c",
      "user.name=Cutroom",
      "-c",
      "user.email=cutroom@localhost",
      "commit",
      "-q",
      "-m",
      `${next}: ${line}`
    )
    return { version: next, closed: closesRound ? current!.name : null }
  })
}

function upsertRound(agent: AgentFile, version: string, patch: Partial<AgentRound>): AgentFile {
  const existing = agent.rounds.find((r) => r.version === version)
  const round: AgentRound = { version, revision: 1, plan: [], replies: [], ...existing, ...patch }
  return {
    ...agent,
    rounds: existing
      ? agent.rounds.map((r) => (r === existing ? round : r))
      : [...agent.rounds, round],
  }
}
