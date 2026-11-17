import { cn } from "@workspace/ui/lib/utils"
import type { Asset, Clip, Track } from "@workspace/core/schema"
import type { ClipChange } from "@workspace/core/timeline/diff"
import { PEAKS_PER_SECOND, shortLabel } from "@workspace/core/timeline/query"
import { useEffect, useRef } from "react"

import { mediaUrl, thumbUrl } from "@/lib/api"
import { CHANGE_TONE } from "../review/changes"
import { usePeaks, useProjectPath } from "@/lib/project/hooks"

/** Heights of the rows that are not tracks; headers use the same classes so rows line up. */
export const ROW = { ruler: "h-8", notes: "h-8" } as const

/**
 * One lane's height per track kind, in pixels. A track whose clips overlap stacks several lanes,
 * so its height is computed and set inline on both the header and the row.
 */
export const LANE_PX: Record<Track["kind"], number> = {
  video: 56,
  overlay: 40,
  text: 32,
  voice: 40,
  music: 40,
  effect: 28,
}

/**
 * Clips, seams and marks are buttons the lanes press for you: a drag that starts on one selects
 * a span across it, and a press that doesn't move clicks it (see the timeline's pointer up).
 * The keyboard clicks them directly.
 */
export function activate(pick: () => void) {
  return { "data-pick": true, onClick: pick }
}

const TONE: Record<Track["kind"], string> = {
  video: "bg-surface-2",
  overlay: "bg-chart-2/25",
  text: "bg-surface-3",
  voice: "bg-chart-1/20",
  music: "bg-chart-3/20",
  effect: "bg-chart-4/25",
}

const WAVE_TOKEN: Partial<Record<Track["kind"], string>> = {
  voice: "--chart-1",
  music: "--chart-3",
}

type ClipProps = {
  track: Track
  clip: Clip
  label: string
  zoom: number
  /** The clip's lane inside its track row, in pixels from the row's top. */
  top: number
  height: number
  asset?: Asset
  /** The preview render of this version, for main-track frames. */
  renderFile?: string
  /** Seconds its lane stays free from the clip's start; a name may run on into that space. */
  room: number
  selected: boolean
  change?: ClipChange["kind"]
  onPick: () => void
}

export function ClipBlock({
  track,
  clip,
  label,
  zoom,
  top,
  height,
  asset,
  renderFile,
  room,
  selected,
  change,
  onPick,
}: ClipProps) {
  const left = clip.start * zoom
  // Two pixels short, so abutting clips read as two blocks with a cut between them.
  const width = Math.max(2, (clip.end - clip.start) * zoom - 2)

  if (track.kind === "effect" && clip.transition) {
    return (
      <button
        type="button"
        aria-label={`转场：${label}`}
        title={label}
        {...activate(onPick)}
        className={cn(
          "absolute size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-xs bg-chart-4",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
        )}
        style={{ left: ((clip.start + clip.end) / 2) * zoom, top: top + height / 2 }}
      />
    )
  }

  // Lanes without media inside let a short clip's name run on past its end, up to the next clip.
  const spill = track.kind === "effect" || track.kind === "text"
  const labelWidth = spill ? Math.max(width, Math.min(room * zoom - 6, 240)) : undefined
  const shown = track.kind === "effect" ? shortLabel(label) : label

  return (
    <button
      type="button"
      {...activate(onPick)}
      title={label}
      className={cn(
        "absolute rounded-sm text-left",
        !spill && "overflow-hidden",
        TONE[track.kind],
        selected && "ring-2 ring-primary",
        !selected && change && ["ring-2", CHANGE_TONE[change]]
      )}
      style={{ left, width, top: top + 2, height: height - 4 }}
    >
      {track.kind === "video" && renderFile && <Frames file={renderFile} clip={clip} zoom={zoom} />}
      {track.kind === "overlay" && asset && <AssetThumb asset={asset} at={clip.in ?? 0} />}
      {(track.kind === "voice" || track.kind === "music") && asset && (
        <Waveform asset={asset} clip={clip} width={width} token={WAVE_TOKEN[track.kind]!} />
      )}
      {track.kind === "music" &&
        clip.beats?.map((b) => (
          <span
            key={b}
            className="absolute bottom-0 h-1.5 w-px bg-chart-3"
            style={{ left: (b - clip.start) * zoom }}
          />
        ))}
      <span
        className={cn(
          "block truncate px-1.5 text-xs",
          track.kind === "video"
            ? "absolute inset-x-0 bottom-0 bg-background/85 leading-5"
            : "relative leading-6",
          track.kind === "overlay" && "pl-11"
        )}
        style={labelWidth ? { width: labelWidth } : undefined}
      >
        {shown}
      </span>
    </button>
  )
}

/** Frames from the preview render, one per frame-width of lane, sampled at stable times. */
function Frames({ file, clip, zoom }: { file: string; clip: Clip; zoom: number }) {
  const p = useProjectPath()
  const frameWidth = (LANE_PX.video * 16) / 9
  const step = Math.max(0.5, frameWidth / zoom)
  const times: number[] = []
  for (let t = clip.start; t < clip.end && times.length < 60; t += step)
    times.push(t + Math.min(step, clip.end - t) / 2)
  return (
    <div className="absolute inset-0 flex">
      {times.map((t) => (
        <img
          key={t}
          src={thumbUrl(p, file, t, 160)}
          alt=""
          loading="lazy"
          className="h-full shrink-0 object-cover"
          style={{ width: step * zoom }}
          draggable={false}
        />
      ))}
    </div>
  )
}

function AssetThumb({ asset, at }: { asset: Asset; at: number }) {
  const p = useProjectPath()
  const src = asset.kind === "video" ? thumbUrl(p, asset.path, at, 80) : mediaUrl(p, asset.path)
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="absolute inset-y-0 left-0 w-10 object-cover"
      draggable={false}
    />
  )
}

/** Peaks of the clip's span of its source, drawn in the lane's token color. */
function Waveform({
  asset,
  clip,
  width,
  token,
}: {
  asset: Asset
  clip: Clip
  width: number
  token: string
}) {
  const data = usePeaks(asset.path)
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data) return
    const w = Math.min(4096, Math.ceil(width))
    const h = canvas.clientHeight || 36
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue(token).trim()
    const from = (clip.in ?? 0) * PEAKS_PER_SECOND
    const span =
      ((clip.out ?? clip.in ?? 0) - (clip.in ?? 0) || clip.end - clip.start) * PEAKS_PER_SECOND
    for (let x = 0; x < w; x++) {
      const v = data[Math.floor(from + (x / w) * span)] ?? 0
      const bar = Math.max(1, v * h * 0.9)
      ctx.fillRect(x, (h - bar) / 2, 1, bar)
    }
  }, [data, clip.in, clip.out, clip.start, clip.end, width, token])

  return <canvas ref={ref} className="absolute inset-0 size-full opacity-70" />
}
