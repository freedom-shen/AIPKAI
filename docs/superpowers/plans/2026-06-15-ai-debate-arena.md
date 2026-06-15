# AI 辩论台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个桌面 App：用户输入话题、选两个 AI（默认 DeepSeek×DeepSeek），系统自动分正反方，驱动各 AI 的**网页版**互相辩论 N 回合（默认 5），全程不调付费 API。

**Architecture:** fork [ChatALL](https://github.com/ai-shifu/ChatALL)（Electron + Vue 3，已能驱动 40+ AI 网页版）。在其之上新增三层：① 纯逻辑「辩论引擎」（语言识别 + 提示词 + 传话循环，可单测）；② 逐站「AI 适配器」（登录检测/新建对话/注入/读取/完成检测/异常检测，封装 DOM 差异）；③ 两页 Vue UI（准备/登录 → 辩论）。引擎只依赖一个 `Participant` 接口，适配器+webview 桥接实现该接口，从而引擎可用 mock 完整 TDD。

**Tech Stack:** Electron, Vue 3, JavaScript (ESM), Vitest（新增，用于引擎单测）, ChatALL 现有 webview/会话机制。

**平台要求（硬性）：** 必须能在 **macOS（当前开发机即 darwin）** 上开发期启动并跑通；最终产出可用的 Mac 安装包。Mac 关键点：① 用兼容的 Node（本机有 nvm，建议固定一个 LTS 版本，如 `nvm use 20`）；② Electron 需开启 `webPreferences.webviewTag: true` 才能用 `<webview>`；③ webview 用**持久化 partition**（如 `persist:deepseek`）让登录态跨重启保留；④ 未签名 Mac 应用首次打开需右键「打开」绕过 Gatekeeper（签名/公证可后置）。

设计文档：`docs/superpowers/specs/2026-06-15-ai-debate-arena-design.md`
UI 原型：`mockup/debate-ui.html`

---

## File Structure

新增/修改文件及职责：

| 文件 | 职责 | 类型 |
|---|---|---|
| `src/debate/language.js` | `detectLanguage(text)` → `'zh'｜'en'` | 新建·纯逻辑 |
| `src/debate/prompts.js` | 构造开场/反驳提示词（按语言） | 新建·纯逻辑 |
| `src/debate/errors.js` | `DebateAborted` / `TurnTimeout` / `AbnormalStateError` | 新建·纯逻辑 |
| `src/debate/orchestrator.js` | 辩论传话循环：分回合、超时重试、异常暂停、abort | 新建·纯逻辑 |
| `src/debate/adapters/contract.js` | `AIAdapter` 接口契约（JSDoc）+ 校验 | 新建 |
| `src/debate/adapters/deepseek.js` | DeepSeek 网页版适配器（在 webview 内执行的 DOM 脚本） | 新建·DOM |
| `src/debate/webviewParticipant.js` | 把 `adapter + Electron webview` 包成引擎用的 `Participant` | 新建·集成 |
| `src/store/debate.js`（或并入现有 store） | 辩论状态：配置、登录态、运行态、记录 | 修改/新建 |
| `src/components/DebateSetup.vue` | 页面一：话题/选 AI/回合/登录区/确认弹窗 | 新建·UI |
| `src/components/DebateRun.vue` | 页面二：辩论记录（边吐边显）+ 网页版实况 + 复制全文 | 新建·UI |
| `tests/debate/*.test.js` | 引擎单测 | 新建·测试 |
| `docs/CHATALL_NOTES.md` | Task 1 产出：ChatALL 结构与集成点记录 | 新建·文档 |

`Participant` 接口（引擎↔适配器的唯一耦合点）：

```js
/**
 * @typedef {Object} Participant
 * @property {() => Promise<void>} newChat            开新对话并锁定其唯一标识
 * @property {(prompt: string, onChunk?: (partialText: string) => void) => Promise<string>} ask
 *           注入 prompt、等待回答完成、返回最终文本；流式过程通过 onChunk 回调
 */
```

---

## Phase 0 — 工程搭建与 ChatALL 摸底

### Task 1: Fork / clone ChatALL 并跑起来，记录结构

**Files:**
- Create: `docs/CHATALL_NOTES.md`

- [ ] **Step 1: 获取代码并初始化 git**

```bash
cd /Users/na/Documents/github/AIPKAI
git init
git clone https://github.com/ai-shifu/ChatALL.git .  # 若目录非空，先 clone 到临时目录再迁移
git remote rename origin upstream
git checkout -b ai-debate-arena
```

- [ ] **Step 2: 安装依赖并在 Mac 上启动**

```bash
nvm use 20            # 固定一个兼容 Node 版本（本机有 nvm）
npm install
npm run electron:serve   # 具体脚本名以 package.json 为准
```
Expected: 在这台 **Mac** 上弹出 ChatALL 桌面窗口，能看到多 bot 输入界面。若启动失败，优先排查 Node 版本与 Electron 原生模块重建（`npm rebuild` / `electron-rebuild`）。

- [ ] **Step 3: 摸清并记录集成点到 `docs/CHATALL_NOTES.md`**

记录以下事实（逐条写明文件路径与函数名）：
1. 各 bot 的实现位置（如 `src/bots/` 目录结构、`Bot` 基类、`SydneyBot/WebBot` 等 web-access bot 的 `sendPrompt`/解析回答的方法）。
2. webview / BrowserView 的创建与 `executeJavaScript` 调用位置。
3. 各 bot 会话/登录态（session partition / cookie）的管理方式。
4. 现有"回答完成"是如何判定的（找现成可复用的 isDone 逻辑）。
5. 主进程↔渲染进程↔webview 的通信方式（IPC 通道）。
6. 状态管理（Vuex/Pinia？store 文件位置）。
7. 启动/打包脚本（`package.json` 的 scripts、electron-builder 配置）。

- [ ] **Step 4: Commit**

```bash
git add docs/CHATALL_NOTES.md
git commit -m "docs: record ChatALL structure and integration points"
```

### Task 2: 接入 Vitest（用于引擎单测）

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: 安装 vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: 写 `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.js"], environment: "node" },
});
```

- [ ] **Step 3: 加 test 脚本到 `package.json` 的 scripts**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 写冒烟测试 `tests/smoke.test.js`**

```js
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: 运行并确认通过**

Run: `npm test`
Expected: 1 passed。

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.js tests/smoke.test.js
git commit -m "test: add vitest for debate engine"
```

---

## Phase 1 — 辩论引擎（纯逻辑，完整 TDD）

### Task 3: 语言识别 `detectLanguage`

**Files:**
- Create: `src/debate/language.js`
- Test: `tests/debate/language.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import { detectLanguage } from "../../src/debate/language.js";

describe("detectLanguage", () => {
  it("returns zh when text contains CJK", () => {
    expect(detectLanguage("AI 会取代程序员吗？")).toBe("zh");
  });
  it("returns en for pure latin text", () => {
    expect(detectLanguage("Will AI replace programmers?")).toBe("en");
  });
  it("defaults to en for empty/unknown", () => {
    expect(detectLanguage("")).toBe("en");
    expect(detectLanguage("12345 !!!")).toBe("en");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/debate/language.test.js`
Expected: FAIL（找不到模块）。

- [ ] **Step 3: 实现**

```js
// src/debate/language.js
/**
 * 轻量语言识别：含中日韩统一表意文字判为中文，否则英文。
 * @param {string} text
 * @returns {'zh'|'en'}
 */
export function detectLanguage(text) {
  if (text && /[一-鿿]/.test(text)) return "zh";
  return "en";
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/debate/language.test.js`
Expected: 3 passed。

- [ ] **Step 5: Commit**

```bash
git add src/debate/language.js tests/debate/language.test.js
git commit -m "feat(debate): add language detection"
```

### Task 4: 提示词构造 `prompts`

**Files:**
- Create: `src/debate/prompts.js`
- Test: `tests/debate/prompts.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import {
  buildProOpening, buildConOpening, buildRebuttal,
} from "../../src/debate/prompts.js";

describe("prompts (zh)", () => {
  it("pro opening contains topic and 正方/支持", () => {
    const p = buildProOpening("AI 会取代程序员", "zh");
    expect(p).toContain("AI 会取代程序员");
    expect(p).toContain("正方");
    expect(p).toContain("支持");
  });
  it("con opening contains topic, 反方, and opponent text", () => {
    const p = buildConOpening("AI 会取代程序员", "对方开场内容", "zh");
    expect(p).toContain("反方");
    expect(p).toContain("对方开场内容");
  });
  it("rebuttal embeds opponent text", () => {
    const p = buildRebuttal("对方上一句", "zh");
    expect(p).toContain("对方上一句");
  });
});

describe("prompts (en)", () => {
  it("uses english template", () => {
    const p = buildProOpening("Will AI replace devs", "en");
    expect(p.toLowerCase()).toContain("for the motion");
    expect(p).toContain("Will AI replace devs");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/debate/prompts.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现**

```js
// src/debate/prompts.js
const T = {
  zh: {
    proOpening: (topic) =>
      `我们进行一场辩论，辩题：「${topic}」。你是正方，立场是支持该观点。请用有力论据陈述开场，约200字，像真人辩手一样，直接开始，不要客套。`,
    conOpening: (topic, opp) =>
      `我们进行一场辩论，辩题：「${topic}」。你是反方，立场是反对该观点。对方（正方）刚才说：『${opp}』。请针对性反驳并陈述你的观点，约200字。`,
    rebuttal: (opp) =>
      `对方回应：『${opp}』。请针对性反驳并强化你的论点，约200字。`,
  },
  en: {
    proOpening: (topic) =>
      `We are holding a debate on: "${topic}". You are FOR the motion (you support it). Give a strong opening argument in ~200 words, like a real debater. Start directly, no pleasantries.`,
    conOpening: (topic, opp) =>
      `We are holding a debate on: "${topic}". You are AGAINST the motion. Your opponent (for the motion) just said: "${opp}". Rebut directly and state your case in ~200 words.`,
    rebuttal: (opp) =>
      `Your opponent replied: "${opp}". Rebut directly and strengthen your argument in ~200 words.`,
  },
};

const pick = (lang) => T[lang] || T.en;

export const buildProOpening = (topic, lang) => pick(lang).proOpening(topic);
export const buildConOpening = (topic, opponentText, lang) => pick(lang).conOpening(topic, opponentText);
export const buildRebuttal = (opponentText, lang) => pick(lang).rebuttal(opponentText);
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/debate/prompts.test.js`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add src/debate/prompts.js tests/debate/prompts.test.js
git commit -m "feat(debate): add prompt builders (zh/en)"
```

### Task 5: 错误类型 `errors`

**Files:**
- Create: `src/debate/errors.js`
- Test: `tests/debate/errors.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import { DebateAborted, TurnTimeout, AbnormalStateError } from "../../src/debate/errors.js";

describe("errors", () => {
  it("are Error subclasses with names", () => {
    expect(new DebateAborted()).toBeInstanceOf(Error);
    expect(new TurnTimeout().name).toBe("TurnTimeout");
    const e = new AbnormalStateError("captcha");
    expect(e.name).toBe("AbnormalStateError");
    expect(e.reason).toBe("captcha");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/debate/errors.test.js` → FAIL。

- [ ] **Step 3: 实现**

```js
// src/debate/errors.js
export class DebateAborted extends Error { constructor() { super("debate aborted"); this.name = "DebateAborted"; } }
export class TurnTimeout extends Error { constructor() { super("turn timed out"); this.name = "TurnTimeout"; } }
export class AbnormalStateError extends Error {
  /** @param {string} reason  如 'logged_out' | 'captcha' | 'rate_limited' | 'refused' */
  constructor(reason) { super(`abnormal state: ${reason}`); this.name = "AbnormalStateError"; this.reason = reason; }
}
```

- [ ] **Step 4: 运行确认通过** → 1 passed。

- [ ] **Step 5: Commit**

```bash
git add src/debate/errors.js tests/debate/errors.test.js
git commit -m "feat(debate): add error types"
```

### Task 6: 辩论循环 `orchestrator`（核心）

**Files:**
- Create: `src/debate/orchestrator.js`
- Test: `tests/debate/orchestrator.test.js`

- [ ] **Step 1: 写失败测试（覆盖：回合数、传话、首轮模板、重试、异常不重试、abort）**

```js
import { describe, it, expect, vi } from "vitest";
import { runDebate, Stance } from "../../src/debate/orchestrator.js";
import { AbnormalStateError } from "../../src/debate/errors.js";

// 造一个可编程的假 Participant
function fakeParticipant(answers) {
  const calls = [];
  let i = 0;
  return {
    calls,
    newChat: vi.fn(async () => {}),
    ask: vi.fn(async (prompt) => {
      calls.push(prompt);
      const a = answers[i++];
      if (typeof a === "function") return a();
      return a;
    }),
  };
}

const cfg = { topic: "T", rounds: 2, lang: "zh" };

describe("runDebate", () => {
  it("runs 2N turns and alternates pro/con, calls newChat once each", async () => {
    const pro = fakeParticipant(["P1", "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    const turns = [];
    await runDebate(cfg, { pro, con }, { onTurn: (t) => turns.push(t) });
    expect(pro.newChat).toHaveBeenCalledTimes(1);
    expect(con.newChat).toHaveBeenCalledTimes(1);
    expect(turns.map((t) => `${t.round}${t.stance}`)).toEqual([
      `1${Stance.PRO}`, `1${Stance.CON}`, `2${Stance.PRO}`, `2${Stance.CON}`,
    ]);
    expect(turns.map((t) => t.text)).toEqual(["P1", "C1", "P2", "C2"]);
  });

  it("first pro prompt has topic; con's first prompt embeds pro's opening; later rounds embed opponent last text", async () => {
    const pro = fakeParticipant(["P1", "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    await runDebate(cfg, { pro, con }, {});
    expect(pro.calls[0]).toContain("T");          // pro opening has topic
    expect(con.calls[0]).toContain("P1");         // con opening embeds pro opening
    expect(pro.calls[1]).toContain("C1");         // round2 pro embeds con's last
    expect(con.calls[1]).toContain("P2");         // round2 con embeds pro's last
  });

  it("retries a failing turn once, then succeeds", async () => {
    const pro = fakeParticipant([() => { throw new Error("boom"); }, "P1-ok", "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    const out = [];
    await runDebate(cfg, { pro, con }, { onTurn: (t) => out.push(t.text) });
    expect(out[0]).toBe("P1-ok"); // 第一次 throw，重试后拿到 P1-ok
  });

  it("does NOT retry on AbnormalStateError; emits onAbnormal and stops", async () => {
    const pro = fakeParticipant([() => { throw new AbnormalStateError("logged_out"); }]);
    const con = fakeParticipant(["C1"]);
    const onAbnormal = vi.fn();
    await runDebate(cfg, { pro, con }, { onAbnormal });
    expect(onAbnormal).toHaveBeenCalledOnce();
    expect(onAbnormal.mock.calls[0][0].reason).toBe("logged_out");
    expect(pro.ask).toHaveBeenCalledTimes(1); // 未重试
  });

  it("aborts via signal before next turn", async () => {
    const ctrl = new AbortController();
    const pro = fakeParticipant([async () => { ctrl.abort(); return "P1"; }, "P2"]);
    const con = fakeParticipant(["C1", "C2"]);
    const onTurn = vi.fn();
    await runDebate(cfg, { pro, con }, { onTurn }, { signal: ctrl.signal });
    expect(onTurn).toHaveBeenCalledTimes(1); // 只有 P1，之后 abort
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/debate/orchestrator.test.js` → FAIL。

- [ ] **Step 3: 实现**

```js
// src/debate/orchestrator.js
import { buildProOpening, buildConOpening, buildRebuttal } from "./prompts.js";
import { DebateAborted, TurnTimeout, AbnormalStateError } from "./errors.js";

export const Stance = { PRO: "pro", CON: "con" };

function withTimeout(promise, ms, signal) {
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TurnTimeout()), ms);
    const onAbort = () => { clearTimeout(timer); reject(new DebateAborted()); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function askWithRetry(participant, prompt, onChunk, { turnTimeoutMs, signal }) {
  try {
    return await withTimeout(participant.ask(prompt, onChunk), turnTimeoutMs, signal);
  } catch (e) {
    if (e instanceof DebateAborted || e instanceof AbnormalStateError) throw e; // 不重试
    // 超时/一般错误：重试一次
    return await withTimeout(participant.ask(prompt, onChunk), turnTimeoutMs, signal);
  }
}

/**
 * @param {{topic:string, rounds:number, lang:'zh'|'en'}} config
 * @param {{pro:Participant, con:Participant}} participants
 * @param {{onTurnStart?,onChunk?,onTurn?,onComplete?,onAbnormal?,onError?}} hooks
 * @param {{signal?:AbortSignal, turnTimeoutMs?:number}} [options]
 */
export async function runDebate(config, participants, hooks = {}, options = {}) {
  const { topic, rounds, lang } = config;
  const { pro, con } = participants;
  const { signal } = options;
  const turnTimeoutMs = options.turnTimeoutMs ?? 60000;
  const emit = (name, ...a) => { if (hooks[name]) hooks[name](...a); };
  const aborted = () => signal?.aborted;

  try {
    if (aborted()) return;
    await pro.newChat();
    await con.newChat();

    let last = "";
    for (let round = 1; round <= rounds; round++) {
      for (const stance of [Stance.PRO, Stance.CON]) {
        if (aborted()) return;
        const who = stance === Stance.PRO ? pro : con;
        let prompt;
        if (round === 1 && stance === Stance.PRO) prompt = buildProOpening(topic, lang);
        else if (round === 1 && stance === Stance.CON) prompt = buildConOpening(topic, last, lang);
        else prompt = buildRebuttal(last, lang);

        emit("onTurnStart", { round, stance });
        const text = await askWithRetry(
          who, prompt, (p) => emit("onChunk", { round, stance, partial: p }),
          { turnTimeoutMs, signal }
        );
        last = text;
        emit("onTurn", { round, stance, text });
      }
    }
    emit("onComplete", { rounds });
  } catch (e) {
    if (e instanceof DebateAborted) return;
    if (e instanceof AbnormalStateError) { emit("onAbnormal", e); return; }
    emit("onError", e);
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/debate/orchestrator.test.js`
Expected: 5 passed。

- [ ] **Step 5: 跑全量引擎测试**

Run: `npm test`
Expected: 所有 debate 测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/debate/orchestrator.js tests/debate/orchestrator.test.js
git commit -m "feat(debate): add relay-loop orchestrator with retry/abort/abnormal handling"
```

---

## ⚠️ 架构更新（Task 1 摸底后确认，2026-06-15）

Task 1 探查发现：① ChatALL 的"网页版 bot"是用**登录凭证调网站内部 HTTP/WS 接口**（非 DOM 抓取）；② **没有 DeepSeek bot**。用户明确：**只要纯网页、不用任何 API**（连 ChatALL 走内部接口的 bot 也不用）。因此：

- **取数方式 = 纯 DOM 驱动**：自己加 Electron `<webview>` 嵌入真实网页，注入/读 DOM/DOM 信号判完成（即本计划 Phase 2/3 原本就写的 DOM 适配器路线）。
- **不复用 ChatALL 的 bot**；ChatALL 仅作 Electron/Vue 外壳 + 会话/登录基础设施。需在主窗口开启 `webviewTag` 并自建两个 `<webview>`（ChatALL 现仅用 BrowserWindow 做登录，无聊天 webview）。
- **默认辩手改为 Kimi × 通义千问**（`chat.deepseek.com` 换成 `www.kimi.com` 与 通义 `tongyi.aliyun.com`/`www.tongyi.com`）。下文 Phase 2–4 中所有 "DeepSeek" 一律替换为 "Kimi / 通义" 两个适配器。

### Task 7.5（SPIKE，最高优先级，先做）: 验证一个站点可被 DOM 驱动

> 这是整个项目的可行性命门。在投入全部脚手架前，先用最小代价验证：Electron webview 里能否对真实登录后的 Kimi 完成 登录检测→注入→读回答→完成判定。**需要人参与**（GUI + 手动登录 Kimi）。

**Files:** Create: `spike/probe-main.js`（独立最小 Electron 主进程，不依赖 ChatALL 构建）

- [ ] **Step 1: 写最小 Electron 探针**：开一个 `BrowserWindow` 加载 `https://www.kimi.com`，`webPreferences:{}` 默认即可，打开 DevTools。`dom-ready` 后注入一个全局 helper `window.__probe = { isLoggedIn, inject, latestAnswer, isComplete }`，每个先用候选选择器实现，便于在控制台手测。
- [ ] **Step 2: 人工跑探针**（交给用户）：
```
N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; unfunction node npm npx 2>/dev/null
npx electron spike/probe-main.js
```
在弹出的 Kimi 窗口里**登录自己的账号**；然后在 DevTools 控制台依次执行：`__probe.isLoggedIn()`、`__probe.inject("用一句话介绍你自己")`、（等几秒）`__probe.latestAnswer()`、`__probe.isComplete()`。
- [ ] **Step 3: 记录实测选择器与完成信号**到 `docs/CHATALL_NOTES.md`（新增"站点适配实测"小节）：Kimi 的输入框/发送/回答容器/停止按钮/登录标志选择器；若某项失败，记录页面真实结构以便修正。对通义重复一遍（Step 1 换 url）。
- [ ] **Step 4: 判定**：若四步都能跑通 → 可行，按实测选择器进入 Task 8。若不可行（如站点强校验/反自动化）→ 报告 BLOCKED，回到设计层面与用户重新选站点或方案。
- [ ] **Step 5: Commit**（探针脚本 + 实测笔记）。

## Phase 2 — AI 适配器（按 Task 7.5 实测选择器实现 Kimi 与 通义 两个适配器）

### Task 7: 适配器契约 `contract.js`

**Files:**
- Create: `src/debate/adapters/contract.js`
- Test: `tests/debate/contract.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import { assertAdapter } from "../../src/debate/adapters/contract.js";

const good = {
  id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com",
  isLoggedIn: () => true, newChat: () => {}, inject: () => {},
  latestAnswer: () => "", isComplete: () => true, abnormalState: () => null,
};

describe("assertAdapter", () => {
  it("passes for a complete adapter", () => { expect(() => assertAdapter(good)).not.toThrow(); });
  it("throws when a required hook is missing", () => {
    const { isComplete, ...bad } = good;
    expect(() => assertAdapter(bad)).toThrow(/isComplete/);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现**

```js
// src/debate/adapters/contract.js
/**
 * AIAdapter：封装单个 AI 网页版的 DOM 差异。
 * 钩子在 webview 页面上下文中执行（见 webviewParticipant）。
 * @typedef {Object} AIAdapter
 * @property {string} id
 * @property {string} label
 * @property {string} url
 * @property {() => boolean} isLoggedIn        读 DOM/HTML 判断登录态
 * @property {() => void|Promise<void>} newChat 新建对话并锁定其唯一标识
 * @property {(text:string) => void|Promise<void>} inject 填输入框并发送
 * @property {() => string} latestAnswer       读取最新一条回答的当前文本（可能未完成）
 * @property {() => boolean} isComplete        当前回答是否已结束（流式停止）
 * @property {() => (string|null)} abnormalState 返回异常原因或 null
 */
const REQUIRED = ["id","label","url","isLoggedIn","newChat","inject","latestAnswer","isComplete","abnormalState"];

export function assertAdapter(a) {
  for (const k of REQUIRED) {
    if (!(k in a)) throw new Error(`adapter missing required member: ${k}`);
  }
  return a;
}
```

- [ ] **Step 4: 运行确认通过** → 2 passed。

- [ ] **Step 5: Commit**

```bash
git add src/debate/adapters/contract.js tests/debate/contract.test.js
git commit -m "feat(debate): add AIAdapter contract + validator"
```

### Task 8: DeepSeek 适配器（DOM 脚本，含选择器发现）

> ⚠️ 本任务需要**对 chat.deepseek.com 实际页面做 DOM 探查**，选择器不能凭空写。下面给出探查步骤与适配器骨架；探查结果填入骨架的常量区。无单测（DOM 依赖真实页面），用 Task 11 的集成手测验证。

**Files:**
- Create: `src/debate/adapters/deepseek.js`

- [ ] **Step 1: DOM 探查（开 DevTools 在 chat.deepseek.com 上确认）**

逐条找到并记录到文件顶部注释：
1. **登录判定**：登录后才有的稳定元素（如输入框 `textarea`/contenteditable、用户头像）；未登录时的登录按钮/跳转。
2. **新建对话**：侧栏「新对话」按钮选择器；新对话后 URL 形如 `…/a/chat/s/<id>`（记录 URL 规律，用于"锁定对话"）。
3. **输入框**：`selector`，以及它是 `textarea` 还是 contenteditable（决定如何赋值）。
4. **发送**：回车是否发送（注意是否会换行），或发送按钮选择器。
5. **回答容器**：最新一条 assistant 消息的选择器；如何取纯文本（排除"复制/重写"按钮）。
6. **完成信号**：发送后"停止生成"按钮出现→消失；或发送按钮 disabled→enabled；或回答容器在 ~800ms 内文本不再变化。
7. **异常**：验证码弹窗、限流提示、内容拒答文案、被登出的特征。

- [ ] **Step 2: 写适配器（把探查到的选择器填进常量区）**

```js
// src/debate/adapters/deepseek.js
// 这些函数将被序列化注入 webview 页面上下文执行（见 webviewParticipant）。
// ⚠️ 选择器来自 Step 1 的实测，可能随站点改版变化——这是主要维护点。
const SEL = {
  loggedInMarker: "<填: 登录后才有的元素，如 textarea>",
  loginMarker:    "<填: 未登录时的登录按钮>",
  newChatBtn:     "<填: 新建对话按钮>",
  input:          "<填: 输入框>",
  sendBtn:        "<填: 发送按钮，若用回车则可空>",
  answer:         "<填: 最新 assistant 消息容器>",
  stopBtn:        "<填: 停止生成按钮（出现=生成中）>",
  captcha:        "<填: 验证码/风控弹窗>",
  rateLimit:      "<填: 限流提示>",
};

export const deepseekAdapter = {
  id: "deepseek",
  label: "DeepSeek",
  url: "https://chat.deepseek.com",

  isLoggedIn() { return !!document.querySelector(SEL.loggedInMarker); },

  async newChat() {
    const btn = document.querySelector(SEL.newChatBtn);
    if (btn) btn.click();
    // 等待进入新对话（URL 变为 /a/chat/s/<id>）；锁定标识 = location.href
    await new Promise((r) => setTimeout(r, 600));
    window.__debateConversationId = location.href;
  },

  async inject(text) {
    const el = document.querySelector(SEL.input);
    if (!el) throw new Error("input not found");
    // 受控输入：设值并派发 input 事件
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (set && el.tagName === "TEXTAREA") { set.call(el, text); el.dispatchEvent(new Event("input", { bubbles: true })); }
    else { el.focus(); document.execCommand("insertText", false, text); }
    await new Promise((r) => setTimeout(r, 50));
    const send = SEL.sendBtn && document.querySelector(SEL.sendBtn);
    if (send) send.click();
    else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  },

  latestAnswer() {
    const nodes = document.querySelectorAll(SEL.answer);
    const last = nodes[nodes.length - 1];
    return last ? last.innerText.trim() : "";
  },

  isComplete() {
    // 生成中：停止按钮存在 → 不完整
    return !document.querySelector(SEL.stopBtn);
  },

  abnormalState() {
    if (document.querySelector(SEL.captcha)) return "captcha";
    if (document.querySelector(SEL.rateLimit)) return "rate_limited";
    if (!this.isLoggedIn()) return "logged_out";
    return null;
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/debate/adapters/deepseek.js
git commit -m "feat(debate): add DeepSeek web-UI adapter (selectors from live DOM probe)"
```

---

## Phase 3 — webview 桥接（适配器 → Participant）

### Task 9: `webviewParticipant`（含完成检测轮询 + 流式回调）

> 把"一个 adapter + 一个 Electron `<webview>`"包装成引擎用的 `Participant`。通过 `webview.executeJavaScript(code)` 在页面上下文执行适配器钩子。完成检测用轮询：反复读 `latestAnswer()` 并经 `onChunk` 上报，直到 `isComplete()` 连续 N 次为真或超时；每轮先查 `abnormalState()`。

**Files:**
- Create: `src/debate/webviewParticipant.js`
- Test: `tests/debate/webviewParticipant.test.js`（用假 webview 测轮询/异常/锁定逻辑）

- [ ] **Step 1: 写失败测试（假 webview，仅验证编排逻辑，不碰真实 DOM）**

```js
import { describe, it, expect, vi } from "vitest";
import { makeWebviewParticipant } from "../../src/debate/webviewParticipant.js";
import { AbnormalStateError } from "../../src/debate/errors.js";

// 假 webview：executeJavaScript(tag) 按预设队列返回
function fakeWebview(script) {
  return { executeJavaScript: vi.fn(async (code) => script(code)) };
}

describe("makeWebviewParticipant", () => {
  it("polls latestAnswer until isComplete, streaming via onChunk, returns final", async () => {
    // 序列：abnormal=null; answer 'a' incomplete; 'ab' incomplete; 'abc' complete
    let step = 0;
    const wv = fakeWebview((code) => {
      if (code.includes("abnormalState")) return null;
      if (code.includes("latestAnswer")) return ["a", "ab", "abc", "abc"][Math.min(step, 3)];
      if (code.includes("isComplete")) { const done = step >= 2; step++; return done; }
      if (code.includes("inject")) return undefined;
      if (code.includes("newChat")) return undefined;
      return undefined;
    });
    const p = makeWebviewParticipant(wv, "deepseek", { pollMs: 1, stableTicks: 1 });
    const chunks = [];
    const final = await p.ask("hi", (c) => chunks.push(c));
    expect(final).toBe("abc");
    expect(chunks).toContain("a");
  });

  it("throws AbnormalStateError when abnormalState returns a reason", async () => {
    const wv = fakeWebview((code) => (code.includes("abnormalState") ? "logged_out" : undefined));
    const p = makeWebviewParticipant(wv, "deepseek", { pollMs: 1 });
    await expect(p.ask("hi")).rejects.toBeInstanceOf(AbnormalStateError);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现**

```js
// src/debate/webviewParticipant.js
import { AbnormalStateError, TurnTimeout } from "./errors.js";
import { deepseekAdapter } from "./adapters/deepseek.js";

const ADAPTERS = { deepseek: deepseekAdapter };

// 把适配器某个方法序列化成可在页面执行的代码串
function call(adapterId, method, arg) {
  const adapter = ADAPTERS[adapterId];
  const fn = adapter[method].toString();
  const argJson = arg === undefined ? "" : JSON.stringify(arg);
  // 以适配器对象为 this 执行（abnormalState 内部用了 this.isLoggedIn）
  return `(function(){ const __a = ${objToSource(adapter)}; return (${fn}).call(__a${argJson ? "," + argJson : ""}); })()`;
}

function objToSource(o) {
  const parts = Object.entries(o).map(([k, v]) =>
    typeof v === "function" ? `${k}:${v.toString()}` : `${k}:${JSON.stringify(v)}`
  );
  return `{${parts.join(",")}}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeWebviewParticipant(webview, adapterId, opts = {}) {
  const pollMs = opts.pollMs ?? 400;
  const stableTicks = opts.stableTicks ?? 2;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const exec = (method, arg) => webview.executeJavaScript(call(adapterId, method, arg));

  async function checkAbnormal() {
    const reason = await exec("abnormalState");
    if (reason) throw new AbnormalStateError(reason);
  }

  return {
    async newChat() { await checkAbnormal(); await exec("newChat"); },

    async ask(prompt, onChunk) {
      await checkAbnormal();
      await exec("inject", prompt);
      const start = Date.now();
      let completeStreak = 0;
      let lastText = "";
      while (true) {
        await sleep(pollMs);
        if (Date.now() - start > timeoutMs) throw new TurnTimeout();
        await checkAbnormal();
        const text = await exec("latestAnswer");
        if (text && text !== lastText) { lastText = text; if (onChunk) onChunk(text); }
        const done = await exec("isComplete");
        completeStreak = done ? completeStreak + 1 : 0;
        if (completeStreak >= stableTicks && lastText) return lastText;
      }
    },
  };
}
```

- [ ] **Step 4: 运行确认通过** → 2 passed。

- [ ] **Step 5: Commit**

```bash
git add src/debate/webviewParticipant.js tests/debate/webviewParticipant.test.js
git commit -m "feat(debate): webview participant with completion polling + streaming + abnormal checks"
```

---

## Phase 4 — 状态与 UI（两页流程）

### Task 10: 辩论 store

**Files:**
- Create/Modify: `src/store/debate.js`（按 Task 1 记录的 store 方案接入；下用与框架无关的字段描述）

- [ ] **Step 1: 定义状态字段与动作（按 ChatALL 的 store 框架实现）**

状态：
```
config: { topic:"", proId:"deepseek", conId:"deepseek", rounds:5, lang:"en" }
login: { [side]: 'checking'|'ok'|'no' }   // side: 'pro'|'con'
phase: 'setup' | 'confirming' | 'running' | 'paused' | 'done'
record: [ { round, stance, text } ]       // 边吐边显时最后一条 text 持续更新
currentPartial: { stance, text } | null
abnormal: { side, reason } | null
```
动作：`setConfig`、`setLogin(side,status)`、`startConfirm`、`confirmStart`、`appendChunk(stance,text)`、`commitTurn(turn)`、`pause(abnormal)`、`finish`、`reset`、并**持久化 config**（写 localStorage / electron-store，启动时回填；默认 DeepSeek×DeepSeek、5 回合）。

- [ ] **Step 2: 持久化的小单测**（若 store 逻辑可抽纯函数则单测；否则手测）

- [ ] **Step 3: Commit**

```bash
git add src/store/debate.js
git commit -m "feat(debate): debate store with persisted config + runtime state"
```

### Task 11: 页面一 `DebateSetup.vue`（含登录检测、门控、确认弹窗）

> 参照 `mockup/debate-ui.html` 页面一。两个 webview 加载所选 AI 的 url；轮询 `isLoggedIn()` 更新登录态；同厂商共用 session partition（登录一次），但开辩时各自 `newChat()`（Task 12 触发）。

**Files:**
- Create: `src/components/DebateSetup.vue`

- [ ] **Step 1: 实现控制条 + 胶囊（话题输入、正/反方选择、回合数、登录状态、开始按钮）**，样式参照原型。开始按钮 disabled 直到 `login.pro==='ok' && login.con==='ok'`。

- [ ] **Step 2: 实现登录区两个 `<webview>`**，`:src` 绑定所选 AI url。
  - 先确保主窗口 `webPreferences.webviewTag: true`（否则 `<webview>` 不可用）。
  - **partition**：同厂商两侧用**同一持久化 partition**（如 `persist:deepseek`）→ 登录一次两侧通用、且跨重启保留。
  - 定时（如每 1.5s）对每个 webview `executeJavaScript(isLoggedIn())` 更新 `login[side]`；未登录则 webview 自然停留在该站登录页，用户直接登录。

- [ ] **Step 3: 实现确认弹窗**：点开始 → 显示"正方/反方/回合数"确认 → 确认后 `phase='running'` 并跳页面二（参照原型 modal）。

- [ ] **Step 4: 手动验证**

Run: `npm run electron:serve`
Expected：①未登录时开始置灰、提示出现；②在 webview 内登录后，状态自动转绿、按钮点亮；③点开始弹确认；④确认后切到页面二。

- [ ] **Step 5: Commit**

```bash
git add src/components/DebateSetup.vue
git commit -m "feat(ui): setup page with login detection, gating, confirm dialog"
```

### Task 12: 页面二 `DebateRun.vue`（驱动引擎 + 边吐边显 + 锁定 + 复制）

**Files:**
- Create: `src/components/DebateRun.vue`

- [ ] **Step 1: 组装两个 `Participant`**：用页面一的两个 webview 引用 + `makeWebviewParticipant(webview, id)`（同厂商=两个独立 webview，各自 partition 仍共享登录、但开辩时各自 `newChat()` 锁定独立对话）。

- [ ] **Step 2: 调 `runDebate`**，hooks 写入 store：
  - `onTurnStart` → 设置 `currentPartial`
  - `onChunk` → `appendChunk`（**边吐边显**：左侧记录最后一条实时更新）
  - `onTurn` → `commitTurn`
  - `onAbnormal` → `pause`（显示重新登录提示）
  - `onComplete` → `finish`
  传入 `AbortController.signal`；"停止/重设"按钮触发 `abort()` 并回页面一。

- [ ] **Step 3: 渲染**：辩论记录（正方紫/反方蓝，参照原型）、下方两个 webview 缩小实况、顶部回合进度、**复制全文**按钮（把 `record` 拼成文本写入剪贴板）。

- [ ] **Step 4: 进行中锁定**：`phase==='running'` 时禁用步骤切回页面一；监听 webview `will-navigate`/`did-navigate` 阻止自行跳转（或检测到跳转即 `pause`）；窗口关闭前确认。

- [ ] **Step 5: 手动验证**

Expected：①输入话题→两个 DeepSeek 各开新对话→逐回合辩论；②左侧记录边吐边显；③进行中无法切回页面一；④点复制→剪贴板得到全文；⑤手动在某 webview 退出登录→检测到→暂停并提示。

- [ ] **Step 6: Commit**

```bash
git add src/components/DebateRun.vue
git commit -m "feat(ui): debate run page — engine drive, streaming mirror, lock, copy"
```

### Task 13: 接线两页 + 默认配置回填

**Files:**
- Modify: 应用入口/路由（按 Task 1 记录的 ChatALL 入口结构）

- [ ] **Step 1: 用 `phase` 控制显示 `DebateSetup` / `DebateRun`**（参照原型顶部步骤切换；进行中锁定步骤①）。
- [ ] **Step 2: 启动时回填持久化 config**（首次默认 DeepSeek×DeepSeek、5 回合）。
- [ ] **Step 3: 手动验证全链路**：冷启动→默认两 DeepSeek→登录→确认→辩论→复制→重设。
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ui): wire two-page flow + restore persisted config"
```

---

## Phase 5 — 打包与分发

### Task 14: 桌面安装包

**Files:**
- Modify: electron-builder 配置（`package.json` / `electron-builder.yml`，按 Task 1 记录）

- [ ] **Step 1: 改应用名/图标/标识为「AI 辩论台」**（替换 ChatALL 品牌）。
- [ ] **Step 2: 构建 Win + Mac 安装包**

```bash
npm run electron:build   # 脚本名以 package.json 为准
```
Expected：`dist_electron/`（或对应目录）产出安装包。

- [ ] **Step 3:（可后置）Mac 代码签名/公证**，避免"未知开发者"警告。
- [ ] **Step 4: Commit**

```bash
git commit -am "build: rebrand to AI 辩论台 and produce installers"
```

### Task 15: 域名下载/介绍页

**Files:**
- Create: `site/index.html`（静态下载页）

- [ ] **Step 1: 基于 `mockup/debate-ui.html` 的视觉做一个静态介绍/下载页**，含：产品说明、截图、Win/Mac 下载按钮（指向 GitHub Releases 链接）、"用各 AI 网页版免费账号、不调 API"的说明、登录与使用步骤。
- [ ] **Step 2: 发布安装包到 GitHub Releases，下载按钮指向之。**
- [ ] **Step 3: 部署 `site/` 到所购域名**（静态托管即可）。
- [ ] **Step 4: Commit**

```bash
git add site/index.html
git commit -m "docs(site): landing & download page for the domain"
```

---

### Task 16: macOS 端到端验收（硬性）

> 在当前这台 Mac 上跑通真实一场辩论，作为"能在 Mac 上运行"的验收。

- [ ] **Step 1: Mac 上启动应用**

```bash
nvm use 20 && npm run electron:serve
```
Expected: 应用在 Mac 上正常启动。

- [ ] **Step 2: 真实跑一场**：默认 DeepSeek×DeepSeek → 在 webview 内登录 DeepSeek → 状态转绿、开始点亮 → 输入话题"AI 会不会取代程序员" → 确认 → 观察两条独立对话逐回合辩论、左侧边吐边显 → 5 回合结束 → 点复制全文。

- [ ] **Step 3: 异常路径**：辩论中在某 webview 退出登录 → 应检测到并暂停提示；重新登录后可继续/重设。

- [ ] **Step 4: 构建并打开 Mac 安装包**

```bash
npm run electron:build
```
Expected: 产出 `.dmg`/`.app`；右键「打开」可在本机运行（未签名时绕过 Gatekeeper）。

- [ ] **Step 5: 记录验收结果**到 `docs/CHATALL_NOTES.md`（Node 版本、Electron 版本、遇到的坑与解法）。

- [ ] **Step 6: Commit**

```bash
git commit -am "test: macOS end-to-end acceptance"
```

## Self-Review（规划者已核对）

- **Spec 覆盖**：形态/fork ChatALL(Task1,14)、语言识别(3)、提示词(4)、辩论循环/回合/默认5(6)、超时重试+异常(6,9)、适配器六钩子含完成检测(7,8)、登录检测读HTML(8,11)、同厂商两条独立对话+锁定(8,12)、记住上次选择/默认DeepSeek×DeepSeek(10,13)、两页UI+确认+复制(11,12)、边吐边显(9,12)、进行中锁定(12)、域名下载页(15)、**Mac 上运行(Task1 Step2、§平台要求、Task16 端到端验收)**。均有对应任务。
- **占位符**：纯逻辑任务(3–7,9)均含完整测试与实现；DOM/UI 任务(8,11,12)因依赖真实页面/框架，明确标注"探查后填入"并给出契约与骨架——非偷懒，而是第三方站点自动化的客观约束。
- **类型一致**：`Participant.ask(prompt,onChunk)`、`AIAdapter` 九成员、`Stance.PRO/CON`、错误类 `DebateAborted/TurnTimeout/AbnormalStateError`、hooks 名（onTurnStart/onChunk/onTurn/onComplete/onAbnormal/onError）在 Task 6/7/9/12 间一致。
