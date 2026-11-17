import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { Elysia } from "elysia"
import { z } from "zod"

import { anchorSchema, replySchema } from "@workspace/core/schema"

import { handoff, sent } from "./agent"
import { eventStream, pageOpen } from "./events"
import { peaks, serveFile, thumbnail } from "./media"
import { projectAt, ProjectError } from "./project"
import { addComment, deleteDraft, dismissFinding, resolve, send } from "./review"

/**
 * The local service. Only this process writes the review files and versions: the page and the
 * `cutroom` command both go through `/api`. It listens on loopback and refuses other Host headers, so a web
 * page elsewhere can't reach it through DNS rebinding.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const RECENT = join(homedir(), ".cutroom", "recent.json")

/** Recently opened folders that still exist; a deleted one (a test's temp dir) drops out. */
async function recent(): Promise<string[]> {
  try {
    const list = z.array(z.string()).parse(JSON.parse(await readFile(RECENT, "utf8")))
    const alive = await Promise.all(
      list.map((p) =>
        stat(p).then(
          () => true,
          () => false
        )
      )
    )
    return list.filter((_, i) => alive[i])
  } catch {
    return []
  }
}

async function remember(path: string) {
  const list = [path, ...(await recent()).filter((p) => p !== path)].slice(0, 8)
  await mkdir(dirname(RECENT), { recursive: true })
  await writeFile(RECENT, JSON.stringify(list, null, 2))
}

const p = z.object({ p: z.string() })

const api = new Elysia({ prefix: "/api" })
  .get("/recent", () => recent())
  .post(
    "/open",
    async ({ body }) => {
      const project = await projectAt(body.path)
      await remember(project.root)
      return { path: project.root, name: project.name }
    },
    { body: z.object({ path: z.string() }) }
  )
  .get(
    "/project",
    async ({ query }) => {
      const project = await projectAt(query.p)
      const [graph, working] = await Promise.all([project.versions(), project.working()])
      return {
        name: project.name,
        path: project.root,
        graph,
        listening: project.listening,
        ...working,
      }
    },
    { query: p }
  )
  .get(
    "/timeline",
    async ({ query }) => {
      const project = await projectAt(query.p)
      return (await project.timelineAt({ oid: query.oid, name: query.oid.slice(0, 7) })) ?? null
    },
    { query: z.object({ p: z.string(), oid: z.string().regex(/^[0-9a-f]{7,40}$/) }) }
  )
  .post(
    "/comments",
    async ({ body }) => {
      const { p, ...input } = body
      return addComment(await projectAt(p), input)
    },
    {
      body: z.object({
        p: z.string(),
        text: z.string(),
        anchor: anchorSchema,
        reopens: z.string().optional(),
        finding: z.string().optional(),
      }),
    }
  )
  .delete(
    "/comments/:id",
    async ({ params, query }) => deleteDraft(await projectAt(query.p), params.id),
    {
      query: p,
    }
  )
  .post(
    "/comments/:id/resolution",
    async ({ params, body }) => resolve(await projectAt(body.p), params.id, body.resolution),
    { body: z.object({ p: z.string(), resolution: z.enum(["closed", "reopened"]) }) }
  )
  .post("/round/send", async ({ body }) => send(await projectAt(body.p)), { body: p })
  // The `cutroom` command's two calls: hand over a version, then poll until it's reviewed.
  .post(
    "/handoff",
    async ({ body }) => {
      const { p, ...input } = body
      const project = await projectAt(p)
      await remember(project.root)
      return { ...(await handoff(project, input)), pageOpen: pageOpen(project) }
    },
    {
      body: z.object({
        p: z.string(),
        summary: z.string().optional(),
        replies: z.array(replySchema).optional(),
        findings: z
          .array(z.object({ kind: z.string(), text: z.string(), anchor: anchorSchema }))
          .optional(),
      }),
    }
  )
  .get(
    "/round/sent",
    async ({ query }) => ({ result: await sent(await projectAt(query.p), query.version) }),
    {
      query: z.object({ p: z.string(), version: z.string() }),
    }
  )
  .post(
    "/findings/:id/dismiss",
    async ({ params, body }) => dismissFinding(await projectAt(body.p), params.id),
    {
      body: p,
    }
  )
  .post(
    "/versions/continue",
    async ({ body }) => {
      const project = await projectAt(body.p)
      const version = (await project.versions())?.versions.find((v) => v.oid === body.oid)
      if (!version) throw new ProjectError("没有这个版本")
      if (!version.tips[0] && !/^[\w./-]+$/.test(body.branch))
        throw new ProjectError("分支名只能用字母、数字和 . _ / -")
      await project.continueFrom(version, body.branch)
    },
    { body: z.object({ p: z.string(), oid: z.string(), branch: z.string() }) }
  )
  .get(
    "/media",
    async ({ query, request }) => serveFile(await projectAt(query.p), query.file, request),
    {
      query: z.object({ p: z.string(), file: z.string() }),
    }
  )
  .get(
    "/thumb",
    async ({ query }) => thumbnail(await projectAt(query.p), query.file, query.t, query.w),
    {
      query: z.object({
        p: z.string(),
        file: z.string(),
        t: z.coerce.number(),
        w: z.coerce.number().int().min(16).max(640),
      }),
    }
  )
  .get("/peaks", async ({ query }) => peaks(await projectAt(query.p), query.file), {
    query: z.object({ p: z.string(), file: z.string() }),
  })
  .get(
    "/events",
    async ({ query, request }) => eventStream(await projectAt(query.p), request.signal),
    {
      query: p,
    }
  )

export const app = new Elysia()
  .onRequest(({ request }) => {
    const host = new URL(request.url).hostname
    if (!LOCAL_HOSTS.has(host) && !LOCAL_HOSTS.has(`[${host}]`))
      return new Response("forbidden host", { status: 403 })
  })
  .onError(({ error, code }) => {
    // A ProjectError is the caller's to fix (a wrong phase, a bad path); its message is the answer.
    if (error instanceof ProjectError)
      return Response.json({ message: error.message }, { status: 409 })
    if (code === "VALIDATION") return Response.json({ message: "请求格式不对" }, { status: 400 })
  })
  .use(api)

export type App = typeof app
export type { Version, VersionGraph } from "./git"
