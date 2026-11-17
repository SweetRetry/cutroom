import { afterAll, beforeAll, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { app } from "../src/app"

/**
 * One round through the real HTTP surface the page and `cutroom review` share. These are the
 * rules whose breakage nobody would see on the page: a version that silently drops a comment,
 * a wait that never returns the comments, a retry that commits twice.
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

const git = (...args: string[]) => execFileSync("git", args, { cwd: project }).toString()
const lastCommit = () => git("log", "-1", "--format=%s").trim()
const sent = (version: string) =>
  call(`/api/round/sent?p=${encodeURIComponent(project)}&version=${version}`)

test("the wait returns nothing until the reviewer sends, then the round's comments", async () => {
  expect((await post("/api/handoff", { p: project })).body).toMatchObject({
    version: "v2",
    committed: false,
  })
  for (const text of ["开场太长", "这里穿帮"]) {
    const res = await post("/api/comments", {
      p: project,
      intent: "issue",
      text,
      anchor: { kind: "point", time: { start: 1, end: 1 } },
    })
    expect(res.status).toBe(200)
  }
  expect((await sent("v2")).body).toEqual({ result: null })

  expect((await post("/api/round/send", { p: project })).body).toEqual({
    count: 2,
    listening: true,
  })
  const { result } = (await sent("v2")).body
  expect(result.comments.map((c: { id: string; text: string }) => [c.id, c.text])).toEqual([
    ["c-03", "开场太长"],
    ["c-04", "这里穿帮"],
  ])
})

test("a version can't be committed until every sent comment has a reply", async () => {
  // Without a new render nothing is committed, and replies are refused rather than dropped.
  const early = await post("/api/handoff", {
    p: project,
    replies: [{ comment: "c-03", text: "裁掉了 1 秒", done: true }],
  })
  expect(early).toEqual({
    status: 409,
    body: { message: "摘要、回复和预检发现要跟新版本一起交，先渲染到 renders/v3.mp4" },
  })

  copyFileSync(join(project, "renders/v2.mp4"), join(project, "renders/v3.mp4"))
  const partial = await post("/api/handoff", {
    p: project,
    summary: "裁掉开场",
    replies: [{ comment: "c-03", text: "裁掉了 1 秒", done: true }],
  })
  expect(partial.body.message).toStartWith("这些评论还没有回复：c-04")
  expect(lastCommit()).toBe("v2: 彩条缩短一半，开场接彩条加叠化，结尾加 logo")

  const done = await post("/api/handoff", {
    p: project,
    summary: "裁掉开场",
    replies: [
      { comment: "c-03", text: "裁掉了 1 秒", done: true },
      { comment: "c-04", text: "同组只有这一个镜头，需要补素材", done: false },
    ],
  })
  expect(done.body).toMatchObject({ version: "v3", committed: true })
  expect(lastCommit()).toBe("v3: 裁掉开场")
  const agent = JSON.parse(readFileSync(join(project, "review/agent.json"), "utf8"))
  expect(agent.rounds.find((r: { version: string }) => r.version === "v2").result).toBe("v3")

  // Running it again waits on v3 instead of committing another version.
  expect((await post("/api/handoff", { p: project })).body).toMatchObject({
    version: "v3",
    committed: false,
  })
  expect(lastCommit()).toBe("v3: 裁掉开场")
})

test("requests addressed to another host are refused", async () => {
  const res = await app.handle(new Request("http://evil.example/api/recent"))
  expect(res.status).toBe(403)
})
