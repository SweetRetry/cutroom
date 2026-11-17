#!/usr/bin/env bun
/**
 * `cutroom review`: how the editing side hands a version to the reviewer and waits for comments.
 *
 * Usage: cutroom review [folder] [-m summary] [--replies file.json] [--findings file.json]
 *
 * With `renders/vN.mp4` on disk for the next version, it commits that version first (it needs
 * `-m`, and a reply to every comment sent on the previous one). Then it opens the review page
 * unless one is already open, and blocks. Once the reviewer sends, it prints the comments as
 * JSON on stdout and exits 0. Refusals print the reason on stderr and exit 1. Running it again
 * with no new render just waits again, or returns at once if the comments were already sent.
 * Starts the local service when it isn't running. `CUTROOM_PORT` picks the port (4317).
 */
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const USAGE = "用法：cutroom review [文件夹] [-m 摘要] [--replies 文件] [--findings 文件]"
const base = `http://localhost:${process.env.CUTROOM_PORT ?? 4317}`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) fail((data as { message?: string } | null)?.message ?? `服务返回 ${res.status}`)
  return data as T
}

const running = () =>
  fetch(`${base}/api/recent`).then(
    (r) => r.ok,
    () => false
  )

async function ensureService() {
  if (await running()) return
  spawn("bun", [resolve(import.meta.dir, "index.ts")], { detached: true, stdio: "ignore" }).unref()
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(200)
    if (await running()) return
  }
  fail(`没能启动 Cutroom 服务（${base}）`)
}

async function readJson(path: string | undefined, name: string) {
  if (!path) return undefined
  try {
    return await Bun.file(resolve(path)).json()
  } catch {
    fail(`读不了 ${name} 文件 ${path}，要是一个 JSON 数组`)
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    message: { type: "string", short: "m" },
    replies: { type: "string" },
    findings: { type: "string" },
  },
})
const [command, folder = "."] = positionals
if (command !== "review") fail(USAGE)

const p = resolve(folder)
await ensureService()
const handed = await call<{ version: string; committed: boolean; pageOpen: boolean }>("/handoff", {
  p,
  summary: values.message,
  replies: await readJson(values.replies, "--replies"),
  findings: await readJson(values.findings, "--findings"),
})

const url = `${base}/?p=${encodeURIComponent(p)}`
console.error(
  `${handed.committed ? `已提交 ${handed.version}。` : ""}在这里审 ${handed.version}：${url}`
)
if (!handed.pageOpen) {
  const opener = { darwin: "open", win32: "explorer" }[process.platform as string] ?? "xdg-open"
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref()
}
console.error("等对方把评论发过来……")

const query = `p=${encodeURIComponent(p)}&version=${encodeURIComponent(handed.version)}`
for (;;) {
  const { result } = await fetch(`${base}/api/round/sent?${query}`)
    .then((r) => r.json() as Promise<{ result: unknown }>)
    .catch(() => ({ result: null }))
  if (result) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  }
  if (!(await running())) await ensureService()
  await Bun.sleep(1000)
}
