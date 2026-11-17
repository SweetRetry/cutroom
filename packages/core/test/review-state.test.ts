import { expect, test } from "vite-plus/test"

import type { AgentFile, CommentsFile, ReviewComment } from "../src/schema"
import { commentView } from "../src/review/state"

const comment = (id: string): ReviewComment => ({
  id,
  version: "v2",
  intent: "change",
  text: "缩短",
  anchor: { kind: "global" },
  context: { neighbors: [], concurrent: [], history: [] },
  createdAt: "2026-11-17T00:00:00.000Z",
})

const sent: CommentsFile = {
  comments: [comment("c-01"), comment("c-02")],
  rounds: [{ version: "v2", submittedAt: "2026-11-17T00:00:00.000Z" }],
  dismissed: [],
}

const agent = (extra: Partial<AgentFile["rounds"][number]> = {}): AgentFile => ({
  rounds: [{ version: "v2", replies: [], ...extra }],
  findings: [],
})

// Claude Code must answer every comment; a skipped one has to surface, not read as "sent".
test("a finished round flags the comment it never replied to", () => {
  const done = agent({ replies: [{ comment: "c-01", text: "裁掉了", done: true }], result: "v3" })
  expect(sent.comments.map((c) => commentView(c, sent.rounds, done).status)).toEqual([
    "replied",
    "missed",
  ])
})

test("a comment without a reply is pending while the round is still open", () => {
  expect(commentView(sent.comments[1]!, sent.rounds, agent()).status).toBe("pending")
})
