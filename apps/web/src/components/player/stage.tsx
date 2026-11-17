import { Button } from "@workspace/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { Pause, Play, SquareDashed } from "lucide-react"

import { PATHS } from "@workspace/core/project/layout"
import type { Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { formatTime } from "@workspace/core/timeline/query"
import { Player } from "./player"

export function Stage({ session, className }: { session: Session; className?: string }) {
  const { viewing, comparing } = session
  if (!viewing) return null

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row sm:gap-2">
        {comparing && (
          <figure className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">
            <figcaption className="text-xs text-muted-foreground">{comparing.name}</figcaption>
            <Player path={PATHS.render(comparing.name)} follower session={session} />
          </figure>
        )}
        <figure className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2">
          {comparing && (
            <figcaption className="text-xs text-muted-foreground">{viewing.name}</figcaption>
          )}
          <Player path={PATHS.render(viewing.name)} session={session} />
        </figure>
      </div>
      <Transport session={session} />
    </section>
  )
}

function Transport({ session }: { session: Session }) {
  const time = useReviewUi((s) => s.time)
  const playing = useReviewUi((s) => s.playing)
  const drawing = useReviewUi((s) => s.drawing)
  const toggle = useReviewUi((s) => s.toggle)
  const setDrawing = useReviewUi((s) => s.setDrawing)
  const duration = session.timeline?.duration ?? 0

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
      <div className="ml-auto flex items-center gap-4">
        {session.editable && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={drawing ? "secondary" : "ghost"}
                  size="sm"
                  className="-mr-2.5"
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
