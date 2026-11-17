import { expect, test } from "vite-plus/test"

import type { Clip, Timeline } from "../src/schema"
import { diffTimelines } from "../src/timeline/diff"

const cut = (clips: Clip[]): Timeline => ({
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 30,
  tracks: [{ id: "main", kind: "video", clips }],
  markers: { scenes: [], beats: [] },
})

const shot = (id: string, start: number, end: number, from: number, to: number): Clip => ({
  id,
  start,
  end,
  asset: "a-s1",
  in: from,
  out: to,
})

const summary = (older: Timeline, newer: Timeline) =>
  diffTimelines(older, newer).changes.map((c) =>
    c.kind === "split"
      ? `split ${c.before.id} -> ${c.pieces.map((p) => p.id).join(",")}`
      : `${c.kind} ${c.clip.id}`
  )

// Tightening one long clip shot by shot is a recut of existing footage. Listing its pieces as new
// clips told the reviewer the version brought in material it never did.
test("pieces cut out of one older clip read as a split, not as new clips", () => {
  const v2 = cut([shot("clip-01", 0, 4.8, 0, 4.8), shot("clip-04", 4.8, 26.8, 8, 30)])
  const v3 = cut([
    shot("clip-01", 0, 2.8, 2, 4.8),
    shot("clip-04", 2.8, 4.8, 8, 10),
    shot("clip-21", 4.8, 6.6, 11, 12.8),
    shot("clip-22", 6.6, 9.4, 15, 17.8),
  ])
  expect(summary(v2, v3)).toEqual(["changed clip-01", "split clip-04 -> clip-04,clip-21,clip-22"])
})

test("a split whose original id is gone still names the clip it came from", () => {
  const v2 = cut([shot("clip-02", 0, 30, 0, 30)])
  const v3 = cut([shot("clip-30", 0, 3, 1, 4), shot("clip-31", 3, 5, 20, 22)])
  expect(summary(v2, v3)).toEqual(["split clip-02 -> clip-30,clip-31"])
})

test("footage repeated while its clip still plays it is a new clip", () => {
  const v2 = cut([shot("clip-01", 0, 10, 0, 10)])
  const v3 = cut([shot("clip-01", 0, 10, 0, 10), shot("clip-09", 10, 12, 4, 6)])
  expect(summary(v2, v3)).toEqual(["added clip-09"])
})
