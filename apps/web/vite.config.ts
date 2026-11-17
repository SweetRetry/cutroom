import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The page talks only to the local service (apps/server). In dev, Vite forwards to it, so the
// page and the API share one origin and the service never needs CORS.
const service = `http://127.0.0.1:${process.env.CUTROOM_PORT ?? 4317}`

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": service, "/mcp": service } },
})
