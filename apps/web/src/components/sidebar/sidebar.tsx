import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

import type { Session } from "@/lib/review/session"
import { AssetList } from "./assets"

/** The left column is the material the cut is made of. Versions live behind the header's name. */
export function Sidebar({ session, className }: { session: Session; className?: string }) {
  return (
    <aside className={cn("flex min-h-0 flex-col gap-2 bg-sidebar pt-4", className)}>
      <h2 className="px-4 text-xs font-medium text-muted-foreground">素材</h2>
      <ScrollArea className="min-h-0 flex-1">
        <AssetList session={session} />
      </ScrollArea>
    </aside>
  )
}
