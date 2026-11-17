/**
 * A comment can name assets inline. In the stored text a mention is `@[label](id)`: a person
 * reading the raw text sees the file name, and Claude Code gets the id in `assets.json`. The
 * page shows each one as a chip.
 */

export type TextPart =
  | { type: "text"; text: string }
  | { type: "mention"; id: string; label: string }

const TOKEN = /@\[([^\]\n]+)\]\(([^()\s]+)\)/g

export function parseMentions(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > at) parts.push({ type: "text", text: text.slice(at, match.index) })
    parts.push({ type: "mention", label: match[1]!, id: match[2]! })
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push({ type: "text", text: text.slice(at) })
  return parts
}

export function writeMentions(parts: TextPart[]): string {
  return parts
    .map((p) => (p.type === "text" ? p.text : `@[${p.label.replace(/[\]\n]/g, " ")}](${p.id})`))
    .join("")
}

export function mentionedIds(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((m) => m[2]!))]
}

/** The text as a person reads it, for places that can't draw a chip (a tooltip). */
export function plainText(text: string): string {
  return text.replace(TOKEN, (_, label: string) => `@${label}`)
}
