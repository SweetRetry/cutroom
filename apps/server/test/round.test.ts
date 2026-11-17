import { afterAll, beforeAll, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { app } from "../src/app"

/**
 * One round through the real HTTP surface: the reviewer's `/api` and Claude Code's `/mcp`.
 * These are the rules whose breakage the reviewer would never see on the page: a version
 * that silently drops a comment, or a plan that skips one.
 */

let dir: string
let project: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cutroom-test-"))
  project = join(dir, "project")
  execFileSync("node", [resolve(import.meta.dir, "../../../scripts/sample-project.mjs"), project])
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const call = (path: string, init?: RequestInit) =>
  app
    .handle(new Request(`http://localhost${path}`, init))
    .then(async (r) => ({ status: r.status, body: (await r.json()) as any }))

const post = (path: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

async function tool(name: string, args: Record<string, unknown>) {
  const res = await call("/mcp", {
    method: "POST",
    // Streamable HTTP clients must accept both; Claude Code does.
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: { project, ...args } },
    }),
  })
  const result = res.body.result as { isError?: boolean; content: Array<{ text: string }> }
  if (!result) throw new Error(JSON.stringify(res))
  return { error: !!result.isError, text: result.content[0]!.text }
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: project }).toString()

test("a version can't be committed until every comment in the round has a reply", async () => {
  for (const text of ["开场太长", "这里穿帮"]) {
    const res = await post("/api/comments", {
      p: project,
      intent: "issue",
      text,
      anchor: { kind: "point", time: { start: 1, end: 1 } },
    })
    expect(res.status).toBe(200)
  }
  expect((await post("/api/round/submit", { p: project })).body).toEqual({ count: 2 })

  const partial = await tool("write_plan", {
    items: [{ comment: "c-03", action: "裁掉 1 秒", willChange: true }],
  })
  expect(partial).toEqual({ error: true, text: "计划要覆盖每条评论，缺：c-04" })

  const plan = await tool("write_plan", {
    items: [
      { comment: "c-03", action: "裁掉 1 秒", willChange: true },
      { comment: "c-04", action: "换同组素材", willChange: true },
    ],
  })
  expect(JSON.parse(plan.text)).toEqual({ revision: 1 })

  // Replies before approval are refused.
  expect((await tool("write_replies", { replies: [] })).text).toBe("计划通过后才能写回复")
  expect(
    (await post("/api/round/decision", { p: project, revision: 1, objections: {} })).body
  ).toEqual({ status: "approved" })

  expect((await tool("commit_version", { summary: "裁掉开场" })).text).toBe(
    "先渲染到 renders/v3.mp4"
  )
  copyFileSync(join(project, "renders/v2.mp4"), join(project, "renders/v3.mp4"))

  await tool("write_replies", { replies: [{ comment: "c-03", text: "裁掉了 1 秒", done: true }] })
  const refused = await tool("commit_version", { summary: "裁掉开场" })
  expect(refused.error).toBe(true)
  expect(refused.text).toStartWith("这些评论还没有回复：c-04")
  expect(git("log", "-1", "--format=%s").trim()).toBe(
    "v2: 彩条缩短一半，开场接彩条加叠化，结尾加 logo"
  )

  await tool("write_replies", {
    replies: [{ comment: "c-04", text: "同组只有这一个镜头，需要补素材", done: false }],
  })
  expect(JSON.parse((await tool("commit_version", { summary: "裁掉开场" })).text)).toEqual({
    version: "v3",
    closed: "v2",
  })
  expect(git("log", "-1", "--format=%s").trim()).toBe("v3: 裁掉开场")
  const agent = JSON.parse(readFileSync(join(project, "review/agent.json"), "utf8"))
  expect(agent.rounds.find((r: { version: string }) => r.version === "v2").result).toBe("v3")
})

test("a plan rewritten after an objection is a new revision the reviewer must answer again", async () => {
  await post("/api/comments", {
    p: project,
    intent: "feel",
    text: "节奏慢",
    anchor: { kind: "global" },
  })
  await post("/api/round/submit", { p: project })
  await tool("write_plan", {
    items: [{ comment: "c-05", action: "整体加速 10%", willChange: true }],
  })
  await post("/api/round/decision", {
    p: project,
    revision: 1,
    objections: { "c-05": "不要加速，删镜头" },
  })
  const rewritten = await tool("write_plan", {
    items: [{ comment: "c-05", action: "删掉第三个镜头", willChange: true }],
  })
  expect(JSON.parse(rewritten.text)).toEqual({ revision: 2 })
  // An answer aimed at the old revision is refused rather than approving the new plan.
  const stale = await post("/api/round/decision", { p: project, revision: 1, objections: {} })
  expect(stale).toEqual({ status: 409, body: { message: "计划刚更新过，看一下新的这一稿" } })
})

test("requests addressed to another host are refused", async () => {
  const res = await app.handle(new Request("http://evil.example/api/recent"))
  expect(res.status).toBe(403)
})
