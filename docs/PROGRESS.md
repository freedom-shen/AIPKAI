# AI 辩论台 — 进度归档

最后更新：2026-06-15

## 已完成

| 阶段 | 内容 | 状态 | 关键提交 |
|---|---|---|---|
| 设计 | spec + plan + UI 原型（两页流程） | ✅ | `65b99db` |
| 工程搭建 | 初始化仓库 + 调研笔记（`docs/DEV_NOTES.md`） | ✅ | `8efee7d` |
| Task 2–6 | 辩论引擎（语言识别/提示词/错误/传话循环），**14/14 单测通过** | ✅ | `18b6a80`…`7a13718` |
| 架构修正 | 改为**纯网页 DOM 驱动、不用任何 API**；默认 **Kimi×通义** | ✅ | `fffa462` |
| 去 fork | 删除 ChatALL 代码，改为**独立 Electron 实现**；整库 **MIT** 授权 | ✅ | （本次） |
| Task 7.5 SPIKE | **可行性验证通过**：Electron webview 驱动真实 Kimi——登录/注入/读流式回答/完成判定全部跑通 | ✅ | `ac839a5` |
| A 端到端 demo | **两个 Kimi 真实辩论跑通**：引擎↔真网页、同账号两条独立对话、注入/读取/完成判定全正常；干净完成多回合 | ✅ | `ca4aeb9` |
| A 修复/加固 | 完成检测竞态修复（先确认生成开始再判结束）；可疑短回答抓 DOM；异常处理细化 | ✅ | `f53cf34`、`1ba87d2` |

## 关键结论

- **"纯网页 DOM 驱动 + 零 API" 对 Kimi 已实证可行**（端到端：注入问题→流式读出完整答案）。
- 调研发现 ChatALL 的 "web bot" 实为"凭证+网站内部接口"、且无 DeepSeek，与我们"纯 DOM 驱动"思路不同——**故不使用其代码，改为独立 Electron 实现**（整库 MIT）。

## Kimi 已确认选择器（详见 DEV_NOTES.md §9）

- 输入框：`.chat-input-editor`（contenteditable，注入用 execCommand+Enter）
- 回答：最后一个 `.chat-content-item-assistant` 内 `.markdown`
- 完成：无 `.send-button-container.stop` 即答完
- 登录：`.chat-input-editor` 存在即已登录

## 工程笔记

- Node 用 nvm v20.19.0；运行前需修复 nvm 递归：
  `N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; export npm_config_script_shell=/bin/bash; export FUNCNEST=20; unfunction node npm npx 2>/dev/null`
- 探针：`spike/probe-main.js`（持久化分区 `persist:probe`，已登录 Kimi）。日志 `spike/probe.log`。

## A 阶段实测教训（写入 spec §4.6/§4.8）

- **完成检测竞态**：注入后必须先确认"生成真正开始"（停止按钮出现）再判结束，否则误判、读残值。
- **高峰容量错误**：Kimi 高峰返回"Kimi 有点累了…稍后再问"会混进对话流。**必须按 DOM 结构识别、严禁文字匹配**；属瞬时错误 → 重试（区别于登出/验证码 → 暂停）。
- demo 资产：`spike/debate-demo.js` / `.html` / `-renderer.js`；日志 `spike/debate-demo.log`；`touch spike/debate-go.txt` 可无人值守触发。

## 下一步

- A 已完成。待办：① 固化为正式 Kimi 适配器 + `webviewParticipant`（Task 8/9）；② 通义千问同法验证（需登录）；③ 两页 Vue UI（Task 10–13）；④ 打包（Task 14–16）。
