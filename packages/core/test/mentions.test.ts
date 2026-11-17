import { expect, test } from "vite-plus/test"

import { mentionedIds, parseMentions, writeMentions } from "../src/review/mentions"

// Claude Code acts on the id; a mention that loses or garbles it points at the wrong file.
test("a mention survives the trip through the stored text, id and all", () => {
  const text = writeMentions([
    { type: "text", text: "把 " },
    { type: "mention", id: "a-s1", label: "s1 [final].mp4" },
    { type: "text", text: " 换成 " },
    { type: "mention", id: "a-s2", label: "s2.mp4" },
  ])
  expect(text).toBe("把 @[s1 [final .mp4](a-s1) 换成 @[s2.mp4](a-s2)")
  expect(parseMentions(text)).toEqual([
    { type: "text", text: "把 " },
    { type: "mention", id: "a-s1", label: "s1 [final .mp4" },
    { type: "text", text: " 换成 " },
    { type: "mention", id: "a-s2", label: "s2.mp4" },
  ])
  expect(mentionedIds(text)).toEqual(["a-s1", "a-s2"])
})
