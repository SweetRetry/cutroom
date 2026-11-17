import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"
import type { z } from "zod"

import { GITIGNORE, PATHS } from "@workspace/core/project/layout"
import {
  agentFileSchema,
  assetIndexSchema,
  commentsFileSchema,
  timelineSchema,
  type AgentFile,
  type AssetIndex,
  type CommentsFile,
  type Timeline,
} from "@workspace/core/schema"

import { git, readAt, readVersions, uncommitted, type Version } from "./git"
import CLAUDE_MD from "@workspace/core/project/project-claude.md" with { type: "text" }

/** A mistake the caller can fix: a bad path, a wrong phase, a broken file. Sent back as is. */
export class ProjectError extends Error {}

const EMPTY_COMMENTS: CommentsFile = { comments: [], rounds: [], dismissed: [] }
const EMPTY_AGENT: AgentFile = { rounds: [], findings: [] }

export type Working = {
  comments: CommentsFile
  agent: AgentFile
  assets: AssetIndex
  initialized: boolean
}

/**
 * One project folder. The server is the only writer of its review files and timeline: every
 * write goes through `write`, which serializes per project and replaces files atomically, so
 * the browser and Claude Code can't interleave half-written JSON.
 */
export class Project {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(readonly root: string) {}

  get name() {
    return this.root.split(sep).pop() ?? this.root
  }

  /** A path inside the project, refusing anything that resolves outside it. */
  path(rel: string): string {
    const abs = resolve(this.root, rel)
    if (abs !== this.root && !abs.startsWith(this.root + sep))
      throw new ProjectError(`${rel} 不在项目里`)
    return abs
  }

  async exists(rel: string) {
    return stat(this.path(rel)).then(
      () => true,
      () => false
    )
  }

  async readJson<S extends z.ZodType>(rel: string, schema: S): Promise<z.output<S> | undefined> {
    let text: string
    try {
      text = await readFile(this.path(rel), "utf8")
    } catch {
      return undefined
    }
    return parse(rel, text, schema)
  }

  /** Runs `change` with nothing else writing to this project meanwhile. */
  write<T>(change: () => Promise<T>): Promise<T> {
    const run = this.queue.then(change)
    this.queue = run.catch(() => undefined)
    return run
  }

  async putFile(rel: string, data: string | Uint8Array) {
    const abs = this.path(rel)
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, abs)
  }

  putJson(rel: string, value: unknown) {
    return this.putFile(rel, `${JSON.stringify(value, null, 2)}\n`)
  }

  async working(): Promise<Working> {
    const [comments, agent, assets, initialized] = await Promise.all([
      this.readJson(PATHS.comments, commentsFileSchema),
      this.readJson(PATHS.agent, agentFileSchema),
      this.readJson(PATHS.assets, assetIndexSchema),
      this.exists(PATHS.instructions),
    ])
    return {
      comments: comments ?? EMPTY_COMMENTS,
      agent: agent ?? EMPTY_AGENT,
      assets: assets ?? { assets: [] },
      initialized,
    }
  }

  /** Read-modify-write of comments.json, serialized with every other write. */
  updateComments(change: (file: CommentsFile) => CommentsFile) {
    return this.write(async () => {
      const next = change(
        (await this.readJson(PATHS.comments, commentsFileSchema)) ?? EMPTY_COMMENTS
      )
      await this.putJson(PATHS.comments, next)
      return next
    })
  }

  updateAgent(change: (file: AgentFile) => AgentFile) {
    return this.write(async () => {
      const next = change((await this.readJson(PATHS.agent, agentFileSchema)) ?? EMPTY_AGENT)
      await this.putJson(PATHS.agent, next)
      return next
    })
  }

  versions() {
    return readVersions(this.root)
  }

  /** A version's timeline, read from its commit so it always matches its render. */
  async timelineAt(version: Pick<Version, "oid" | "name">): Promise<Timeline | undefined> {
    const text = await readAt(this.root, version.oid, PATHS.timeline)
    return text === undefined
      ? undefined
      : parse(`${version.name}:${PATHS.timeline}`, text, timelineSchema)
  }

  /**
   * Make a version the one under review: a branch tip is switched to as is, any other version
   * gets a new branch, so the versions after it stay on theirs.
   */
  continueFrom(version: Version, branch: string) {
    return this.write(async () => {
      const dirty = await uncommitted(this.root)
      if (dirty.length > 0) throw new ProjectError(`这些文件有未提交的改动：${dirty.join("、")}`)
      if (version.tips[0]) await git(this.root, "switch", version.tips[0])
      else await git(this.root, "switch", "-c", branch, version.oid)
    })
  }

  /** Writes the conventions without touching anything that exists, and starts the repository. */
  init() {
    return this.write(async () => {
      if (!(await this.exists(PATHS.instructions)))
        await this.putFile(PATHS.instructions, CLAUDE_MD)
      if (!(await this.exists(PATHS.gitignore))) await this.putFile(PATHS.gitignore, GITIGNORE)
      if (!(await this.exists(PATHS.comments))) await this.putJson(PATHS.comments, EMPTY_COMMENTS)
      await mkdir(this.path("media/user"), { recursive: true })
      if ((await readVersions(this.root)) === null) await git(this.root, "init", "-q", "-b", "main")
    })
  }
}

function parse<S extends z.ZodType>(label: string, text: string, schema: S): z.output<S> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ProjectError(`${label} 不是合法的 JSON`)
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ProjectError(
      `${label} 格式不对：${issue?.path.join(".") || "根"} ${issue?.message ?? ""}`
    )
  }
  return result.data
}

const open = new Map<string, Project>()

/** The project at an absolute folder path, opened once and shared by the UI and Claude Code. */
export async function projectAt(path: string): Promise<Project> {
  if (!isAbsolute(path)) throw new ProjectError(`项目路径要用绝对路径：${path}`)
  let root: string
  try {
    root = await realpath(path)
    if (!(await stat(root)).isDirectory()) throw new Error()
  } catch {
    throw new ProjectError(`找不到文件夹 ${path}`)
  }
  let project = open.get(root)
  if (!project) open.set(root, (project = new Project(root)))
  return project
}
