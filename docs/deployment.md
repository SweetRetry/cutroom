# Running

Cutroom runs on the machine that holds the project folders. Nothing leaves it.

- `pnpm dev` starts the service on port 4317 and the page through Vite, which forwards `/api` to the service. Open the URL Vite prints.
- `pnpm start` builds the page and serves it from the service itself, at `http://localhost:4317`.
- `CUTROOM_PORT` changes the service port for both.
- `cutroom review` starts the service itself (`bun apps/server/src/index.ts`, detached) when nothing answers on the port, so day to day nothing needs starting by hand. It serves the built page, so run `pnpm build` after changing the page.
- Install the editing side once: a symlink from a `PATH` directory to `apps/server/src/cli.ts` gives the `cutroom` command, and a symlink from `~/.claude/skills/cutroom` to `skills/cutroom` gives Claude Code the workflow.
- Needs Bun, git and ffmpeg on `PATH`. Recent projects are kept in `~/.cutroom/recent.json`.
