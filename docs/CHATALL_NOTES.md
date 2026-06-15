# ChatALL Codebase Notes (for AI Debate Arena)

Snapshot of upstream `ai-shifu/ChatALL` (package version `1.85.110`) as forked into this repo
on the `ai-debate-arena` branch. Paths are relative to repo root unless noted. This documents
ChatALL's existing structure so later debate-feature tasks know exactly what to reuse / extend.

Stack at a glance: **Electron + Vue 3 + Vuetify + Vuex**, built by **vue-cli-plugin-electron-builder**
(Webpack under the hood, not Vite). Persistence via **Vuex** (settings) + **Dexie/IndexedDB** (chats/messages).

---

## 1. Bots: base class + how "web access" bots work

- **Bot base class:** `src/bots/Bot.js` -> `export default class Bot`.
  - Key static config fields: `_brandId`, `_className`, `_model`, `_logoFilename`, `_loginUrl`,
    `_userAgent`, `_loginScript`, `_lock` (an `async-lock` `AsyncLock`), `_settingsComponent`,
    `_outputFormat` (`"markdown"` | `"html"`), `_isAvailable`.
  - **Public entry point:** `async sendPrompt(prompt, onUpdateResponse, callbackParam)` (Bot.js:172).
    It checks `isAvailable()`, emits a `{ content: "...", done: false }` "thinking" tick, optionally
    acquires `_lock` (so only one prompt per brand runs at a time), then calls the subclass hook.
  - **Subclass hook to implement:** `async _sendPrompt(prompt, onUpdateResponse, callbackParam)`
    (Bot.js:167, throws "not implemented" by default). Subclasses stream output by repeatedly calling
    `onUpdateResponse(callbackParam, { content, done })`.
  - **Availability/login check:** `checkAvailability()` -> subclass `_checkAvailability()`
    (returns `false` by default). Subclasses verify cookie/token presence here.
  - **Per-chat context:** `createChatContext()`, `getChatContext()`, `setChatContext()` persist a
    bot-specific conversation context into the current chat record (via Vuex `setChatContext`).
  - **Error helpers:** `wrapCollapsedSection(text)` wraps errors in a `<details>` block;
    `LoginError` (exported from Bot.js) triggers a "please log in" message with a login hyperlink.

- **Bot inventory:** ~82 files under `src/bots/` (`find src/bots -name '*.js'`). Two broad families:
  1. **API bots** (most current defaults) – use LangChain / axios with user-supplied API keys.
     Base helper: `src/bots/LangChainBot.js` (and `src/bots/AsyncWebBot.js` / brand subfolders like
     `src/bots/anthropic/`, `src/bots/openai/`, `src/bots/google/`, `src/bots/groq/`, `src/bots/xai/`...).
  2. **"Web access" bots** – talk to a vendor's *web* chat backend by reusing the logged-in browser
     session (cookies / localStorage tokens harvested from a login window – see section 3). They do
     **not** screen-scrape a webview DOM; they call the site's own HTTP/WS API with the harvested creds.
     Examples and how each sends a prompt + parses the reply:
     - `src/bots/CharacterAIBot.js` – `_checkAvailability()` GETs character.ai `_next/data` JSON;
       `_sendPrompt()` opens a **WebSocket** (`websocket-as-promised`), streams turns, emits
       `onUpdateResponse(..., { content, done:false })` per chunk and `{ done:true }` at end (lines ~87-119).
     - `src/bots/PerplexityBot.js` – WebSocket; "done" detected when the message `number` starts with
       `"43"` (PerplexityBot.js ~267-280), then emits final `{ content: text.answer, done:true }`.
     - `src/bots/QianWenBot.js`, `src/bots/moonshot/KimiBot.js`, `src/bots/MOSSBot.js`,
       `src/bots/ClaudeAIBot.js`, `src/bots/PhindBot.js`, `src/bots/PiBot.js`, `src/bots/YouChatBot.js`,
       `src/bots/SparkBot.js`, `src/bots/MistralBot.js` – same pattern (SSE/WS/axios), each ending its
       stream with an `onUpdateResponse(callbackParam, { done: true })` call.
  - **Templates to copy when adding a bot:** `src/bots/TemplateBot.js` and `src/bots/DevBot.js`
    (minimal `_sendPrompt` examples documenting the `{ content, done }` contract).

> For the Debate Arena, the reusable contract is: implement `_sendPrompt` and stream via
> `onUpdateResponse(callbackParam, { content, done })`. `done:true` is the universal "turn finished" signal.

## 2. Webview / BrowserWindow creation & `executeJavaScript`

ChatALL does **not** use Electron `<webview>` tags or `BrowserView` for chatting. It uses extra
**`BrowserWindow`** instances purely for *login*, in the main process:

