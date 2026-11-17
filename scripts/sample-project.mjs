#!/usr/bin/env node
/**
 * Builds a small but real Cutroom project: generated source media, two rendered versions
 * committed as `v1:` and `v2:`, one finished review round with a plan and replies, and one of
 * Claude Code's precheck findings on v2. Used by the service tests and to try the app by hand.
 *
 * Usage: node scripts/sample-project.mjs <empty-or-missing-dir>
 * Needs ffmpeg and git on PATH.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const out = resolve(process.argv[2] ?? "")
if (!process.argv[2]) throw new Error("usage: node scripts/sample-project.mjs <dir>")
if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`${out} is not empty`)

const here = dirname(fileURLToPath(import.meta.url))
const instructions = readFileSync(
  join(here, "../packages/core/src/project/project-claude.md"),
  "utf8"
)

const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd: out })
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Claude Code", "-c", "user.email=agent@example.invalid", ...args],
    {
      cwd: out,
    }
  )
const write = (path, value) => {
  mkdirSync(dirname(join(out, path)), { recursive: true })
  writeFileSync(
    join(out, path),
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`
  )
}

mkdirSync(out, { recursive: true })
for (const dir of ["media/user", "media/fetched", "generated/title", "renders", "review"]) {
  mkdirSync(join(out, dir), { recursive: true })
}

// ── Source media ─────────────────────────────────────────────────────────────
const SIZE = "640x360"
const clip = (name, source, seconds, tone) =>
  ff(
    "-f",
    "lavfi",
    "-i",
    `${source}=size=${SIZE}:rate=30:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${tone}:duration=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    `media/user/${name}`
  )
clip("A1.mp4", "testsrc2", 6, 330)
clip("A2.mp4", "smptebars", 6, 440)
clip("A3.mp4", "testsrc", 6, 550)
clip("A3b.mp4", "rgbtestsrc", 6, 550)
ff(
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=220:duration=20",
  "-af",
  "tremolo=f=2:d=0.6",
  "media/fetched/calm.mp3"
)
ff(
  "-f",
  "lavfi",
  "-i",
  "color=c=0x10b981:size=200x80:duration=1",
  "-frames:v",
  "1",
  "generated/title/logo.png"
)
write(
  "generated/title/make-logo.sh",
  "ffmpeg -f lavfi -i color=c=0x10b981:size=200x80 -frames:v 1 logo.png\n"
)

const assets = {
  assets: [
    {
      id: "a-01",
      path: "media/user/A1.mp4",
      kind: "video",
      origin: "user",
      duration: 6,
      group: "shot-01",
      summary: "开场，彩色测试图从左向右移动",
    },
    {
      id: "a-02",
      path: "media/user/A2.mp4",
      kind: "video",
      origin: "user",
      duration: 6,
      group: "shot-02",
      summary: "彩条，静止",
    },
    {
      id: "a-03",
      path: "media/user/A3.mp4",
      kind: "video",
      origin: "user",
      duration: 6,
      group: "shot-03",
      summary: "测试图，计数器走动",
    },
    {
      id: "a-03b",
      path: "media/user/A3b.mp4",
      kind: "video",
      origin: "user",
      duration: 6,
      group: "shot-03",
      summary: "同一镜头的另一版，色块",
    },
    {
      id: "a-music",
      path: "media/fetched/calm.mp3",
      kind: "audio",
      origin: "fetched",
      duration: 20,
      summary: "低频颤音，安静",
      source: { url: "https://example.org/calm", license: "CC0" },
    },
    {
      id: "a-logo",
      path: "generated/title/logo.png",
      kind: "sticker",
      origin: "generated",
      name: "logo",
      summary: "绿色标题条，make-logo.sh 生成",
    },
  ],
}

// ── Versions ─────────────────────────────────────────────────────────────────
const main = (clips) =>
  clips.map(([id, start, end, asset, at]) => ({
    id,
    start,
    end,
    asset,
    in: at,
    out: at + end - start,
  }))

function timeline({ clips, extra, duration }) {
  return {
    fps: 30,
    width: 640,
    height: 360,
    duration,
    markers: {
      scenes: clips.map((c) => c[1]),
      beats: Array.from({ length: Math.floor(duration * 2) }, (_, i) => i / 2),
    },
    tracks: [
      { id: "main", kind: "video", clips: main(clips) },
      {
        id: "subs",
        kind: "text",
        clips: [
          { id: "t-01", start: 0.5, end: 3, text: "我们出发吧" },
          { id: "t-02", start: 5, end: 7.5, text: "路上的风景" },
        ],
      },
      {
        id: "voice",
        kind: "voice",
        clips: [{ id: "vo-01", start: 0, end: 4, asset: "a-01", in: 1, out: 5 }],
      },
      {
        id: "bgm",
        kind: "music",
        clips: [
          {
            id: "m-01",
            start: 0,
            end: duration,
            asset: "a-music",
            in: 0,
            out: duration,
            beats: [1, 2, 3, 4, 5, 6, 7, 8],
          },
        ],
      },
      ...extra,
    ],
  }
}

function render(version, clips, duration) {
  const inputs = clips.flatMap(([, , , asset]) => [
    "-i",
    assets.assets.find((a) => a.id === asset).path,
  ])
  const trims = clips
    .map(
      ([, start, end, , at], i) =>
        `[${i}:v]trim=start=${at}:duration=${end - start},setpts=PTS-STARTPTS[v${i}]`
    )
    .join(";")
  const music = clips.length
  ff(
    ...inputs,
    "-i",
    "media/fetched/calm.mp3",
    "-filter_complex",
    `${trims};${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v];[${music}:a]atrim=duration=${duration}[a]`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    `renders/${version}.mp4`
  )
}

write("CLAUDE.md", instructions)
write(".gitignore", "media/\nrenders/\n.DS_Store\n")
write("assets.json", assets)

const v1Clips = [
  ["clip-01", 0, 4, "a-01", 1],
  ["clip-02", 4, 9, "a-02", 0],
  ["clip-03", 9, 13, "a-03", 1],
]
write("timeline.json", timeline({ clips: v1Clips, duration: 13, extra: [] }))
render("v1", v1Clips, 13)
write("review/agent.json", { rounds: [], findings: [] })
git("init", "-q", "-b", "main")
git("add", "-A")
git("commit", "-q", "-m", "v1: 三个镜头按顺序接上，配安静的音乐")

// Round v1: two comments, a plan, an approval, then the work.
write("review/comments.json", {
  comments: [
    {
      id: "c-01",
      version: "v1",
      intent: "change",
      text: "彩条这段太拖，缩短一半",
      anchor: { kind: "clip", track: "main", clip: "clip-02", time: { start: 4, end: 9 } },
      context: {
        source: { asset: "a-02", path: "media/user/A2.mp4", in: 0, out: 5 },
        neighbors: ["clip-01", "clip-03"],
        concurrent: [],
        history: [],
      },
      createdAt: "2026-11-17T09:00:00.000Z",
    },
    {
      id: "c-02",
      version: "v1",
      intent: "add",
      text: "这里硬切太突然，加个转场",
      anchor: {
        kind: "seam",
        track: "main",
        seam: ["clip-01", "clip-02"],
        time: { start: 4, end: 4 },
      },
      context: { neighbors: ["clip-02"], concurrent: [], history: [] },
      createdAt: "2026-11-17T09:01:00.000Z",
    },
  ],
  rounds: [
    {
      version: "v1",
      submittedAt: "2026-11-17T09:02:00.000Z",
      decision: { revision: 1, status: "approved", objections: {}, at: "2026-11-17T09:05:00.000Z" },
    },
  ],
  dismissed: [],
})

const v2Clips = [
  ["clip-01", 0, 4, "a-01", 1],
  ["clip-02", 4, 6.5, "a-02", 0],
  ["clip-03", 6.5, 10.5, "a-03", 1],
]
write(
  "timeline.json",
  timeline({
    clips: v2Clips,
    duration: 10.5,
    extra: [
      {
        id: "pip",
        kind: "overlay",
        clips: [{ id: "ov-01", start: 7, end: 10, asset: "a-logo", label: "logo" }],
      },
      {
        id: "fx",
        kind: "effect",
        clips: [
          { id: "fx-01", start: 3.7, end: 4.3, effect: "叠化", transition: true },
          { id: "fx-02", start: 6.5, end: 10.5, effect: "暖色调" },
        ],
      },
    ],
  })
)
render("v2", v2Clips, 10.5)
write("review/agent.json", {
  rounds: [
    {
      version: "v1",
      revision: 1,
      plan: [
        {
          comment: "c-01",
          action: "彩条从 5 秒裁到 2.5 秒，后面的分形和字幕前移",
          willChange: true,
        },
        { comment: "c-02", action: "在开场和彩条之间加 0.6 秒叠化", willChange: true },
      ],
      replies: [
        { comment: "c-01", text: "裁到 2.5 秒，分形镜头前移到 6.5 秒", done: true },
        { comment: "c-02", text: "加了 0.6 秒叠化", done: true },
      ],
      result: "v2",
    },
  ],
  findings: [
    {
      id: "f-01",
      version: "v2",
      kind: "色调跳变",
      text: "彩条接分形时亮度突变",
      anchor: { kind: "range", time: { start: 6.2, end: 6.8 }, clip: "clip-03" },
    },
  ],
})
git("add", "-A")
git("commit", "-q", "-m", "v2: 彩条缩短一半，开场接彩条加叠化，结尾加 logo")

console.log(out)
