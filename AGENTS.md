# Cutroom

Cutroom 是视频项目的审片与协作服务。剪辑在项目文件夹里进行，审片在 Cutroom 的页面上进行。两边都通过本地服务读写项目：页面走 `/api`，剪辑的一方（比如 Claude Code）走 `/mcp`。协作者同级，不区分人还是 agent，文案只写动作和角色。Cutroom 不实现任何剪辑功能。

Turborepo + pnpm workspace。`apps/server` 是 Bun + Elysia 本地服务，`apps/web` 是 Vite SPA，`packages/core` 是两边共用的领域逻辑。

## Where things go

system and usage knowledge → `docs/`；未定的计划 → `docs/future/`；工程约束 → `docs/rules/`；仓库工具 → `scripts/`。加改规则前先读 `docs/rules/README.md`。

## Vocabulary

- 讨论需求、设计或命名前读 [CONTEXT.md](CONTEXT.md)，用其中的词。
- 讨论新增术语、消除歧义或修正含义时立刻更新 `CONTEXT.md`。只记用户确认过或代码与文档能证明的含义。

## Architecture

- 本地服务是项目文件夹的唯一写者。页面和 MCP 工具都经过它，它在写入那一刻检查轮的规矩（计划覆盖每条评论、通过后才能回复、每条评论有回复才能出版本）。见 [docs/architecture.md](docs/architecture.md)。
- 规则写在 `apps/server/src/review.ts`（审片一方的动作）和 `apps/server/src/agent.ts`（剪辑一方的动作）。MCP 工具和 HTTP 路由只是入口，不放规则。
- `packages/core/src/project/project-claude.md` 是写给剪辑一方的契约，`packages/core/src/schema.ts` 是同一契约的类型，`apps/server/src/mcp.ts` 是它的工具。三者一起改。
- 轮的阶段和评论状态由文件推出（`packages/core/src/review/state.ts`），不单独存。
- 服务只监听 127.0.0.1，并拒绝 Host 不是 localhost 的请求。
- `packages/ui` owns each atomic control's own appearance; call sites pass only layout classes. `globals.css` 和 `retry.css` 的改动需要先确认。
- 时间轴和播放器按时间与画面框计算位置，`components/{player,timeline}` 允许内联 style（`vite.config.ts`）。

## Rules by trigger

| Trigger                          | Read first                                           |
| :------------------------------- | :--------------------------------------------------- |
| Zod                              | `docs/rules/zod-v4/README.md`                        |
| Frontend UI                      | [DESIGN.md](DESIGN.md)                               |
| 项目文件夹格式、评论或时间轴字段 | `packages/core/src/project/project-claude.md`        |
| 轮的规矩、MCP 工具               | `apps/server/src/agent.ts`、`apps/server/src/mcp.ts` |

## Tech choices

One option per concern. Don't add alternatives.

- Service: Bun + Elysia. MCP: `@modelcontextprotocol/sdk`, stateless Streamable HTTP. Git and ffmpeg run as subprocesses.
- Page: Vite + React + TanStack Router (search params carry the project path and the version). Typed client: Eden treaty (`apps/web/src/lib/api.ts`).
- Project data: TanStack Query, refetched on the service's change feed (SSE). Client state: zustand. Toasts: sonner.
- Motion: motion (`motion/react`) or Tailwind CSS transitions. Icons: lucide-react.

## Verification

- `pnpm verify` is the one full gate: format, Markdown, lint, rules, typecheck, test (Vitest for packages, `bun test` for the service), build, knip.
- [docs/guardrails.md](docs/guardrails.md) lists every hook and scan.
