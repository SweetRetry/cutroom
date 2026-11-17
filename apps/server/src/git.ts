/** The git CLI, run in a project folder. Errors carry git's own message. */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) throw new Error(err.trim() || out.trim() || `git ${args[0]} failed`)
  return out
}

export type Version = {
  name: string
  n: number
  oid: string
  summary: string
  /** ISO time of the commit. */
  time: string
  /** Branches whose newest version is this one. */
  tips: string[]
}

export type VersionGraph = {
  versions: Version[]
  /** The newest version in HEAD's history: the one under review. */
  current?: Version
  branch?: string
}

const SUBJECT = /^(v(\d+))\s*[:：]\s*(.*)$/

/**
 * Versions are commits whose subject starts with `vN:`, on every branch, so a version left
 * behind by a rollback stays listed. `null` when the folder isn't its own git repository.
 */
export async function readVersions(root: string): Promise<VersionGraph | null> {
  try {
    // A project inside some other repository must not borrow that repository's history.
    const top = (await git(root, "rev-parse", "--show-toplevel")).trim()
    if ((await realpath(top)) !== (await realpath(root))) return null
  } catch {
    return null
  }
  try {
    await git(root, "rev-parse", "--verify", "HEAD")
  } catch {
    return { versions: [] }
  }

  const byOid = new Map<string, Version>()
  const log = await git(root, "log", "--all", "--format=%H%x1f%cI%x1f%s")
  for (const line of log.split("\n")) {
    const [oid, time, subject] = line.split("\x1f")
    const match = subject && SUBJECT.exec(subject.trim())
    if (!oid || !time || !match) continue
    byOid.set(oid, {
      name: match[1]!,
      n: Number(match[2]),
      oid,
      summary: match[3]!,
      time,
      tips: [],
    })
  }

  const newestVersion = async (ref: string) =>
    (await git(root, "log", ref, "--format=%H")).split("\n").find((oid) => byOid.has(oid))

  const branches = (await git(root, "for-each-ref", "refs/heads", "--format=%(refname:short)"))
    .split("\n")
    .filter(Boolean)
  for (const branch of branches) {
    const oid = await newestVersion(branch)
    if (oid) byOid.get(oid)!.tips.push(branch)
  }
  const head = await newestVersion("HEAD")
  const branch = (await git(root, "branch", "--show-current")).trim() || undefined

  const versions = [...byOid.values()].sort((a, b) => b.n - a.n || b.time.localeCompare(a.time))
  return { versions, current: head ? byOid.get(head) : undefined, branch }
}

export async function readAt(root: string, oid: string, path: string): Promise<string | undefined> {
  try {
    return await git(root, "show", `${oid}:${path}`)
  } catch {
    return undefined
  }
}

/** Tracked files that differ from HEAD; switching versions would overwrite them. */
export async function uncommitted(root: string): Promise<string[]> {
  const out = await git(root, "status", "--porcelain", "--untracked-files=no")
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
}

async function realpath(path: string) {
  const { realpath } = await import("node:fs/promises")
  return realpath(path)
}
