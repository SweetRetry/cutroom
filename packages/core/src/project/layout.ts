/** Where things live in a project folder. CLAUDE.md (claude-md.ts) documents the same layout. */
export const PATHS = {
  instructions: "CLAUDE.md",
  gitignore: ".gitignore",
  timeline: "timeline.json",
  assets: "assets.json",
  comments: "review/comments.json",
  agent: "review/agent.json",
  frames: "review/frames",
  render: (version: string) => `renders/${version}.mp4`,
} as const

export const GITIGNORE = `# Source media and renders are large and are not versioned; timeline.json records
# which file and which span each clip uses.
media/
renders/
.DS_Store
`
