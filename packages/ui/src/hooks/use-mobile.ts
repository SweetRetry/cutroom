import { useMediaQuery } from "./use-media-query"

const MOBILE_BREAKPOINT = 768

/** Whether the viewport is narrower than the mobile breakpoint. `false` on the server. */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
