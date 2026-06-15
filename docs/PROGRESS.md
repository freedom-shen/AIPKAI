# AI 辩论台 — 进度归档

最后更新：2026-06-15

## 已完成

| 阶段 | 内容 | 状态 | 关键提交 |
|---|---|---|---|
| 设计 | spec + plan + UI 原型（两页流程） | ✅ | `65b99db` |
| Task 1 | fork ChatALL 进仓库 + `docs/CHATALL_NOTES.md` 结构笔记 | ✅ | `8efee7d` |
| Task 2–6 | 辩论引擎（语言识别/提示词/错误/传话循环），**14/14 单测通过** | ✅ | `18b6a80`…`7a13718` |
| 架构修正 | 改为**纯网页 DOM 驱动、不用任何 API**；默认 **Kimi×通义**；ChatALL 仅作外壳 | ✅ | `fffa462` |
| Task 7.5 SPIKE | **可行性验证通过**：Electron webview 驱动真实 Kimi——登录/注入/读流式回答/完成判定全部跑通 | ✅ | `ac839a5` |

## 关键结论

- **"纯网页 DOM 驱动 + 零 API" 对 Kimi 已实证可行**（端到端：注入问题→流式读出完整答案）。
- ChatALL 的 "web bot" 实为"凭证+网站内部接口"，且无 DeepSeek——故不复用其 bot，仅用其 Electron/Vue 外壳。

## Kimi 已确认选择器（详见 CHATALL_NOTES.md §9）

- 输入框：`.chat-input-editor`（contenteditable，注入用 execCommand+Enter）
- 回答：最后一个 `.chat-content-item-assistant` 内 `.markdown`
- 完成：无 `.send-button-container.stop` 即答完
- 登录：`.chat-input-editor` 存在即已登录

## 工程笔记

- Node 用 nvm v20.19.0；运行前需修复 nvm 递归：
  `N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; export npm_config_script_shell=/bin/bash; export FUNCNEST=20; unfunction node npm npx 2>/dev/null`
- 探针：`spike/probe-main.js`（持久化分区 `persist:probe`，已登录 Kimi）。日志 `spike/probe.log`。

## 下一步

- **进行中：A — 真·两个 Kimi 辩论端到端 demo**（验证"同账号两条独立对话" + 串联辩论引擎与真实 webview）。
- 待办：通义千问同法验证；正式适配器（Task 8）；两页 Vue UI（Task 10–13）；打包（Task 14–16）。
