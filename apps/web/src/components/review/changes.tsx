import { Button } from "@workspace/ui/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { useAssets } from "@/lib/project/hooks"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { TRACK_KIND_LABEL, type Clip } from "@workspace/core/schema"
import { CLIP_FIELD_LABEL, type ClipChange, type ClipField } from "@workspace/core/timeline/diff"
import { clipLabel, formatTime } from "@workspace/core/timeline/query"

/** The ring each kind wears on the timeline, so the list and the lanes read as one key. */
export const CHANGE_TONE: Record<ClipChange["kind"], string> = {
  added: "ring-chart-2",
  changed: "ring-warning",
  removed: "ring-destructive",
}

const CHANGE_LABEL: Record<ClipChange["kind"], string> = {
  added: "新增",
  changed: "修改",
  removed: "删除",
}

/**
 * The changes sit behind a button next to the comparison, not in the comment panel: that panel is
 * the conversation with the editing side, and a diff is a fact about two versions.
 */
export function ChangesPopover({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  if (!session.diff || !session.comparing) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm">
            改动 <span className="tabular-nums">{session.diff.changes.length}</span>
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <PopoverContent align="start" className="max-h-112 w-96 overflow-y-auto">
        <ChangeList session={session} onPick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Everything the cut changed between the compared version and the viewed one, in play order.
 * Picking a change moves the playhead there and, on the current version, puts the comment box on
 * that clip, so "this change made it worse" is one click and a sentence away.
 */
function ChangeList({ session, onPick }: { session: Session; onPick: () => void }) {
  const { diff, comparing, viewing, timeline } = session
  const assets = useAssets()
  const anchor = useReviewUi((s) => s.anchor)
  if (!diff || !comparing || !viewing || !timeline) return null

  const counts = (["added", "changed", "removed"] as const)
    .map((kind) => [kind, diff.changes.filter((c) => c.kind === kind).length] as const)
    .filter(([, n]) => n > 0)

  const trackName = (id: string) => {
    const track = timeline.tracks.find((t) => t.id === id)
    return track ? (track.name ?? TRACK_KIND_LABEL[track.kind]) : id
  }
  const label = (change: ClipChange, clip: Clip) => {
    const track = timeline.tracks.find((t) => t.id === change.track)
    return track ? clipLabel(track, clip, assets) : (clip.label ?? clip.effect ?? clip.id)
  }

  const pick = (change: ClipChange) => {
    const ui = useReviewUi.getState()
    ui.seek(change.clip.start)
    if (session.editable && change.kind !== "removed")
      ui.setAnchor({
        kind: "clip",
        track: change.track,
        clip: change.clip.id,
        time: { start: change.clip.start, end: change.clip.end },
      })
    onPick()
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span>
          {comparing.name} 到 {viewing.name} 的改动
        </span>
        {counts.map(([kind, n]) => (
          <span key={kind} className="inline-flex items-center gap-1.5 font-normal tabular-nums">
            <span className={cn("size-2 rounded-xs ring-2", CHANGE_TONE[kind])} />
            {CHANGE_LABEL[kind]} {n}
          </span>
        ))}
      </h3>
      {diff.changes.length === 0 ? (
        <p className="text-muted-foreground">两个版本的时间轴相同</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {diff.changes.map((change) => (
            <li key={`${change.kind}-${change.clip.id}`} className="-mx-2">
              <button
                type="button"
                onClick={() => pick(change)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2",
                  anchor?.kind === "clip" && anchor.clip === change.clip.id && "bg-surface-2"
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn("size-2 shrink-0 rounded-xs ring-2", CHANGE_TONE[change.kind])}
                  />
                  <span className="font-medium text-foreground">{CHANGE_LABEL[change.kind]}</span>
                  <span className="min-w-0 truncate tabular-nums">
                    {trackName(change.track)} {span(change.clip)}
                  </span>
                </span>
                <span
                  className={cn(change.kind === "removed" && "text-muted-foreground line-through")}
                >
                  {label(change, change.clip)}
                </span>
                {change.kind === "changed" &&
                  change.fields.map((field) => (
                    <Detail
                      key={field}
                      field={field}
                      before={change.before}
                      after={change.clip}
                      label={(clip) => label(change, clip)}
                    />
                  ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One changed field as "what it was → what it is", where the values are short enough to read. */
function Detail({
  field,
  before,
  after,
  label,
}: {
  field: ClipField
  before: Clip
  after: Clip
  label: (clip: Clip) => string
}) {
  const values: Partial<Record<ClipField, [string, string]>> = {
    time: [span(before), span(after)],
    content: [label(before), label(after)],
    source: [source(before), source(after)],
  }
  const pair = values[field]
  return (
    <span className="flex flex-col gap-0.5 border-l-2 pl-3 text-xs text-muted-foreground">
      <span className="font-medium">{CLIP_FIELD_LABEL[field]}</span>
      {pair && pair[0] !== pair[1] && (
        <span className="tabular-nums">
          <span className="line-through">{pair[0]}</span>
          <span className="text-subtle-foreground"> → </span>
          <span className="text-foreground">{pair[1]}</span>
        </span>
      )}
    </span>
  )
}

function span(clip: Clip) {
  return `${formatTime(clip.start)}–${formatTime(clip.end)}`
}

function source(clip: Clip) {
  const range =
    clip.in !== undefined ? ` ${formatTime(clip.in)}–${formatTime(clip.out ?? clip.in)}` : ""
  return `${clip.asset ?? "无素材"}${range}`
}
