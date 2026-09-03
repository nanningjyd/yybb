# yybb 🔊

免登录的网页语音播报工具：**粘贴文字，点击即读**。纯浏览器本地合成（Web Speech API），无需注册、无需后端、不收集任何数据。

在线使用：<https://nanningjyd.github.io/yybb/>

## 功能

- 📋 粘贴/输入任意文字，一键开始播报，支持长文本（自动按句切分、逐句朗读）
- ⏸ 暂停 / 继续 / 停止
- 🎙 发音人选择：列出操作系统与浏览器提供的全部音色，自动优先中文音色，**名称中文化显示**（如“康康（男声）· 中文（简体）”）
- 🎚 语速、音调、音量实时调节
- 📃 朗读进度可视化：当前句高亮，**点击任意一句即可从该句开始播报**
- 🌙 自动适配深色模式，手机端可用

## 使用

无需安装，直接打开 `index.html`，或部署到任意静态托管（GitHub Pages、Vercel、Netlify、Nginx 均可）。

```bash
git clone https://github.com/nanningjyd/yybb.git
# 用浏览器直接打开 yybb/index.html 即可
```

## 发音人说明

语音由浏览器内置的语音合成引擎提供，不同系统可用音色不同：

| 环境 | 推荐做法 |
| --- | --- |
| Windows | 用 **Edge 浏览器**打开，自带“晓晓 / 晓伊”等高质量中文在线音色 |
| macOS / iOS | Safari 或 Chrome，内置“婷婷”等中文音色 |
| Android | Chrome / Edge，音色随系统 TTS 引擎（如讯飞）而定 |

首次打开页面时，音色列表可能延迟几秒加载，点“↻ 刷新音色”即可。

## 技术实现

- 纯原生 HTML / CSS / JavaScript，零依赖、零构建
- 使用 [Web Speech API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)（`speechSynthesis` + `SpeechSynthesisUtterance`）
- 长文本按 `。！？；` 等标点切分成短句，逐句合成、串联播放；单句超过 110 字再按逗号细分，规避部分浏览器对超长朗读文本静默截断的问题
- 通过 `utterance.onend` 事件串联队列，实现断点续读与逐句高亮

## License

[MIT](LICENSE)
