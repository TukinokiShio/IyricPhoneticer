# IyricPhoneticer

在浏览器里播放本地歌曲，同时查看原文、注音和译文。也可以把整首歌生成带背景和滚动歌词的视频。

## 启动

需要 Node.js 22.12 或更高版本。首版面向 Windows 上的 Chrome 和 Edge。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。可先点击「载入示例」体验。演示音频是原创合成音乐，包含内嵌封面。仓库另附一份配合同一音频使用的韩语歌词包 `public/demo/aurora-ko.iyric.json`。

## 播放与导出

1. 打开音频并导入对应的 `.iyric.json` 歌词包。支持常见 MP3、WAV、FLAC 和 M4A，具体解码能力取决于浏览器。
2. 在假名或其他分段读音和整行罗马音之间切换。点击歌词即可跳到该句播放。「提前」和「延后」每次移动歌词 0.5 秒。
3. 可更换背景图片。恢复背景时优先使用歌曲封面，缺少封面时使用默认背景。
4. 点击「生成歌词视频」会按此刻的设置导出整首歌曲。页面打开期间可继续操作播放器。导出完毕后下载 1280 × 720、30 fps 的 WebM。音频、歌词、背景及导出视频均在本地处理。

导出需要浏览器支持 WebCodecs 的 VP8 和 Opus 编码。开发服务使用 localhost，部署静态构建时使用 HTTPS。

## 制作歌词包

仓库级 [iyricer Skill](.agents/skills/iyricer/SKILL.md) 可为指定录音查找歌词、译文和同步时间轴，补充注音，并生成播放器可导入的文件。默认译为简体中文。使用支持 Agent Skills 的客户端打开此仓库后，可按歌曲名称或提供本地音频调用 `iyricer`。

格式见 [歌词包 v1](.agents/skills/iyricer/references/lyric-pack-v1.md)。在项目根目录检查手工制作或 Agent 生成的文件：

```sh
npm run validate-lyrics -- path/to/song.iyric.json
```

## 开发

```sh
npm test
npm run build
npm run preview
```

`npm run build` 生成静态文件到 `dist/`。

## 许可

项目原创代码、Skill 和演示素材采用 [MIT](LICENSE)。Mediabunny 1.66.4 保留 [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)。对应的依赖源码可从 [v1.66.4 源码与发布页](https://github.com/Vanilagy/mediabunny/releases/tag/v1.66.4) 取得。Vite 和 music-metadata 各自采用 MIT。
