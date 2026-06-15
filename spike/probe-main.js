// 可行性探针（SPIKE, Task 7.5）：验证能否在 Electron 里 DOM 驱动真实 AI 网页。
// 独立运行，不依赖 ChatALL 构建。所有事件/页面console/错误都写入 spike/probe.log。
//
// 用法（Mac，注意 nvm 修复）：
//   N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; unfunction node npm npx 2>/dev/null
//   npx electron spike/probe-main.js                          # 默认 Kimi
//   npx electron spike/probe-main.js https://www.tongyi.com   # 测通义
//
// 窗口弹出后：先登录账号；然后在 DevTools 控制台执行一键测试：
//   __probe.report()                 // 自动 dump→isLoggedIn→inject→轮询读取→判完成，结果同时写入 spike/probe.log
// 或手动：__probe.dump() / isLoggedIn() / inject("...") / latestAnswer() / isComplete()

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const url = process.argv[2] || "https://www.kimi.com";
const LOG = path.join(__dirname, "probe.log");

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  try { fs.appendFileSync(LOG, line + "\n"); } catch (e) {}
  console.log(line);
}

// 启动时清空日志并写头
try {
  fs.writeFileSync(LOG, `=== PROBE LOG === url=${url} started=${new Date().toISOString()}\n`);
} catch (e) {}

