import { create } from "zustand"

import type { Anchor } from "@workspace/core/schema"

/**
 * Review UI state that several panels share. The <video> element is the clock: `time` mirrors
 * it, and `seek` moves it, so the timeline, the player and the composer never disagree.
 */
type ReviewUi = {
  video: HTMLVideoElement | null
  time: number
  playing: boolean
  /** Timeline zoom, in pixels per second. */
  zoom: number
  /** Zoom follows the lane width so the whole cut is in view, until the reviewer zooms. */
  fitted: boolean
  /** The place the next comment will be attached to; null means 全片. */
  anchor: Anchor | null
  /** Drawing a box on the frame. */
  drawing: boolean
  /** The comment highlighted in the panel and on the annotation lane. */
  focused: string | null
  /** Bumped to move keyboard focus to the comment box (after M, or after picking an anchor). */
  composeTick: number

  attach(video: HTMLVideoElement | null): void
  seek(time: number): void
  toggle(): void
  setAnchor(anchor: Anchor | null, compose?: boolean): void
  setDrawing(drawing: boolean): void
  setZoom(zoom: number): void
  /** The zoom that shows the whole cut; applied while `fitted`. */
  fitTo(zoom: number): void
  fit(): void
  focus(id: string | null): void
}

const ZOOM = { min: 8, max: 400, initial: 48 } as const
const clampZoom = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))

export const useReviewUi = create<ReviewUi>((set, get) => ({
  video: null,
  time: 0,
  playing: false,
  zoom: ZOOM.initial,
  fitted: true,
  anchor: null,
  drawing: false,
  focused: null,
  composeTick: 0,

  attach: (video) => set({ video, playing: false, time: video?.currentTime ?? 0 }),
  seek: (time) => {
    const { video } = get()
    const t = Math.max(
      0,
      video && Number.isFinite(video.duration) ? Math.min(time, video.duration) : time
    )
    if (video) video.currentTime = t
    set({ time: t })
  },
  toggle: () => {
    const { video } = get()
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  },
  setAnchor: (anchor, compose = false) =>
    set((s) => ({
      anchor,
      drawing: false,
      composeTick: compose ? s.composeTick + 1 : s.composeTick,
    })),
  setDrawing: (drawing) => {
    if (drawing) get().video?.pause()
    set({ drawing })
  },
  setZoom: (zoom) => set({ zoom: clampZoom(zoom), fitted: false }),
  fitTo: (zoom) => {
    if (get().fitted) set({ zoom: clampZoom(zoom) })
  },
  fit: () => set({ fitted: true }),
  focus: (focused) => set({ focused }),
}))
