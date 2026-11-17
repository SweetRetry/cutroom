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
import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"
import { toast } from "sonner"

import type { Version } from "server/app"

import { api, unwrap } from "@/lib/api"
import { useProjectPath, useRefresh } from "@/lib/project/hooks"
import { useViewNavigation, type Session } from "@/lib/review/session"
import { ChangeList } from "../review/changes"

const when = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * Every version on every branch, newest first: open one, compare it, or continue from it. While
 * comparing, what the cut changed sits right under the list, so picking the pair and reading the
 * difference happen in one place. The continue dialog is a sibling so it outlives a re-render.
 */
export function VersionPanel({ session }: { session: Session }) {
  const [target, setTarget] = useState<Version>()

  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      <VersionList session={session} onContinue={setTarget} />
      <ChangeList session={session} />
      {target && (
        <ContinueDialog version={target} session={session} onClose={() => setTarget(undefined)} />
      )}
    </div>
  )
}

function VersionList({
  session,
  onContinue,
}: {
  session: Session
  onContinue: (version: Version) => void
}) {
  const { view, compare } = useViewNavigation()
  const versions = session.graph?.versions ?? []

  return (
    <ul className="-mx-2 flex flex-col gap-1">
      {versions.map((v) => {
        const isCurrent = v.oid === session.current?.oid
        const isViewing = v.oid === session.viewing?.oid
        const isComparing = v.oid === session.comparing?.oid
        return (
          <li
            key={v.oid}
            className={cn(
              "flex flex-col gap-1 rounded-md px-2 py-2 transition-colors",
              isViewing ? "bg-accent" : "hover:bg-accent/50"
            )}
          >
            <button
              type="button"
              className="flex flex-col gap-1 text-left"
              onClick={() => {
                void view(isCurrent ? undefined : v.name)
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
                  }}
                >
                  {isComparing ? "结束对比" : `对比 ${v.name}`}
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
      toast.error("切换版本失败", {
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
          <DialogTitle>将 {version.name} 设为当前版本</DialogTitle>
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
