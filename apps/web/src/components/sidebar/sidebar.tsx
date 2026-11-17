import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { History, Images, type LucideIcon } from "lucide-react"

import type { Session } from "@/lib/review/session"
import { useReviewUi, type SidePanel } from "@/lib/review/ui-store"
import { VersionPanel } from "../workspace/versions"
import { AssetList } from "./assets"

const PANELS: Record<SidePanel, { label: string; icon: LucideIcon }> = {
  assets: { label: "素材", icon: Images },
  versions: { label: "版本", icon: History },
}

/**
 * The left column holds what the review refers to but isn't the review: the material the cut is
 * made of, and the versions with their comparison. A narrow rail switches between them, so the
 * header keeps only the round's own actions.
 */
export function Sidebar({ session, className }: { session: Session; className?: string }) {
  const panel = useReviewUi((s) => s.panel)
  const setPanel = useReviewUi((s) => s.setPanel)

  return (
    <aside className={cn("flex min-h-0 flex-col bg-sidebar lg:flex-row", className)}>
      <nav
        aria-label="侧栏"
        className="flex shrink-0 gap-1 px-2 pt-2 lg:flex-col lg:px-1.5 lg:pt-3"
      >
        {(Object.keys(PANELS) as SidePanel[]).map((key) => {
          const { label, icon: Icon } = PANELS[key]
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <Button
                    variant={panel === key ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={label}
                    aria-pressed={panel === key}
                    onClick={() => setPanel(key)}
                  >
                    <Icon />
                  </Button>
                }
              />
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pt-4">
        <h2 className="px-4 text-xs font-medium text-muted-foreground">{PANELS[panel].label}</h2>
        <ScrollArea className="min-h-0 flex-1">
          {panel === "assets" ? (
            <AssetList session={session} />
          ) : (
            <VersionPanel session={session} />
          )}
        </ScrollArea>
      </div>
    </aside>
  )
}
