<div align="center">

<img src="build/icon.png" width="112" alt="AI 辩论台" />

# AI 辩论台 · AI Debate Arena

**输入一个话题，让两个 AI 自动展开正反辩论的桌面应用。**

简体中文 | [English](README_EN.md)

</div>

---

## ⚠️ 免责声明（请先阅读）

- 本项目为**非官方、个人学习与研究用途**的开源工具，**与 Kimi、通义千问及任何 AI 服务提供方均无关、未获其授权或背书**。
- 本工具通过在桌面应用内**驱动各 AI 的网页版**工作：用户在应用内**登录自己的账号**，应用自动将话题/对方观点填入网页、读取回答并组织成一场辩论。
- 使用本工具即表示你**自行承担**相应风险，并**自行负责遵守你所使用的各 AI 服务的用户协议 / 服务条款**。各服务条款可能限制自动化访问；是否使用、如何使用由你自行判断。
- 作者不对因使用本工具产生的任何后果（包括但不限于账号受限、内容合规等）负责。
- 请勿将本工具用于商业目的、批量滥用或任何违反相关服务条款与法律法规的行为。

---

## 这是什么

一个 Electron 桌面应用：

1. 你输入一个**话题**，选择两个 AI 分别作为**正方 / 反方**。
2. 应用自动给双方分配立场（支持 / 反对），让它们**一来一回辩论若干回合**。
3. 左侧汇总成一场干净的辩论记录，右侧是真实的 AI 网页（辩论引擎在其中读写）。

> 设计理念：把"两个 AI 连续对话"做成开箱即用的桌面工具。提示词由应用按你的语言环境自动生成，你只需输入话题。

## 特性

- 🗣️ 支持 **Kimi、DeepSeek**（可同款对辩，也可跨模型 Kimi × DeepSeek）
- 🧩 自动分配正 / 反立场，**3–10 回合**可调，辩满自动收尾
- ⚡ 流式实时显示；DeepSeek 自动**排除"深度思考"链**，只取最终答案
- 🔁 **继续辩论 +3**（接续原对话）、📤 **导出 Markdown**、🗂️ 本地**历史记录**
- 🔐 登录检测与门控；同模型同账号**登录一次**两侧通用
- 🌐 跟随话题语言自动生成中 / 英文提示词
- 🖥️ 纯桌面端、登录态本地保存；基于 Electron 自研（调研阶段参考过 [ChatALL](https://github.com/ai-shifu/ChatALL)）

## 下载

**v1.0.0**（macOS · Apple Silicon/arm64）：见 [Releases](https://github.com/freedom-shen/AIPKAI/releases)。
未签名，首次打开请**右键 →「打开」**绕过 Gatekeeper。Windows 版待 CI 构建。

进展详见 [`docs/PROGRESS.md`](docs/PROGRESS.md)。

## 技术栈

Electron · JavaScript (ESM) · Vitest。文档见 `docs/superpowers/`（设计 spec 与实现计划）。

## 本地开发（macOS）

> 需要 Node 20（项目 `.nvmrc` 已指定）。

```bash
git clone <this-repo>
cd AIPKAI
nvm use 20
npm install

# 运行单元测试（辩论引擎）
npm test

# 开发模式启动应用（Vite + Electron）
npm run dev

# 打包 macOS 安装包（dmg → dist_electron/）
npm run dist
```

## 参考

本项目在调研阶段参考过开源项目 [ChatALL](https://github.com/ai-shifu/ChatALL) 的思路（用于确认"桌面端驱动 AI 网页"这一方向可行）。**本项目为独立实现，未使用其代码。**

## 许可证

本项目以 **MIT** 许可发布，详见 [`LICENSE`](LICENSE)。
