import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Slider } from "@workspace/ui/components/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { Pause, Play, SquareDashed, Volume2, VolumeX, X } from "lucide-react"

import { PATHS } from "@workspace/core/project/layout"
import { useViewNavigation, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { formatTime } from "@workspace/core/timeline/query"
import { Player } from "./player"

export function Stage({ session, className }: { session: Session; className?: string }) {
  const { viewing, comparing } = session
  const { compare } = useViewNavigation()
  if (!viewing) return null

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-2">
        {comparing && (
          <figure className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">
            {/* Ending the comparison sits on the thing it removes. */}
            <figcaption className="flex h-6 items-center gap-1 text-xs text-muted-foreground">
              {comparing.name}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`结束对比 ${comparing.name}`}
                title="结束对比"
                onClick={() => void compare(undefined)}
              >
                <X />
              </Button>
            </figcaption>
            <Player path={PATHS.render(comparing.name)} follower session={session} />
          </figure>
        )}
        <figure className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">
          {comparing && (
            <figcaption className="flex h-6 items-center text-xs text-muted-foreground">
              {viewing.name}
            </figcaption>
          )}
          <Player path={PATHS.render(viewing.name)} session={session} />
        </figure>
      </div>
      <Transport session={session} />
    </section>
  )
}

const RATES = [0.25, 0.5, 1, 1.5, 2]

function Transport({ session }: { session: Session }) {
  const time = useReviewUi((s) => s.time)
  const playing = useReviewUi((s) => s.playing)
  const drawing = useReviewUi((s) => s.drawing)
  const toggle = useReviewUi((s) => s.toggle)
  const setDrawing = useReviewUi((s) => s.setDrawing)
  const duration = session.timeline?.duration ?? 0
  const fps = session.timeline?.fps ?? 30

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 lg:pb-0">
      <div className="-ml-2 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={playing ? "暂停" : "播放"}
                onClick={toggle}
              >
                {playing ? <Pause /> : <Play className="translate-x-px" />}
              </Button>
            }
          />
          <TooltipContent>空格</TooltipContent>
        </Tooltip>
        <span className="font-mono text-xs tabular-nums">
          {formatTime(time)}
          <span className="text-subtle-foreground"> / {formatTime(duration)}</span>
        </span>
      </div>
      <Slider
        className="min-w-32 flex-1"
        aria-label="播放进度"
        min={0}
        max={Math.max(duration, 1 / fps)}
        step={1 / fps}
        value={Math.min(time, duration)}
        onValueChange={(value) => {
          const ui = useReviewUi.getState()
          ui.video?.pause()
          ui.seek(Array.isArray(value) ? value[0]! : value)
        }}
      />
      <div className="-mr-2 flex items-center gap-1">
        <RateMenu />
        <MuteButton />
        {session.editable && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={drawing ? "secondary" : "ghost"}
                  size="sm"
                  className="ml-3"
                  aria-pressed={drawing}
                  onClick={() => setDrawing(!drawing)}
                >
                  <SquareDashed data-icon="inline-start" />
                  框选画面
                </Button>
              }
            />
            <TooltipContent>B</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function RateMenu() {
  const rate = useReviewUi((s) => s.rate)
  const setRate = useReviewUi((s) => s.setRate)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={`播放速度 ${rate}×`}>
            <span className="tabular-nums">{rate}×</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="top" className="w-28">
        <DropdownMenuRadioGroup value={rate} onValueChange={(v) => setRate(Number(v))}>
          {RATES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r}>
              <span className="tabular-nums">{r}×</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MuteButton() {
  const muted = useReviewUi((s) => s.muted)
  const setMuted = useReviewUi((s) => s.setMuted)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={muted ? "取消静音" : "静音"}
            aria-pressed={muted}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
        }
      />
      <TooltipContent>{muted ? "取消静音" : "静音"}</TooltipContent>
    </Tooltip>
  )
}