- File: **`src/background.js`** (the Electron main process; the electron entry is `src/background.js`).
  - `createWindow()` (background.js:146) – the main app window. `webPreferences`:
    `nodeIntegration:true`, `contextIsolation:false`, `webSecurity:false`, `preload:"./preload.js"`.
    > Note: `webSecurity:false` is how cross-origin web-access bots work. There is **no** `preload.js`
    > file in `src/` (referenced but absent in source; the renderer uses `window.require("electron")`
    > directly because nodeIntegration is on).
  - `createNewWindow({ url, userAgent, loginScript })` (background.js:286) – opens a **login window**
    with `nodeIntegration:false`, `contextIsolation:true`. After `dom-ready` it runs the bot's
    `loginScript` via **`newWin.webContents.executeJavaScript(loginScript)`** (background.js:307).
  - **On window `close`** (background.js:310) it calls `executeJavaScript(...)` again to harvest secrets
    from `localStorage` / `document.cookie` (helpers `getLocalStorage` / `getCookie`, lines 315-325),
    then `mainWindow.webContents.send(<CHANNEL>, ...)` to the renderer (see sections 3 & 5).

> This `executeJavaScript` call site (background.js:307 and 315-357) is the natural hook for the
> Debate Arena if we ever need to drive a page's DOM. Today it's used for login-script + secret-scrape only.

## 3. Bot session / login (cookies, partitions, tokens)

- **No custom `session` partition is used** – everything shares the default session of `mainWindow`
  (`win.webContents.session`). Login windows share that same session, so cookies set during login are
  visible to the main window's outbound requests.
- **Cookie normalization:** in `createWindow()`, a `session.cookies.on("changed", ...)` handler
  (background.js:167-205) rewrites every explicitly-set cookie to `sameSite:"no_restriction"`,
  `secure:true` so cross-origin web-bot requests work. Allowed domains
  (`allowedDomains = ["aliyun.com","qianwen.aliyun.com"]`, background.js:12) get a 7-day expiry bump.
- **Header rewriting:** `session.webRequest.onBeforeSendHeaders` (background.js:224-271) forces
  `Referer`, and patches headers for Gemini, Copilot (`wss://sydney.bing.com`), character.ai, etc.
- **Token / secret harvesting** on login-window close (background.js:327-357), sent to renderer:
  - MOSS: `localStorage["flutter.token"]` -> IPC `moss-secret`
  - QianWen: cookie `XSRF-TOKEN` -> IPC `QIANWEN-XSRF-TOKEN`
  - SkyWork: `aiChatQueueWaitToken` + `aiChatResearchToken` -> IPC `SKYWORK-TOKENS`
  - Claude (web): cookie `lastActiveOrg` -> IPC `CLAUDE-2-ORG`
  - Poe: `window.ereNdsRqhp2Rd3LEW()` -> IPC `POE-FORMKEY`
  - ChatGLM: cookie `chatglm_token` -> IPC `CHATGLM-TOKENS`
  - Kimi: `access_token` + `refresh_token` -> IPC `KIMI-TOKENS`
- **Login UI trigger (renderer):** `src/components/BotSettings/LoginSetting.vue` calls
  `ipcRenderer.invoke("create-new-window", { url, userAgent, loginScript })`.
- **Reading cookies programmatically:** IPC `get-cookies` -> `getCookies(filter)` (background.js:369, 427).
- **Proxy support:** per-bot/global proxy stored in `<userData>/proxySetting.json`, applied via
  `app.commandLine.appendSwitch` in `getProxySetting()` (background.js:74-140). QUIC disabled
  (`disable-quic`) to avoid Cloudflare real-IP leaks behind proxies (background.js:35).

## 4. Existing "response complete / isDone" detection (reuse this)

- The **universal signal** is the `done` boolean in `onUpdateResponse(callbackParam, { content, done })`.
  Each web/SSE/WS bot maps its own end-of-stream marker to `done:true`. Search:
  `grep -rn "done: true" src/bots` (~20+ call sites, e.g. CharacterAIBot.js:97/119, PerplexityBot.js,
  KimiBot.js:108, MistralBot.js:102/126, PhindBot.js:120, SparkBot.js, QianWenBot.js:167).
- The callback is wired in the Vuex `sendPrompt` action (`src/store/index.js:515-520`) to
  `dispatch("updateMessage", { index, message: { content, done } })`. The store mutations at
  `src/store/index.js:578` and `:591` branch on `values.done` to finalize a message.
- **Reuse plan:** for the Debate Arena, "a bot finished its turn" == receiving an `onUpdateResponse`
  with `done:true`. No new detection mechanism is needed — wrap `bot.sendPrompt(...)` in a Promise that
  resolves on the `done:true` callback.

