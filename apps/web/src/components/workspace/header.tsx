import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useViewNavigation, type Session } from "@/lib/review/session"
import { useReviewUi } from "@/lib/review/ui-store"
import { ProjectMenu } from "./project-menu"

/** The window's top bar. Without a session it is the empty workspace's: only the folder menu. */
export function Header({ session, className }: { session?: Session; className?: string }) {
  return (
    // Narrow screens scroll the whole page; the header stays so the version stays in reach.
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-4 bg-background/85 px-4 backdrop-blur lg:static lg:bg-background lg:backdrop-blur-none",
        className
      )}
    >
      <ProjectMenu path={session?.files?.path} name={session?.files?.name} />
      {session && <ReviewActions session={session} />}
    </header>
  )
}

function ReviewActions({ session }: { session: Session }) {
  const { view } = useViewNavigation()
  const { current, editable } = session
  return (
    <>
      <VersionName session={session} />
      <div className="ml-auto flex shrink-0 items-center gap-4">
        {!editable && current && (
          <Button variant="secondary" onClick={() => void view(undefined)}>
            回到 {current.name}
          </Button>
        )}
      </div>
    </>
  )
}

/**
 * Which version the stage shows, and on which branch. Versions and their comparison live in the
 * left rail's 版本 panel; the name opens it.
 */
function VersionName({ session }: { session: Session }) {
  const setPanel = useReviewUi((s) => s.setPanel)
  const { viewing, comparing, editable } = session
  if (!viewing) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0"
      title="查看所有版本"
      onClick={() => setPanel("versions")}
    >
      <span className="font-medium tabular-nums">{viewing.name}</span>
      {comparing && (
        <span className="text-xs text-muted-foreground tabular-nums">对比 {comparing.name}</span>
      )}
      {session.graph?.branch && editable && (
        <span className="text-xs text-subtle-foreground">{session.graph.branch}</span>
      )}
    </Button>
  )
}
