import { createHash } from "node:crypto"
import { mkdir, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Region } from "@workspace/core/schema"

import type { Project } from "./project"

/**
 * Media work for the review page: serving files with byte ranges (seeking a 4K render must not
 * download it whole), thumbnails, waveforms and comment frames. ffmpeg does the decoding, so
 * any codec ffmpeg reads works, including HEVC the browser can't scrub cheaply.
 */

const CACHE = join(tmpdir(), "cutroom-cache")

/** At most four ffmpeg processes at once; a zoomed-in timeline asks for dozens of frames. */
let running = 0
const waiting: Array<() => void> = []
async function ffmpeg(args: string[]): Promise<Uint8Array> {
  if (running >= 4) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    const proc = Bun.spawn(["ffmpeg", "-v", "error", "-nostdin", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (code !== 0) throw new Error(err.trim() || "ffmpeg failed")
    return new Uint8Array(out)
  } finally {
    running--
    waiting.shift()?.()
  }
}

export async function serveFile(
  project: Project,
  rel: string,
  request: Request
): Promise<Response> {
  const file = Bun.file(project.path(rel))
  if (!(await file.exists())) return new Response("not found", { status: 404 })
  const size = file.size
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "")
  const headers = {
    "accept-ranges": "bytes",
    "content-type": file.type,
    "cache-control": "no-cache",
  }
  if (!range) return new Response(file, { headers: { ...headers, "content-length": String(size) } })
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } })
  }
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
    },
  })
}

async function cacheKey(abs: string, ...parts: Array<string | number>) {
  const { mtimeMs, size } = await stat(abs)
  return createHash("sha1")
    .update([abs, mtimeMs, size, ...parts].join("|"))
    .digest("hex")
}

/** A JPEG of one frame, cached by file, mtime, time (to a tenth of a second) and width. */
export async function thumbnail(project: Project, rel: string, time: number, width: number) {
  const abs = project.path(rel)
  const t = Math.max(0, Math.round(time * 10) / 10)
  const out = join(CACHE, `${await cacheKey(abs, t, width)}.jpg`)
  const cached = Bun.file(out)
  if (await cached.exists()) return cached
  await mkdir(CACHE, { recursive: true })
  const jpg = await ffmpeg([
    "-ss",
    String(t),
    "-i",
    abs,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:-2`,
    "-f",
    "image2",
    "-c:v",
    "mjpeg",
    "-q:v",
    "5",
    "pipe:1",
  ])
  await Bun.write(out, jpg)
  return Bun.file(out)
}

import { PEAKS_PER_SECOND } from "@workspace/core/timeline/query"
const peakCache = new Map<string, Promise<number[]>>()

/** Loudness per 1/40 s of the file's first audio track; empty when there is none. */
export async function peaks(project: Project, rel: string): Promise<number[]> {
  const abs = project.path(rel)
  const key = await cacheKey(abs)
  let hit = peakCache.get(key)
  if (!hit) {
    hit = ffmpeg(["-i", abs, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"]).then(
      (pcm) => {
        const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
        const step = 8000 / PEAKS_PER_SECOND
        const out: number[] = []
        for (let i = 0; i < samples.length; i += step) {
          let max = 0
          for (let j = i; j < Math.min(samples.length, i + step); j++)
            max = Math.max(max, Math.abs(samples[j]!))
          out.push(Math.round((max / 32768) * 100) / 100)
        }
        return out
      },
      () => []
    )
    peakCache.set(key, hit)
  }
  return hit
}

// The theme's warning color (DESIGN.md tokens), so a boxed region reads the same in the app.
const BOX = "0xE3A33B"

/** The PNG a comment carries: its frame, with the region outlined when there is one. */
export async function frame(project: Project, renderRel: string, time: number, region?: Region) {
  const filters = ["scale=960:-2"]
  if (region) {
    filters.push(
      `drawbox=x=iw*${region.x}:y=ih*${region.y}:w=iw*${region.w}:h=ih*${region.h}:color=${BOX}:t=4`
    )
  }
  return ffmpeg([
    "-ss",
    String(Math.max(0, time)),
    "-i",
    project.path(renderRel),
    "-frames:v",
    "1",
    "-vf",
    filters.join(","),
    "-f",
    "image2",
    "-c:v",
    "png",
    "pipe:1",
  ])
}