## 5. IPC channels (main <-> renderer)

Renderer uses `const { ipcRenderer } = window.require("electron")`. Main handlers in `src/background.js`.

**Renderer -> Main (`ipcRenderer.invoke` / `ipcMain.handle`):**
- `create-new-window` `{url,userAgent,loginScript}` -> opens login window (background.js:376)
- `get-native-theme` -> `{ shouldUseDarkColors }` (background.js:383)
- `get-proxy-setting-path` / `get-proxy-setting-content` / `reset-proxy-default-setting`
  / `save-proxy-setting` / `save-proxy-and-restart` (background.js:390-420)
- `set-is-show-menu-bar` (background.js:423; called from `src/main.js:52`, `src/App.vue:15`)
- `get-cookies` `{filter}` -> cookies (background.js:427)

**Main -> Renderer (`mainWindow.webContents.send` / `ipcRenderer.on`):**
- `commit` `(mutation, value)` – generic "commit a Vuex mutation from main"; listener in
  `src/main.js:53`. Used e.g. by `setCharacterAI` (background.js:263).
- `on-updated-system-theme` – listener `src/App.vue:218`.
- `CHECK-AVAILABILITY` `(url)` – after a login window closes; listener
  `src/components/Footer/FooterBar.vue:352` re-checks the relevant bot.
- Token channels (listeners in `src/components/BotSettings/*BotSettings.vue`):
  `QIANWEN-XSRF-TOKEN`, `moss-secret`, `POE-FORMKEY`, `CLAUDE-2-ORG`, `SKYWORK-TOKENS`,
  `CHATGLM-TOKENS`, `KIMI-TOKENS`.

> There is **no main<->webview channel** because there are no webview/BrowserView chat surfaces;
> communication is only main<->renderer.

## 6. State management

- **Vuex** (Vue 3, `vuex@4`): store created in **`src/store/index.js`** (`createStore`, line 25).
  - `state` (line 26), `mutations` (line 155), `actions` (line 468). Notable actions:
    `sendPrompt` (line 482) and `sendPromptInThread` (line 530) fan a prompt out to selected bots;
    `updateMessage` finalizes streamed chunks.
  - Persistence via **`vuex-persist`** (`VuexPersistence`, index.js:13). `updateCounter` and
    `selectedResponses` are excluded from persistence (index.js:19).
  - `modules: {}` (index.js:618) – currently no namespaced sub-modules.
- **Dexie / IndexedDB** for chat data: **`src/store/db.js`** – DB name `"ChatALL"`, tables
  `chats`, `messages`, `threads`. Wrappers:
  - `src/store/chats.js` (`Chats` class; `getCurrentChat`, `add`, `update`; default `favBots` list
    of API bots is defined here, chats.js:13-35).
  - `src/store/messages.js`, `src/store/threads.js`.
  - `src/store/queue.js` – `messageQueue` / `threadMessageQueue` batch DB writes for streamed updates
    (`initializeQueues`, `startQueuesProcessing`).
  - `src/store/migration.js` – schema/data migrations.
- **Response rendering UI:** `src/components/Messages/` (`ChatMessages.vue`, `ChatPrompt.vue`,
  `ChatResponse.vue`, `ChatThread.vue`). Send button + orchestration in
  `src/components/Footer/FooterBar.vue` (`sendPromptToBots` -> `store.dispatch("sendPrompt", ...)`).

## 7. Start / build scripts & electron-builder config

From **`package.json`** scripts:
- **Dev / serve (run the app in dev):** `npm run electron:serve` (`vue-cli-service electron:serve`).
  - Pure web dev server (no Electron): `npm run serve`.
- **Build app:** `npm run electron:build` (`vue-cli-service electron:build`).
  - Web-only build: `npm run build`.
  - Platform releases: `release-all`, `release-macos`, `release-linux`, `release-windows`.
- **Electron entry / start:** `"main"` is `src/background.js` (per vue-cli-plugin-electron-builder);
  `npm start` runs `electron .`.
- `postinstall` / `postuninstall`: `electron-builder install-app-deps` (native dep rebuild).
- `prepare`: `husky install`.
- **electron-builder config location:** in **`vue.config.js`** under
  `pluginOptions.electronBuilder.builderOptions` (NOT a standalone `electron-builder.yml`).
  appId `ai.chatall`, productName `ChatALL`, mac/win/linux targets, icons in `src/assets/`.
  Also note `customFileProtocol: "./"` workaround for prod `app://` asset loading.

## 8. Versions + install/run gotchas (macOS, this machine)

