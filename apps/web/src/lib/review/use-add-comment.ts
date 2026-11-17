import type { Anchor } from "@workspace/core/schema"

import { api, unwrap } from "../api"
import { useProjectPath, useRefresh } from "../project/hooks"

type Draft = {
  text: string
  anchor: Anchor | null
  reopens?: string
  finding?: string
}

/**
 * Sends one sentence and a place; the service adds the surroundings and the frame grab, so the
 * reviewer never types a timecode or a clip id.
 */
export function useAddComment() {
  const p = useProjectPath()
  const refresh = useRefresh()
  return async ({ anchor, ...draft }: Draft): Promise<string> => {
    const comment = await unwrap(
      api.comments.post({ p, ...draft, anchor: anchor ?? { kind: "global" } })
    )
    await refresh()
    return comment.id
  }
}
