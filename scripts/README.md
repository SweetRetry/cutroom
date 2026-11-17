# Scripts

Repo tooling. Each script states its purpose, usage, inputs, outputs and failure mode in its header comment. Common operations are exposed as root `package.json` scripts, so CI and people call the same entry point.

| Script            | Entry point         | Purpose                                                                                          |
| :---------------- | :------------------ | :----------------------------------------------------------------------------------------------- |
| `agent-skills.js` | `pnpm skills:check` | Check the copied skills in `.agents/skills` against their sources; `skills:update` rewrites them |

`node scripts/sample-project.mjs <dir>` builds a sample project (ffmpeg and git) to try the app by hand. The service tests use it too.

App runtime code stays in `apps/` or `packages/`. Schema changes go through migrations, not scripts.
