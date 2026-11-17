# 文件格式

`cutroom review` 在提交前会检查这两个文件，不合规时拒绝并说明原因。

## 文件夹

| 路径             | 内容                                                 | 谁写    | 进 git |
| :--------------- | :--------------------------------------------------- | :------ | :----- |
| `media/user/`    | 对方导入的视频、图片、音乐                           | 对方    | 否     |
| `media/fetched/` | 你搜索下载的素材                                     | 你      | 否     |
| `generated/`     | 你用代码创建或加工的素材，连同生成它的代码和渲染脚本 | 你      | 是     |
| `assets.json`    | 素材索引                                             | 你      | 是     |
| `timeline.json`  | 当前时间轴                                           | 你      | 是     |
| `renders/vN.mp4` | 每个版本的成片                                       | 你      | 否     |
| `review/`        | 评论、截图、你的回复和预检发现                       | Cutroom | 是     |

`review/` 里的文件只读，回复和发现通过 `cutroom review` 的参数交。

## 时间轴

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
      "id": "bgm",
      "kind": "music",
      "clips": [{ "id": "m-01", "start": 0, "end": 62.4, "asset": "a-music", "in": 0, "out": 62.4 }]
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

- 轨道 `kind` 有六种：`video` 视频主轨（一条），`overlay` 叠加（B-roll、画中画、贴纸、图片，可多条），`text` 字幕与文字，`voice` 对白与旁白，`music` 音乐与音效，`effect` 特效。
- 片段 id 一旦出现就保持不变：改片段时沿用原 id，新片段用新 id。Cutroom 靠 id 对比版本。把一个片段拆成几段时，其中一段可沿用原 id，其余用新 id；同一素材、入出点落在原片段区间内的新片段会显示为从原片段拆分，不算新增。
- 特效只写名字和范围。转场是 `transition: true` 的特效，跨在两个片段的接缝上。
- 标出 `markers.scenes`（场景边界）和 `markers.beats`（音乐节拍）。对方在时间轴上选范围时会吸附到这些点。
- 时间轴描述成片的结果，Cutroom 只靠它画轨道。渲染用什么工具由你定。

## 素材索引

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

- `origin`：`user` 对方导入，`fetched` 你搜索下载（必须写 `source` 的出处和授权），`generated` 你用代码创建或加工。
- 同一镜头的多个素材用同一个 `group`。评论说“换一个试试”时在同组里换。
- 每轮开始先看 `media/` 有没有新文件，有就加进索引。

## 预检发现

`--findings` 文件是一个数组，id 和版本由 Cutroom 填：

```json
[
  {
    "kind": "穿帮",
    "text": "右手第三根手指变形",
    "anchor": { "kind": "range", "time": { "start": 12.4, "end": 13.1 }, "clip": "clip-05" }
  }
]
```

对方会把它转为评论（下一轮的一条评论，带 `finding`），或者忽略。
