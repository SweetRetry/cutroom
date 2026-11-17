# 视频项目

这个文件夹是一个视频剪辑项目。你负责剪辑：选素材、剪辑、特效、字幕、配乐、渲染。审片在 Cutroom 里进行：看片、写评论、确认计划。评论者是协作者，和你同级，不分是人还是 agent。

你通过 `cutroom` MCP 工具读写这个项目。每个工具都要传 `project`，就是这个文件夹的绝对路径。工具会检查每一步合不合规矩，被拒绝时返回原因，照着改再调用。

如果看不到 `cutroom` 工具，说明需要先启动 Cutroom（在 Cutroom 仓库里 `pnpm dev`），再运行一次 `claude mcp add --scope user --transport http cutroom http://localhost:4317/mcp`。

## 文件夹

| 路径                   | 内容                                                                        | 谁写               | 进 git |
| ---------------------- | --------------------------------------------------------------------------- | ------------------ | ------ |
| `media/`               | 原始视频、图片、音乐；导入的在 `media/user/`，搜索下载的放 `media/fetched/` | 任何一方           | 否     |
| `generated/`           | 你用代码创建或加工的素材，连同生成它的代码                                  | 你                 | 是     |
| `assets.json`          | 素材索引                                                                    | `write_assets`     | 是     |
| `timeline.json`        | 当前时间轴                                                                  | `write_timeline`   | 是     |
| `review/comments.json` | 评论与对计划的决定                                                          | Cutroom            | 是     |
| `review/frames/`       | 评论锚点的画面截图                                                          | Cutroom            | 是     |
| `review/agent.json`    | 你的计划、回复和预检发现                                                    | 计划、回复相关工具 | 是     |
| `renders/vN.mp4`       | 每个版本的预览视频                                                          | 你                 | 否     |

三个 JSON 文件和 `review/` 不要直接编辑，也不要自己 `git commit`。用下面的工具写。可以读它们。

## 每一轮

一轮审一个版本。每次开始工作先调用 `get_round`，它告诉你当前阶段、本轮评论、下一个版本号、渲染路径，以及现在该做什么。

1. **第一版。** 有了素材和需求后，扫描 `media/`，用 `write_assets` 建索引，用 `write_timeline` 写时间轴，渲染到 `get_round` 给出的 `nextRender`（`renders/v1.mp4`），然后 `commit_version`，`summary` 写一句话摘要。出片后做一次预检，见下文。
2. **本轮评论提交后**（通常会有一句“处理本轮评论”），调用 `get_round` 读本轮全部评论。
3. **先列计划，不动时间轴。** 调用 `write_plan`，为每条评论写一项：打算怎么改，或者不改及原因。工具会拒绝漏掉评论的计划。写完说明“计划已写好”，然后停下等待。
4. **等决定。** 计划在 Cutroom 里被通过或提出异议。再次调用 `get_round` 看 `phase`：`objected` 时按 `decision.objections` 改写计划，再 `write_plan` 并停下；`approved` 时才执行。
5. **执行并渲染。** 改时间轴和需要的素材，渲染到 `nextRender`，调用 `write_replies` 为每条评论写一项：实际做了什么，用了哪种方法。没做的写 `done: false` 并说明原因。
6. **提交。** 调用 `commit_version`。它会检查渲染文件存在、每条评论都有回复，然后把所有改动提交成新版本。有评论没回复时会被拒绝并列出来。

文件夹还不是 git 仓库时，`get_round` 会提示你先调用 `init_project`。

`get_round` 的 `verdicts` 是对上一轮回复的判断：`closed` 是接受，`reopened` 是不满意，那条已经作为新评论出现在本轮，带 `reopens`。

## 评论怎么读

```json
{
  "id": "c-07",
  "version": "v2",
  "intent": "issue",
  "text": "手指穿帮",
  "anchor": {
    "kind": "region",
    "time": { "start": 12.4, "end": 12.4 },
    "track": "main",
    "clip": "clip-05",
    "region": { "x": 0.62, "y": 0.55, "w": 0.2, "h": 0.3 }
  },
  "context": {
    "frame": "review/frames/c-07.png",
    "source": { "asset": "a-03", "path": "media/user/A3.mp4", "in": 3, "out": 8 },
    "neighbors": ["clip-04", "clip-06"],
    "concurrent": [{ "track": "subs", "clip": "t-04", "label": "我们出发吧" }],
    "history": [{ "comment": "c-02", "version": "v1", "text": "这里太暗", "reply": "提亮了 20%" }]
  }
}
```

- 时间都是秒，从成片开头算。`region` 是相对画面的比例，左上角为原点。
- `anchor.kind`：`point` 时间点，`range` 时间段，`clip` 片段，`seam` 两个片段之间的接缝（`seam` 是左右两个片段 id），`region` 画面区域，`track` 整条轨道，`global` 全片。从素材列表发起的评论带 `asset`，说的是那个素材本身。
- `intent`：`issue` 只指出问题，怎么修由你决定；`change` 删除、缩短、替换、调换顺序；`add` 加字幕、转场、音乐、特效；`feel` 节奏或情绪的感受，你要自己解读成具体动作并在计划里写明；`keep` 这里很好，之后的改动不能碰它；`question` 只回答，不改动。
- `reopens` 表示这条评论是对之前某条评论的回复不满意，要换一种做法。`finding` 表示预检发现的问题被确认了。
- `context.frame` 是画面截图，有框选时框已经画在图上，需要时打开看。

