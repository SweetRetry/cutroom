import { describe, expect, test } from "vite-plus/test"

import type { AgentFile, CommentsFile, ReviewComment } from "../src/schema"
import { commentView, roundPhase, unplanned } from "../src/review/state"

const comment = (id: string): ReviewComment => ({
  id,
  version: "v2",
  intent: "change",
  text: "缩短",
  anchor: { kind: "global" },
  context: { neighbors: [], concurrent: [], history: [] },
  createdAt: "2026-11-17T00:00:00.000Z",
})

const submitted = (decision?: CommentsFile["rounds"][number]["decision"]): CommentsFile => ({
  comments: [comment("c-01"), comment("c-02")],
  rounds: [{ version: "v2", submittedAt: "2026-11-17T00:00:00.000Z", decision }],
  dismissed: [],
})

const planned = (
  revision: number,
  extra: Partial<AgentFile["rounds"][number]> = {}
): AgentFile => ({
  rounds: [
    {
      version: "v2",
      revision,
      plan: [{ comment: "c-01", action: "裁掉一半", willChange: true }],
      replies: [],
      ...extra,
    },
  ],
  findings: [],
})

// Claude Code must answer every comment; a skipped one has to surface, not read as "pending".
test("a finished round flags the comment it never replied to", () => {
  const agent = planned(1, {
    replies: [{ comment: "c-01", text: "裁掉了", done: true }],
    result: "v3",
  })
  const file = submitted()
  expect(file.comments.map((c) => commentView(c, file.rounds, agent).status)).toEqual([
    "replied",
    "missed",
  ])
})

test("a comment without a reply is pending while the round is still open", () => {
  const file = submitted()
  expect(commentView(file.comments[1]!, file.rounds, planned(1)).status).toBe("pending")
})

// An approval of plan revision 1 must not authorize the rewritten revision 2.
describe("plan decisions are tied to a revision", () => {
  const approved1 = { revision: 1, status: "approved" as const, objections: {}, at: "" }

  test("approval of the current revision lets Claude Code execute", () => {
    expect(roundPhase("v2", submitted(approved1), planned(1))).toEqual({
      kind: "approved",
      revision: 1,
    })
  })

  test("a rewritten plan needs a new decision", () => {
    expect(roundPhase("v2", submitted(approved1), planned(2))).toEqual({
      kind: "plan-ready",
      revision: 2,
    })
  })
})

test("comments the plan leaves out are named", () => {
  expect(unplanned("v2", submitted(), planned(1))).toEqual(["c-02"])
})
