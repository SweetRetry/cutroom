import { join, resolve } from "node:path"

import { app } from "./app"

/**
 * Composition root. `CUTROOM_PORT` picks the port (4317 by default). When the web app has been
 * built, its files are served from here too, so `pnpm start` is one process on one address.
 */
const port = Number(process.env.CUTROOM_PORT ?? 4317)
const web = resolve(import.meta.dir, "../../web/dist")

const server = app
  .get("/*", async ({ request }) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(join(web, path))
    if (path !== "/" && !path.includes("..") && (await file.exists())) return file
    const index = Bun.file(join(web, "index.html"))
    return (await index.exists())
      ? index
      : new Response("先运行 pnpm build，或用 pnpm dev 打开 Vite 的地址", { status: 404 })
  })
  .listen({ port, hostname: "127.0.0.1" })

console.log(`Cutroom on http://localhost:${server.server?.port}`)
console.log(
  `MCP: claude mcp add --transport http cutroom http://localhost:${server.server?.port}/mcp`
)