// 注入到页面上下文的探针 helper。
const PROBE = `
(function(){
  const P = {
    _input() {
      return document.querySelector('textarea')
          || document.querySelector('[contenteditable="true"]')
          || document.querySelector('[contenteditable=""]');
    },
    _stopBtn() {
      return [...document.querySelectorAll('button,[role=button]')]
        .find(b => /停止|停|stop/i.test((b.innerText||b.getAttribute('aria-label')||'')));
    },
    _answer() {
      const cand = [...document.querySelectorAll('div,article,section,p')]
        .map(e => ({ e, len: (e.innerText||'').trim().length }))
        .filter(x => x.len > 20 && x.e.querySelectorAll('textarea,button,input').length === 0)
        .sort((a,b)=>b.len-a.len);
      return cand[0] ? cand[0].e.innerText.trim() : '';
    },
    dump() {
      const ta = [...document.querySelectorAll('textarea')].map((e,i)=>({i, placeholder:e.placeholder||'', cls:(e.className||'').toString().slice(0,40), id:e.id}));
      const ce = [...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].map((e,i)=>({i, cls:(e.className||'').toString().slice(0,40), role:e.getAttribute('role')||''}));
      const btn = [...document.querySelectorAll('button,[role=button]')].map((e,i)=>({i, txt:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,24), cls:(e.className||'').toString().slice(0,40)})).filter(b=>b.txt);
      console.log('__PROBE__ dump textareas=' + JSON.stringify(ta));
      console.log('__PROBE__ dump contenteditables=' + JSON.stringify(ce));
      console.log('__PROBE__ dump buttons=' + JSON.stringify(btn));
      return { textareas: ta.length, contenteditables: ce.length, buttons: btn.length };
    },
    isLoggedIn() {
      const ok = !!this._input();
      console.log('__PROBE__ isLoggedIn=' + ok + (ok?' (found input)':' (no input — maybe login wall)'));
      return ok;
    },
    inject(text) {
      const el = this._input();
      if (!el) { console.log('__PROBE__ inject FAIL no-input'); return false; }
      el.focus();
      try {
        if (el.tagName === 'TEXTAREA') {
          const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true }));
        } else { document.execCommand('insertText', false, text); }
        setTimeout(() => {
          el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
        }, 150);
        console.log('__PROBE__ inject OK tag=' + el.tagName + ' (typed + Enter)');
        return true;
      } catch (e) { console.log('__PROBE__ inject ERROR ' + e.message); return false; }
    },
    latestAnswer() { const a = this._answer(); console.log('__PROBE__ latestAnswer len=' + a.length + ' head=' + JSON.stringify(a.slice(0,80))); return a; },
    isComplete() { const c = !this._stopBtn(); console.log('__PROBE__ isComplete=' + c); return c; },
    // 富 DOM 探查（不注入），用于发现"回答容器/发送/停止"真实选择器
    inspect() {
      const btns = [...document.querySelectorAll('button,[role=button],[class*=send],[class*=stop]')].map((e,i)=>({
        i, txt:(e.innerText||'').trim().slice(0,16), aria:e.getAttribute('aria-label')||'',
        title:e.getAttribute('title')||'', svg:!!e.querySelector('svg'), cls:(e.className||'').toString().slice(0,50)
      }));
      console.log('__PROBE__ inspect buttons=' + JSON.stringify(btns));
      const re = /message|answer|markdown|segment|response|bubble|reply|chat-content|md-|assistant|paragraph/i;
      const msgs = [...document.querySelectorAll('div,article,section')]
        .filter(e => re.test((e.className||'').toString()))
        .map(e => ({ cls:(e.className||'').toString().slice(0,60), len:(e.innerText||'').trim().length, head:(e.innerText||'').trim().slice(0,50) }))
        .filter(x => x.len > 0).slice(0, 40);
      console.log('__PROBE__ inspect msgEls=' + JSON.stringify(msgs));
      return { buttons: btns.length, msgEls: msgs.length };
    },
    async report(q) {
      q = q || '用一句话介绍你自己';
      console.log('__PROBE__ REPORT start url=' + location.href);
      this.dump();
      if (!this.isLoggedIn()) { console.log('__PROBE__ REPORT NOT_LOGGED_IN 请先登录再运行 __probe.report()'); return; }
      console.log('__PROBE__ REPORT inject q=' + JSON.stringify(q));
      this.inject(q);
      let lastLen = 0;
      for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const a = this._answer(); const c = !this._stopBtn();
        console.log('__PROBE__ tick' + i + ' len=' + a.length + ' complete=' + c + ' head=' + JSON.stringify(a.slice(0,60)));
        if (c && a.length > 20 && a.length === lastLen && i > 2) {
          console.log('__PROBE__ REPORT DONE finalLen=' + a.length);
          console.log('__PROBE__ FINAL ' + a.slice(0, 600));
          return;
        }
        lastLen = a.length;
      }
      console.log('__PROBE__ REPORT TIMEOUT lastLen=' + lastLen);
    }
  };
  window.__probe = P;
  console.log('__PROBE__ ready 执行 __probe.report() 一键测试');
})();
`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    webPreferences: { partition: "persist:probe" }, // 持久化登录
  });
  win.webContents.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  );
  // 允许登录弹窗在同会话内打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    log(`[event] window.open -> ${url}`);
    return { action: "allow" };
  });
  // Cmd+R 重新加载（白屏时手动刷新）
  win.webContents.on("before-input-event", (e, input) => {
    if (input.meta && input.key.toLowerCase() === "r") { log("[event] Cmd+R reload"); win.webContents.reload(); }
  });

  // —— 日志：页面 console 全量落盘 ——
  win.webContents.on("console-message", (event, level, message, line, sourceId) => {
    // 兼容不同 Electron 签名
    let msg = message, lvl = level;
    if (event && typeof event === "object" && event.message !== undefined) { msg = event.message; lvl = event.level; }
    log(`[page] ${msg}`);
  });
  // —— 日志：导航/加载/崩溃/错误 ——
  win.webContents.on("did-finish-load", () => log(`[event] did-finish-load ${win.webContents.getURL()}`));
  win.webContents.on("did-navigate", (e, u) => log(`[event] did-navigate ${u}`));
  win.webContents.on("did-navigate-in-page", (e, u) => log(`[event] did-navigate-in-page ${u}`));
  win.webContents.on("did-fail-load", (e, code, desc, u) => log(`[error] did-fail-load ${code} ${desc} ${u}`));
  win.webContents.on("render-process-gone", (e, d) => log(`[error] render-process-gone ${JSON.stringify(d)}`));
  win.webContents.on("unresponsive", () => log(`[error] unresponsive`));
  win.webContents.on("preload-error", (e, f, err) => log(`[error] preload-error ${err}`));

  win.loadURL(url).catch((e) => log(`[error] loadURL ${e.message}`));
  win.webContents.openDevTools({ mode: "right" });

  const inject = () => win.webContents.executeJavaScript(PROBE).then(() => log("[event] probe injected")).catch((e) => log(`[error] inject-probe ${e.message}`));
  win.webContents.on("dom-ready", inject);
  win.webContents.on("did-finish-load", inject);
  win.webContents.on("did-navigate-in-page", inject);

  // 触发文件机制：外部 `touch spike/trigger.txt` 即自动运行 __probe.report()
  const TRIGGER = path.join(__dirname, "trigger.txt");
  try { if (fs.existsSync(TRIGGER)) fs.unlinkSync(TRIGGER); } catch (e) {}
  const INSPECT = path.join(__dirname, "inspect.txt");
  try { if (fs.existsSync(INSPECT)) fs.unlinkSync(INSPECT); } catch (e) {}
  setInterval(() => {
    if (fs.existsSync(TRIGGER)) {
      try { fs.unlinkSync(TRIGGER); } catch (e) {}
      log("[event] trigger detected -> running __probe.report()");
      win.webContents.executeJavaScript("window.__probe && window.__probe.report()").catch((e) => log(`[error] report ${e.message}`));
    }
    if (fs.existsSync(INSPECT)) {
      try { fs.unlinkSync(INSPECT); } catch (e) {}
      log("[event] inspect trigger -> running __probe.inspect()");
      win.webContents.executeJavaScript("window.__probe && window.__probe.inspect()").catch((e) => log(`[error] inspect ${e.message}`));
    }
  }, 2000);

  log(`[event] window created, loading ${url}`);
}

process.on("uncaughtException", (e) => log(`[error] uncaughtException ${e.stack || e.message}`));

app.whenReady().then(() => {
  log("[event] app ready");
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { log("[event] window-all-closed, quitting"); app.quit(); });
