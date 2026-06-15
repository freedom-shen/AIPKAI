# 开发笔记

> 调研结论：桌面端（Electron）用 `<webview>` 驱动各 AI 网页（登录检测 / 注入 / 读流式回答 / 完成判定）**可行**，无需任何官方 API。调研期参考过 ChatALL 的思路，但本项目为独立实现、未使用其代码。

## 环境坑（macOS + nvm）

本机 zsh profile 定义了递归的 `node`/`_load_nvm` 包装，导致非交互 shell 下 `node`/`npm`/`npx` 报
`command not found: _load_nvm` 甚至 `maximum nested function level reached`，会**中断 npm install / 脚本**。
每个需要 node 的命令前加修复：

```sh
N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"
export npm_config_script_shell="/bin/bash"; export FUNCNEST=20
unfunction node npm npx 2>/dev/null
```

Node 用 v20（`.nvmrc` 指定）。Homebrew 的 node（v25）与部分依赖 engine 不匹配，勿用。

## 站点适配实测（SPIKE 结果）

用 `spike/probe-main.js`（独立 Electron webview，持久化 partition、UA=Chrome/130）在真实登录后的
**Kimi（www.kimi.com）** 上验证：登录检测 / 注入 / 读流式回答 / 完成判定 **全部通过**；
`spike/debate-demo.*` 进一步跑通了"两个 Kimi 自动辩论 + 同账号两条独立对话"。

### Kimi（www.kimi.com）已确认选择器
| 能力 | 选择器 / 信号 | 备注 |
|---|---|---|
| 输入框 | `.chat-input-editor`（contenteditable DIV，role=textbox） | 用 `execCommand('insertText')` 写入，再派发 Enter `keydown` 发送 |
| 登录检测 | 存在 `.chat-input-editor` 即已登录 | 未登录时为登录页 |
| 回答容器 | 最后一个 `.chat-content-item-assistant` 内的 `.markdown` | 正文在 `.markdown`/`.markdown-container` |
| **完成判定** | **无 `.send-button-container.stop` 即完成** | 生成中类含 `stop`；完成后 `stop` 消失。可靠信号 |
| 新建对话 | 侧栏"新建会话"按钮（文本匹配点击，选择器待细化） | 每场辩论开新线程 |

### 实测教训
1. **完成检测竞态**：注入后须先确认"生成真正开始"（停止按钮出现）再判结束，否则误判读残值。
2. **高峰容量错误**：Kimi 高峰会回"Kimi 有点累了…稍后再问"并混入对话流。须**按 DOM 结构识别、严禁文字匹配**；属瞬时错误 → 重试。
3. 通义千问待同法验证后补本表。
