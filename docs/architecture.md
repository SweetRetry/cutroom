# Architecture

## Workspace

| Path                         | Owns                                                                                                     |
| :--------------------------- | :------------------------------------------------------------------------------------------------------- |
| `apps/server`                | The local service: the only writer of a project folder, `/api` for the page, `/mcp` for the editing side |
| `apps/web`                   | The review page, a Vite SPA                                                                              |
| `packages/core`              | The file contract (zod), round state, comment context, timeline queries and diff                         |
| `packages/ui`                | shadcn/ui on Base UI, Retry tokens (`globals.css`), `cn`                                                 |
| `packages/typescript-config` | Shared tsconfig presets                                                                                  |

## Inside `apps/server/src`

```text
project.ts   path guard, per-project write queue, atomic JSON writes, init, continue-from (git switch)
git.ts       versions across branches, a file at a commit
review.ts    the reviewing side's actions: comment (with context and frame grab), submit, decide, resolve
agent.ts     the editing side's actions: plan, replies, timeline, assets, findings, commit a version
mcp.ts       the MCP tools, one per agent.ts action, plus get_round
media.ts     byte-range streaming, ffmpeg thumbnails, waveform peaks, comment frames
events.ts    fs.watch on the folder, pushed to pages as SSE
app.ts       Elysia routes and the localhost Host check; index.ts listens and serves the built page
```

## Data path

```text
Review page ── /api (Eden, typed) ──┐                       ┌─▶ review/comments.json, review/frames/
                                    ├─▶ local service ──────┤
Editing side ── /mcp (MCP tools) ───┘   (checks the round)  └─▶ timeline.json, assets.json, review/agent.json, git commits
                     ▲                                │
                     └──────── SSE change feed ◀── fs.watch
```

The editing side still renders `renders/vN.mp4` and keeps its own code under `generated/` with whatever tools it likes; the service commits them with the version.

## Decisions

Each decision names the alternative it beat.

- **A local service owns the folder.** The first version had the browser read the folder through the File System Access API and the editing side edit JSON by hand, held together by conventions in CLAUDE.md. Nothing enforced them: a plan could skip a comment, a version could drop one. Now every write goes through one process that checks the round at that moment, and refuses with a reason. Void was dropped with it: its TanStack Start mode runs in workerd, which can't reach the host filesystem or run git (`readFile('/etc/hosts')` fails even with `target: "node"`, measured).
- **MCP for the editing side, typed HTTP for the page.** Both call the same functions in `review.ts` and `agent.ts`. A CLI was the alternative; MCP tools come with schemas and descriptions the editing agent reads directly.
- **Stateless MCP.** Every tool call names the project by absolute path and gets a fresh server, so one service serves many projects and there is no session to lose.
- **Versions are git commits named `vN:`.** Only `commit_version` makes them, after checking the render exists and every comment in the round has a reply. Each version's timeline is read from its commit, so its lanes always match its render. A separate version manifest was the alternative; git already gives history, diff and branches.
- **Round state is derived.** The phase (drafting, awaiting plan, plan ready, objected, approved, done) and each comment's status come from both review files. A decision carries the plan revision it answers, so approving revision 1 never authorizes revision 2.
- **Media is cut by the service.** Thumbnails, waveforms and comment frames come from ffmpeg, cached under the system temp folder. The page no longer decodes video to grab frames, so any browser works.
- **Rollback and branching are one action.** "设为当前" checks out a branch tip as is, or opens a new branch at an older version. Later versions stay on their branch. It refuses while tracked files have uncommitted changes, because checkout would overwrite them.
- **Loopback only.** The service binds 127.0.0.1 and refuses any Host header other than localhost, so a web page on another origin can't reach it through DNS rebinding.
- **Retry is the design language.** [DESIGN.md](../DESIGN.md) is the spec.
