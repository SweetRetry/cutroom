# Cutroom

Claude Code 剪视频时用的审片页。Claude Code 在项目文件夹里剪片，出一版就打开 Cutroom；你看片、在时间轴和画面上标位置写评论，点“发给 Claude Code”，它就接着改。也能对比和回退版本。

安装一次：

```sh
pnpm install && pnpm build
ln -s "$PWD/apps/server/src/cli.ts" ~/.local/bin/cutroom   # 全局命令，放进任意 PATH 目录
ln -s "$PWD/skills/cutroom" ~/.claude/skills/cutroom   # Claude Code 的工作流
```

之后在任意目录打开 Claude Code，告诉它素材在哪、想要什么样的片子。它会建项目文件夹、收拾素材、剪出第一版，然后运行 `cutroom review`，页面会自动打开；服务没在运行时命令会自己启动它。

试用：`node scripts/sample-project.mjs /tmp/demo` 生成一个带两个版本和一轮评论的示例项目。需要 Bun、git 和 ffmpeg。

| 操作                 | 方式                                         |
| :------------------- | :------------------------------------------- |
| 时间点评论           | 点时间轴，或播放中按 M                       |
| 时间段               | 在时间轴上拖，吸附到场景边界、节拍和片段边缘 |
| 片段、接缝、整条轨道 | 点片段、点两个片段之间、点轨道名             |
| 画面区域             | 按 B 或点“框选画面”，在画面上拖              |
| 播放、逐帧、缩放     | 空格；左右方向键（Shift 为 1 秒）；+ 和 -    |

架构和取舍见 [docs/architecture.md](docs/architecture.md)，运行方式见 [docs/deployment.md](docs/deployment.md)。
