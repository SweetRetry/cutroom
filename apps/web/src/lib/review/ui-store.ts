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
  /** Playback speed and sound; kept here so a new render file picks them up. */
  rate: number
  muted: boolean
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
  /** Which panel the left rail shows. */
  panel: SidePanel
  /** The asset open full screen, by id. */
  asset: string | null
  /** An asset to put into the comment box as a chip; the counter makes a repeat count. */
  quote: { id: string; label: string; n: number } | null

  attach(video: HTMLVideoElement | null): void
  seek(time: number): void
  toggle(): void
  setRate(rate: number): void
  setMuted(muted: boolean): void
  setAnchor(anchor: Anchor | null, compose?: boolean): void
  setDrawing(drawing: boolean): void
  setZoom(zoom: number): void
  /** The zoom that shows the whole cut; applied while `fitted`. */
  fitTo(zoom: number): void
  fit(): void
  focus(id: string | null): void
  setPanel(panel: SidePanel): void
  openAsset(id: string | null): void
  quoteAsset(asset: { id: string; label: string }): void
}

export type SidePanel = "assets" | "versions"

const ZOOM = { min: 8, max: 400, initial: 48 } as const
const clampZoom = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))

export const useReviewUi = create<ReviewUi>((set, get) => ({
  video: null,
  time: 0,
  playing: false,
  rate: 1,
  muted: false,
  zoom: ZOOM.initial,
  fitted: true,
  anchor: null,
  drawing: false,
  focused: null,
  composeTick: 0,
  panel: "assets",
  asset: null,
  quote: null,

  attach: (video) => {
    if (video) {
      video.playbackRate = get().rate
      video.muted = get().muted
    }
    set({ video, playing: false, time: video?.currentTime ?? 0 })
  },
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
  setRate: (rate) => {
    const { video } = get()
    if (video) video.playbackRate = rate
    set({ rate })
  },
  setMuted: (muted) => {
    const { video } = get()
    if (video) video.muted = muted
    set({ muted })
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
  setPanel: (panel) => set({ panel }),
  openAsset: (asset) => set({ asset }),
  quoteAsset: (asset) => set((s) => ({ quote: { ...asset, n: (s.quote?.n ?? 0) + 1 } })),
}))
