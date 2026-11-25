# IyricPhoneticer 歌词包 v1

文件使用 UTF-8 JSON，扩展名为 `.iyric.json`。

| 字段 | 内容 |
| --- | --- |
| `version` | 数字 `1` |
| `song` | 包含 `title`，可加 `artist` 和正安全整数 `durationMs` |
| `language` | 原文的语言标签，如 `ja`、`ko` |
| `translationLanguage` | 可选。译文语言标签，如 `zh-Hans` |
| `sources` | 可选。实际采用的来源项，每项含 `kind`、`label`，有可访问的公开网页时可加 `url` |
| `lines` | 至少一条歌词。每条含 `startMs` 和非空 `segments`，可加整句 `romanization` 和 `translation` |

- `startMs` 是相对录音开头的非负安全整数毫秒。按严格递增的顺序写入。已知歌曲时长时，每个开始时刻都须早于结束时刻。同一时刻的多句歌词合并为一条，用换行保留其顺序。
- 每个片段含非空的 `text`，读法明确且有注音需要时可加 `reading`。按顺序拼接所有 `text` 应还原整句原文。“愛してる”可用带 `あい` 的“愛”和无注音的“してる”两个片段，另加整句 `ai si te ru`。
- 未知的可选字段直接省略。来源项的 `kind` 可用 `lyrics`、`timing`、`translation`、`pronunciation`。实际依据来自用户录音、已有歌词文件或人工对齐时，写明依据并省略 `url`。

以下是用原创短句演示结构的虚构样例。

```json
{
  "version": 1,
  "song": {
    "title": "星の窓",
    "durationMs": 10000
  },
  "language": "ja",
  "translationLanguage": "zh-Hans",
  "lines": [
    {
      "startMs": 1250,
      "segments": [
        { "text": "星", "reading": "ほし" },
        { "text": "を" },
        { "text": "数", "reading": "かぞ" },
        { "text": "える" }
      ],
      "romanization": "ho si o ka zo e ru",
      "translation": "数着星星"
    },
    {
      "startMs": 5160,
      "segments": [
        { "text": "朝", "reading": "あさ" },
        { "text": "が" },
        { "text": "来", "reading": "く" },
        { "text": "る" }
      ],
      "romanization": "a sa ga ku ru",
      "translation": "清晨到来"
    }
  ]
}
```