- **Node:** `package.json` `engines.node = "^20"`; `.nvmrc` pins `20`. We used nvm's
  **v20.19.0** (`~/.nvm/versions/node/v20.19.0`). Homebrew node is v25 — do **not** use it (engine mismatch).
- **Electron:** `^33.4.11` (devDependency). electron-builder `^25.1.8`.
- **Framework:** Vue `^3.5`, Vuetify `^3.8`, Vuex `^4.1`, built via `@vue/cli-service` 5 +
  `vue-cli-plugin-electron-builder@3.0.0-alpha.4` (Webpack, not Vite).
- **GOTCHA 1 — nvm recursion in non-interactive shells.** Running plain `node`/`npm` (and any npm
  lifecycle script that spawns a shell) triggers the user's zsh profile, which defines a recursive
  `node()` wrapper and `_load_nvm`, producing `command not found: _load_nvm` spam and
  `maximum nested function level reached; increase FUNCNEST?`, which **kills npm install / lifecycle scripts**.
  - **FIX that worked:** put the *real* binary dir on PATH, drop the shell wrapper functions, and
    force lifecycle scripts to use bash instead of the broken zsh:
    ```sh
    N="$HOME/.nvm/versions/node/v20.19.0/bin"
    export PATH="$N:$PATH"
    export npm_config_script_shell="/bin/bash"   # keeps electron-builder postinstall from re-entering zsh/nvm
    export FUNCNEST=20                            # safety against any residual recursion
    unfunction node npm npx 2>/dev/null
    "$N/node" "$N/../lib/node_modules/npm/bin/npm-cli.js" install --foreground-scripts
    ```
- **GOTCHA 2 — corporate npm mirror flakiness.** The active registry is
  `https://registry-npm.tuya-inc.top/` and it intermittently returned **HTTP 500** for one tarball
  (`zod-to-json-schema-3.23.5.tgz`), failing the whole install.
  - **FIX that worked:** prime the cache from the public registry, then re-install offline-first:
    ```sh
    npm cache add zod-to-json-schema@3.23.5 --registry=https://registry.npmjs.org/
    npm install --prefer-offline
    ```
- **Harmless warnings:** `EBADENGINE` for `@electron/osx-sign@2.0.0` (wants Node >=22.12) — fine to
  ignore on Node 20; it only matters for mac code-signing during release builds.
- **Smoke check:** run non-blocking with a timeout so it can't hang:
  ```sh
  N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"
  export npm_config_script_shell="/bin/bash"; unfunction node npm npx 2>/dev/null
  timeout 90 npm run electron:serve > /tmp/serve.log 2>&1; echo "exit=$?"; tail -40 /tmp/serve.log
  ```
  A timeout-kill (exit 124) after a clean compile is acceptable; final visual confirmation of the
  window is a manual human step.

## 9. 站点适配实测（SPIKE Task 7.5 结果）

用 `spike/probe-main.js`（独立 Electron + webview，持久化 partition、UA=Chrome/130）在真实登录后的
**Kimi（www.kimi.com）** 上验证：登录检测 / 注入 / 读流式回答 / 完成判定 **全部通过**。
端到端实证：注入"写一段100字散文介绍西湖春天" → Kimi 流式作答（len 0→13→36→…→149）→ 完整读出答案。

### Kimi（www.kimi.com）已确认选择器
| 能力 | 选择器 / 信号 | 备注 |
|---|---|---|
| 输入框 | `.chat-input-editor`（**contenteditable DIV**，role=textbox） | 非 textarea；用 `document.execCommand('insertText')` 或设置 textContent + input 事件，再派发 Enter `keydown` 发送 |
| 登录检测 | 存在 `.chat-input-editor` 即视为已登录 | 未登录时该输入框不存在/为登录页 |
| 回答容器 | 最后一个 `.chat-content-item-assistant` 内的 `.markdown` | 用户消息是 `.chat-content-item-user`；助手是 `.chat-content-item-assistant`；正文在 `.markdown`/`.markdown-container` |
| **完成判定** | **无 `.send-button-container.stop` 即完成** | 生成中按钮类含 `stop`（`send-button-container disabled stop`）；完成后 `stop` 消失（`send-button-container disabled`）。这是可靠信号，优于文本稳定法 |
| 新建对话 | 侧栏"新建会话"（`⌘K`）按钮 | 选择器待补（下次 inspect 侧栏时记录）；用于每场辩论开新线程 |

> 结论：**"纯网页 DOM 驱动 + 不用任何 API" 路线对 Kimi 可行。** 通义千问待同法验证后补本表。
> 适配器实现（Task 8）按本表选择器落地；完成判定用 `.send-button-container.stop` 的存在与否。
