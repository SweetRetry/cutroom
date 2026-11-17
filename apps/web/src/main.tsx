import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { z } from "zod"

import { NotFound } from "./components/not-found"
import { ProjectGate } from "./components/workspace/project-gate"
import "./styles.css"

const rootRoute = createRootRoute({
  component: () => (
    // Retry: one curve and duration for every Motion transition; reduced motion follows the OS.
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
      <TooltipProvider>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  ),
})

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: z.object({
    /** The project folder, as an absolute path. Without it the page asks for one. */
    p: z.string().optional(),
    /** The version on screen; omitted means the current one. */
    v: z.string().optional(),
    /** A version to play side by side with it. */
    compare: z.string().optional(),
  }),
  component: ProjectGate,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([reviewRoute]),
  defaultNotFoundComponent: NotFound,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const queries = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
