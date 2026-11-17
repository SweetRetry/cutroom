# Running

Cutroom runs on the machine that holds the project folders. Nothing leaves it.

- `pnpm dev` starts the service on port 4317 and the page through Vite, which forwards `/api` and `/mcp` to the service. Open the URL Vite prints.
- `pnpm start` builds the page and serves it from the service itself, at `http://localhost:4317`.
- `CUTROOM_PORT` changes the service port for both.
- Connect the editing side once: `claude mcp add --scope user --transport http cutroom http://localhost:4317/mcp`.
- Needs Bun, git and ffmpeg on `PATH`. Recent projects are kept in `~/.cutroom/recent.json`.