## 时间轴格式

```json
{
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "duration": 62.4,
  "markers": { "scenes": [0, 4.2, 9.8], "beats": [0.5, 1.0, 1.5] },
  "tracks": [
    {
      "id": "main",
      "kind": "video",
      "clips": [{ "id": "clip-01", "start": 0, "end": 4.2, "asset": "a-03", "in": 3, "out": 7.2 }]
    },
    {
      "id": "pip",
      "kind": "overlay",
      "clips": [{ "id": "ov-01", "start": 2, "end": 5, "asset": "a-logo", "label": "logo" }]
    },
    {
      "id": "subs",
      "kind": "text",
      "clips": [{ "id": "t-01", "start": 0.5, "end": 3, "text": "我们出发吧" }]
    },
    {
      "id": "voice",
      "kind": "voice",
      "clips": [{ "id": "vo-01", "start": 0, "end": 4.2, "asset": "a-03", "in": 3, "out": 7.2 }]
    },
    {
      "id": "bgm",
      "kind": "music",
      "clips": [
        {
          "id": "m-01",
          "start": 0,
          "end": 62.4,
          "asset": "a-music",
          "in": 0,
          "out": 62.4,
          "beats": [0.5, 1.0]
        }
      ]
    },
    {
      "id": "fx",
      "kind": "effect",
      "clips": [
        { "id": "fx-01", "start": 3.9, "end": 4.5, "effect": "叠化", "transition": true },
        { "id": "fx-02", "start": 10, "end": 20, "effect": "暖色调" }
      ]
    }
  ]
}
```

- 轨道 `kind` 只有六种：`video` 视频主轨（一条），`overlay` 叠加（可多条：B-roll、画中画、贴纸、图片），`text` 字幕与文字，`voice` 对白与旁白，`music` 音乐与音效，`effect` 特效。
- 片段 id 一旦出现就不再改变，修改片段时保留原 id，新增片段用新 id。Cutroom 靠 id 对比版本。
- 转场是 `transition: true` 的特效片段，跨在接缝上。其他特效写名字和范围，不需要参数。
- 标出 `markers.scenes`（场景边界）和 `markers.beats`（音乐节拍点）。在 Cutroom 里选时间段时会吸附到这些点。
- 渲染方式由你决定（ffmpeg、脚本、任何工具），渲染代码放在 `generated/` 或你自建的目录里，`commit_version` 会一起提交。时间轴只描述结果，Cutroom 只靠它画轨道。
- 用 `write_timeline` 写入整个时间轴。

## 素材索引

`write_assets` 的 `assets` 参数：

```json
{
  "assets": [
    {
      "id": "a-03",
      "path": "media/user/A3.mp4",
      "kind": "video",
      "origin": "user",
      "duration": 8.0,
      "group": "shot-02",
      "summary": "海边，人物从左走入，无语音"
    },
    {
      "id": "a-music",
      "path": "media/fetched/calm.mp3",
      "kind": "audio",
      "origin": "fetched",
      "source": { "url": "https://…", "license": "CC BY 4.0" },
      "summary": "安静钢琴，72 BPM"
    },
    { "id": "a-logo", "path": "generated/logo/logo.png", "kind": "sticker", "origin": "generated" }
  ]
}
```

- `origin`：`user` 导入，`fetched` 你搜索下载，`generated` 你用代码创建或加工。三种素材地位相同。
- 搜索下载的素材必须写 `source` 的出处和授权。
- 同一镜头的多个素材用同一个 `group`。评论说“换一个试试”时在同组里换。
- 每轮开始先检查 `media/` 有没有新文件，有就加入索引。

## 预检

每次 `commit_version` 之后自己扫一遍新版本：手指或人脸变形、物体闪烁或消失、画面文字乱码、前后镜头服装场景不一致、色调跳变、音画不同步。用 `add_findings` 写下每个疑点，id 和版本由工具填：

```json
{
  "kind": "穿帮",
  "text": "右手第三根手指变形",
  "anchor": { "kind": "range", "time": { "start": 12.4, "end": 13.1 }, "clip": "clip-05" }
}
```

审片时会判断“确实是问题”（变成一条评论进入下一轮）或“没关系”。

## AIGC 素材穿帮

这里不接生成模型，只能在已有素材里规避。按代价从低到高尝试，并在回复里写明用了哪种：

1. 裁掉穿帮的几帧。
2. 换成同组的其他素材。
3. 放大裁切画面，或用字幕、贴纸遮住。
4. 都不行时说明这个镜头需要补素材，`done: false`。

## 边界

- 不生成或重新生成视频素材，不做数字人和文字转语音。
- 第一版只做横版 16:9。导出时先确认要 1080p 还是 4K。
- `keep` 评论标记的部分，之后任何一轮都不要改动，除非那条评论被明确撤回。
