import * as React from "react"

/** Whether a media query matches, kept live. `false` on the server. */
export function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
