import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { ChevronDown } from "lucide-react"

import { useFolder, useRecent } from "@/lib/project/open"

const OPEN_SHORTCUT = navigator.platform.startsWith("Mac") ? "⌘O" : "Ctrl+O"

/**
 * The workspace's folder, as in an editor's title bar: the name opens a menu to open another
 * folder, jump to a recent one, or close this one and return to the empty workspace.
 */
export function ProjectMenu({ path, name }: { path?: string; name?: string }) {
  const { open, pick, close } = useFolder()
  const recent = (useRecent().data ?? []).filter((r) => r !== path).slice(0, 6)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="-ml-2.5 min-w-0">
            <span className="truncate font-medium">{name ?? "Cutroom"}</span>
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onClick={() => void pick()}>
          打开文件夹…
          <DropdownMenuShortcut>{OPEN_SHORTCUT}</DropdownMenuShortcut>
        </DropdownMenuItem>
        {recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>最近打开</DropdownMenuLabel>
              {recent.map((r) => (
                <DropdownMenuItem key={r} title={r} onClick={() => void open(r)}>
                  <span className="truncate">{r.split("/").pop()}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        {path && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void close()}>关闭文件夹</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
