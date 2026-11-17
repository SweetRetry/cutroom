import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"

import { anchorSchema, assetIndexSchema, timelineSchema } from "@workspace/core/schema"

import {
  addFindings,
  commitVersion,
  getRound,
  writeAssets,
  writePlan,
  writeReplies,
  writeTimeline,
} from "./agent"
import { projectAt, ProjectError } from "./project"

/**
 * The tools Claude Code uses instead of editing project files by hand. Every tool names the
 * project by absolute path (Claude Code's working directory), so one server can serve several.
 * A refused call comes back as a tool error with the reason, for Claude Code to fix and retry.
 */

const project = z.string().describe("项目文件夹的绝对路径，也就是你的工作目录")

type Result = { content: Array<{ type: "text"; text: string }>; isError?: boolean }

async function run(
  path: string,
  work: (p: Awaited<ReturnType<typeof projectAt>>) => Promise<unknown>
): Promise<Result> {
  try {
    const out = await work(await projectAt(path))
    return {
      content: [
        {
          type: "text",
          text: typeof out === "string" ? out : JSON.stringify(out ?? { ok: true }, null, 2),
        },
      ],
    }
  } catch (error) {
    if (error instanceof ProjectError || error instanceof z.ZodError) {
      return { content: [{ type: "text", text: error.message }], isError: true }
    }
    throw error
  }
}

function tools() {
  const server = new McpServer({ name: "cutroom", version: "0.1.0" })

  server.registerTool(
    "get_round",
    {
      description:
        "读当前版本这一轮的状态：阶段、本轮评论（含锚点和上下文）、对计划的决定与异议、你的计划和回复、下一个版本号和渲染路径，以及现在该做什么。每次开始工作先调用它。",
      inputSchema: { project },
    },
    ({ project }) => run(project, getRound)
  )

  server.registerTool(
    "write_timeline",
    {
      description: "写入完整的时间轴（替换 timeline.json）。片段 id 一旦出现就不要改。",
      inputSchema: { project, timeline: timelineSchema },
    },
    ({ project, timeline }) => run(project, (p) => writeTimeline(p, timeline))
  )

  server.registerTool(
    "write_assets",
    {
      description: "写入完整的素材索引（替换 assets.json）。搜索下载的素材必须带 source。",
      inputSchema: { project, assets: assetIndexSchema.shape.assets },
    },
    ({ project, assets }) => run(project, (p) => writeAssets(p, { assets }))
  )

  server.registerTool(
    "write_plan",
    {
      description:
        "为本轮每条评论写计划（打算怎么改，或不改及原因）。必须覆盖每条评论。写完说明计划已写好，然后停下等确认，不要执行。",
      inputSchema: {
        project,
        items: z.array(
          z.object({ comment: z.string(), action: z.string(), willChange: z.boolean() })
        ),
      },
    },
    ({ project, items }) => run(project, async (p) => ({ revision: await writePlan(p, items) }))
  )

  server.registerTool(
    "write_replies",
    {
      description:
        "计划通过并执行后，为评论写实际做了什么。没做的写 done: false 并说明原因。可以分几次写，按评论 id 覆盖。",
      inputSchema: {
        project,
        replies: z.array(z.object({ comment: z.string(), text: z.string(), done: z.boolean() })),
      },
    },
    ({ project, replies }) => run(project, (p) => writeReplies(p, replies))
  )

  server.registerTool(
    "commit_version",
    {
      description:
        "渲染好 get_round 给出的 nextRender 后调用：检查本轮每条评论都有回复，把所有改动提交成一个新版本 vN。summary 是一句话变更摘要。",
      inputSchema: { project, summary: z.string() },
    },
    ({ project, summary }) => run(project, (p) => commitVersion(p, summary))
  )

  server.registerTool(
    "add_findings",
    {
      description:
        "提交版本后，写你预检时发现的疑点（穿帮、色调跳变、音画不同步等），挂在当前版本上，由审片时判断。",
      inputSchema: {
        project,
        findings: z.array(z.object({ kind: z.string(), text: z.string(), anchor: anchorSchema })),
      },
    },
    ({ project, findings }) => run(project, (p) => addFindings(p, findings))
  )

  server.registerTool(
    "init_project",
    {
      description:
        "把文件夹初始化成 Cutroom 项目：写入 CLAUDE.md、.gitignore、review/，并 git init。已有文件不覆盖。",
      inputSchema: { project },
    },
    ({ project }) => run(project, (p) => p.init())
  )

  return server
}

/** Stateless Streamable HTTP: a fresh server per request, nothing to clean up between calls. */
export async function handleMcp(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await tools().connect(transport)
  return transport.handleRequest(request)
}
