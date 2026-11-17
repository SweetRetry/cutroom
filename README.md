# Cutroom

视频项目的审片与协作服务。剪辑在项目文件夹里进行；在 Cutroom 里看片、在时间轴和画面上标位置写评论、确认计划、对比和回退版本。协作者同级，人或 agent 都可以担任审片或剪辑的一方。

```sh
pnpm install
pnpm dev
claude mcp add --scope user --transport http cutroom http://localhost:4317/mcp   # 剪辑的一方，只需一次
```

打开页面，粘贴项目文件夹的路径。空文件夹会提示写入项目约定（CLAUDE.md、.gitignore、review/）并初始化 git。之后在那个文件夹里开始剪辑。

试用：`node scripts/sample-project.mjs /tmp/demo` 生成一个带两个版本和一轮评论的示例项目。需要 Bun、git 和 ffmpeg。

| 操作                 | 方式                                         |
| :------------------- | :------------------------------------------- |
| 时间点评论           | 点时间轴，或播放中按 M                       |
| 时间段               | 在时间轴上拖，吸附到场景边界、节拍和片段边缘 |
| 片段、接缝、整条轨道 | 点片段、点两个片段之间、点轨道名             |
| 画面区域             | 按 B 或点“框选画面”，在画面上拖              |
| 播放、逐帧、缩放     | 空格；左右方向键（Shift 为 1 秒）；+ 和 -    |

架构和取舍见 [docs/architecture.md](docs/architecture.md)，运行方式见 [docs/deployment.md](docs/deployment.md)。
