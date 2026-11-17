# Architecture

## Workspace

| Path                         | Owns                                                                                       |
| :--------------------------- | :----------------------------------------------------------------------------------------- |
| `apps/server`                | The local service, the only writer of `review/` and of versions, and the `cutroom` command |
| `apps/web`                   | The review page, a Vite SPA                                                                |
| `packages/core`              | The file contract (zod), round state, comment context, timeline queries and diff           |
| `packages/ui`                | shadcn/ui on Base UI, Retry tokens (`globals.css`), `cn`                                   |
| `packages/typescript-config` | Shared tsconfig presets                                                                    |

## Inside `apps/server/src`

```text
project.ts   path guard, per-project write queue, atomic JSON writes, init, continue-from (git switch)
git.ts       versions across branches, a file at a commit
review.ts    the reviewing side's actions: comment (with context and frame grab), send, resolve
agent.ts     the handoff: check the files, commit a version with replies and findings, report sent comments
cli.ts       `cutroom review`: start the service, hand off, open the page, wait, print the comments
media.ts     byte-range streaming, ffmpeg thumbnails, waveform peaks, comment frames
events.ts    fs.watch on the folder, pushed to pages as SSE
picker.ts    the OS "choose folder" window, since a page can't learn an absolute path
app.ts       Elysia routes and the localhost Host check; index.ts listens and serves the built page
```

## Data path

```text
Review page ──── /api (Eden, typed) ──┐                         ┌─▶ review/comments.json, review/frames/
                                      ├─▶ local service ────────┤
cutroom review ── /api (fetch, polls) ┘   (checks the handoff)  └─▶ review/agent.json, git commits
      ▲                       ▲                       │
 Claude Code             SSE change feed ◀──────── fs.watch
```

Claude Code writes `timeline.json`, `assets.json`, media, `generated/` and `renders/vN.mp4` itself with whatever tools it likes; the service checks them and commits them with the version.

## Decisions

Each decision names the alternative it beat.

- **A local service owns the review files and versions.** The first version had the browser read the folder through the File System Access API and the editing side edit JSON by hand, held together by conventions in CLAUDE.md. Nothing enforced them: a version could drop a comment. Now `review/` and every version commit go through one process that checks at that moment and refuses with a reason. Void was dropped with it: its TanStack Start mode runs in workerd, which can't reach the host filesystem or run git (`readFile('/etc/hosts')` fails even with `target: "node"`, measured).
- **Claude Code leads; Cutroom is its review surface.** The second version treated reviewer and editor as asynchronous peers, with MCP tools, a plan the reviewer approved in the page, and phases the service enforced. In practice the Claude Code session is always open, so every page action still needed a message in the terminal. Now Claude Code runs `cutroom review`, which blocks like `$EDITOR` for `git commit`: the reviewer's "发给 Claude Code" ends the command and its output is the comments. Plans and questions happen in the conversation, where they already were. Async review by someone not at the machine is what this gave up.
- **A command, not MCP.** Claude Code has a shell; a command that blocks and prints JSON needs no client setup, can be run by hand, and its background completion wakes Claude Code. MCP was dropped with the plan tools it existed for. Claude Code channels could push "sent" into an idle session instead of a blocking call, but they are a research preview limited to stdio servers.
- **Versions are git commits named `vN:`.** Only the handoff makes them, after checking the render exists, the timeline and asset index are valid, and every sent comment has a reply. Each version's timeline is read from its commit, so its lanes always match its render. A separate version manifest was the alternative; git already gives history, diff and branches.
- **Round state is derived.** The phase (drafting, sent, done) and each comment's status come from both review files. Whether Claude Code is waiting is the one thing kept in memory: the last poll from `cutroom review`, so the header can say so.
- **Media is cut by the service.** Thumbnails, waveforms and comment frames come from ffmpeg, cached under the system temp folder. The page no longer decodes video to grab frames, so any browser works.
- **Rollback and branching are one action.** "设为当前" checks out a branch tip as is, or opens a new branch at an older version. Later versions stay on their branch. It refuses while tracked files have uncommitted changes, because checkout would overwrite them.
- **Loopback only.** The service binds 127.0.0.1 and refuses any Host header other than localhost, so a web page on another origin can't reach it through DNS rebinding.
- **Retry is the design language.** [DESIGN.md](../DESIGN.md) is the spec.
