// 可行性探针（SPIKE, Task 7.5）：验证能否在 Electron 里 DOM 驱动真实 AI 网页。
// 独立运行，不依赖 ChatALL 构建。
//
// 用法（Mac，注意 nvm 修复）：
//   N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; unfunction node npm npx 2>/dev/null
//   npx electron spike/probe-main.js                      # 默认 Kimi
//   npx electron spike/probe-main.js https://www.tongyi.com   # 测通义
//
// 窗口弹出后：先登录你自己的账号；再打开的 DevTools 控制台里依次执行：
//   __probe.dump()                      // 打印候选 输入框/按钮，帮我们找选择器
//   __probe.isLoggedIn()
//   __probe.inject("用一句话介绍你自己")
//   __probe.latestAnswer()              // 等几秒再多读几次
//   __probe.isComplete()
// 把控制台输出贴回来，我据此写正式适配器选择器。

const { app, BrowserWindow } = require("electron");

const url = process.argv[2] || "https://www.kimi.com";

// 注入到页面上下文的探针 helper（字符串形式，便于 executeJavaScript）。
const PROBE = `
window.__probe = {
  // 打印候选元素，用于发现选择器
  dump() {
    const ta = [...document.querySelectorAll('textarea')]
      .map((e,i)=>({i, placeholder:e.placeholder||'', cls:e.className, id:e.id}));
    const ce = [...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')]
      .map((e,i)=>({i, cls:e.className, role:e.getAttribute('role')||''}));
    const btn = [...document.querySelectorAll('button,[role=button]')]
      .map((e,i)=>({i, txt:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,24), cls:(e.className||'').toString().slice(0,40)}))
      .filter(b=>b.txt);
    console.log('%c=== textareas ===','color:#0a84ff', ta);
    console.log('%c=== contenteditables ===','color:#0a84ff', ce);
    console.log('%c=== buttons ===','color:#0a84ff', btn);
    return { textareas: ta.length, contenteditables: ce.length, buttons: btn.length };
  },
  _input() {
    return document.querySelector('textarea')
        || document.querySelector('[contenteditable="true"]')
        || document.querySelector('[contenteditable=""]');
  },
  isLoggedIn() {
    const ok = !!this._input();
    console.log('isLoggedIn ->', ok, ok ? '(found input box)' : '(no input — maybe login wall; run __probe.dump())');
    return ok;
  },
  inject(text) {
    const el = this._input();
    if (!el) { console.warn('inject: no input found; run __probe.dump()'); return false; }
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, text);
    }
    setTimeout(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }, 150);
    console.log('inject: typed + pressed Enter. 若没发出，试试点页面里的发送按钮，并把 dump() 里的发送按钮选择器告诉我。');
    return true;
  },
  // 启发式：抓页面里最长的文本块作为"最新回答"候选（用于发现回答容器选择器）
  latestAnswer() {
    const cand = [...document.querySelectorAll('div,article,section,p')]
      .map(e => ({ e, len: (e.innerText||'').trim().length }))
      .filter(x => x.len > 20 && x.e.querySelectorAll('textarea,button').length === 0)
      .sort((a,b)=>b.len-a.len);
    const top = cand[0];
    if (!top) { console.warn('latestAnswer: nothing found'); return ''; }
    console.log('latestAnswer (heuristic, class=' + top.e.className + '):');
    console.log(top.e.innerText.trim().slice(0, 400));
    return top.e.innerText.trim();
  },
  // 启发式：有"停止/stop"按钮 => 生成中（未完成）
  isComplete() {
    const stop = [...document.querySelectorAll('button,[role=button]')]
      .find(b => /停止|停|stop/i.test((b.innerText||b.getAttribute('aria-label')||'')));
    const done = !stop;
    console.log('isComplete ->', done, stop ? '(stop button present = generating)' : '(no stop button)');
    return done;
  }
};
console.log('%c[__probe] ready. 试: __probe.dump() / isLoggedIn() / inject("...") / latestAnswer() / isComplete()','color:#28c840;font-weight:bold');
`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    webPreferences: {
      // 默认即可：探针在页面自身上下文执行，能访问其 DOM
      partition: "persist:probe", // 持久化登录，重开不用再登
    },
  });
  win.webContents.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  win.loadURL(url);
  win.webContents.openDevTools({ mode: "right" });
  // 页面加载/SPA 跳转后都重新注入探针
  const inject = () => win.webContents.executeJavaScript(PROBE).catch(() => {});
  win.webContents.on("dom-ready", inject);
  win.webContents.on("did-finish-load", inject);
  win.webContents.on("did-navigate-in-page", inject);
  console.log("probe loading:", url);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => app.quit());
