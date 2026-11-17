import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { Version } from "server/app"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"

const when = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * The version name in the header opens every version on every branch, newest first: open one,
 * compare it, or continue from it. Versions change rarely, so they live behind the name instead
 * of taking a column. The continue dialog sits outside the popover so closing one keeps the other.
 */
export function VersionSwitcher({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Version>()
  const { viewing, editable } = session
  if (!viewing) return null

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" aria-label="切换版本" className="-ml-2.5 shrink-0">
              <span className="font-medium tabular-nums">{viewing.name}</span>
              {session.graph?.branch && editable && (
                <span className="text-xs text-subtle-foreground">{session.graph.branch}</span>
              )}
              <ChevronDown data-icon="inline-end" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-80">
          <VersionList
            session={session}
            onDone={() => setOpen(false)}
            onContinue={(v) => {
              setOpen(false)
              setTarget(v)
            }}
          />
        </PopoverContent>
      </Popover>
      {target && (
        <ContinueDialog version={target} session={session} onClose={() => setTarget(undefined)} />
      )}
    </>
  )
}

function VersionList({
  session,
  onDone,
  onContinue,
}: {
  session: Session
  onDone: () => void
  onContinue: (version: Version) => void
}) {
  const { view, compare } = useViewNavigation()
  const versions = session.graph?.versions ?? []

  return (
    <ul className="flex max-h-96 flex-col overflow-y-auto">
      {versions.map((v) => {
        const isCurrent = v.oid === session.current?.oid
        const isViewing = v.oid === session.viewing?.oid
        const isComparing = v.oid === session.comparing?.oid
        return (
          <li
            key={v.oid}
            className={cn(
              "flex flex-col gap-1 rounded-sm px-2 py-2 transition-colors",
              isViewing ? "bg-accent" : "hover:bg-accent/50"
            )}
          >
            <button
              type="button"
              className="flex flex-col gap-1 text-left"
              onClick={() => {
                void view(isCurrent ? undefined : v.name)
                onDone()
              }}
            >
              <span className="flex items-baseline gap-2">
                <span className="font-medium tabular-nums">{v.name}</span>
                {isCurrent && <span className="text-xs text-primary">当前</span>}
                <span className="ml-auto text-xs text-subtle-foreground tabular-nums">
                  {when.format(new Date(v.time))}
                </span>
              </span>
              <span className="line-clamp-2 text-muted-foreground">{v.summary}</span>
            </button>
            {!isViewing && (
              <div className="-ml-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  aria-pressed={isComparing}
                  onClick={() => {
                    void compare(isComparing ? undefined : v.name)
                    onDone()
                  }}
                >
                  {isComparing ? "结束对比" : `与 ${session.viewing?.name ?? ""} 对比`}
                </Button>
                {!isCurrent && (
                  <Button variant="ghost" size="xs" onClick={() => onContinue(v)}>
                    设为当前
                  </Button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** `from-v2`, or `from-v2-2` when that is taken. */
function defaultBranchName(version: Version, taken: string[]) {
  const base = `from-${version.name}`
  let name = base
  for (let i = 2; taken.includes(name); i++) name = `${base}-${i}`
  return name
}

/**
 * Rollback and branching are the same move in git: continue from an old version on a branch of
 * its own. The versions after it stay where they are and can be made current again.
 */
function ContinueDialog({
  version,
  session,
  onClose,
}: {
  version: Version
  session: Session
  onClose: () => void
}) {
  const p = useProjectPath()
  const refresh = useRefresh()
  const { view } = useViewNavigation()
  const branches = session.graph?.versions.flatMap((v) => v.tips) ?? []
  const [name, setName] = useState(() => defaultBranchName(version, branches))
  const [busy, setBusy] = useState(false)
  const tip = version.tips[0]
  const validName = /^[\w./-]+$/.test(name) && !branches.includes(name)

  const run = async () => {
    setBusy(true)
    try {
      await unwrap(api.versions.continue.post({ p, oid: version.oid, branch: name }))
      await refresh()
      await view(undefined)
      toast.success(`${version.name} 已设为当前版本`)
      onClose()
    } catch (error) {
      toast.error("没能切换版本", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>把 {version.name} 设为当前版本</DialogTitle>
          <DialogDescription>
            {tip
              ? `切换到分支 ${tip}。之后的评论写在 ${version.name} 上。`
              : `从 ${version.name} 开一条新分支继续。${session.current?.name ?? "当前版本"} 和它之前的版本都保留在原分支上，随时可以再设回当前。`}
          </DialogDescription>
        </DialogHeader>
        {!tip && (
          <div className="flex flex-col gap-2">
            <label htmlFor="branch-name" className="text-sm font-medium">
              分支名
            </label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!validName}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || (!tip && !validName)} onClick={() => void run()}>
            设为当前
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
