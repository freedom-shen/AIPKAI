// 渲染层：把已测通过的辩论引擎 接到 两个真实 Kimi webview 上。
import { runDebate, Stance } from "../src/debate/orchestrator.js";

const $ = (id) => document.getElementById(id);
const logEl = $("log"), statusEl = $("status"), startBtn = $("start");
const wvPro = $("pro"), wvCon = $("con");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = (...a) => console.log("__DEMO__", ...a);

// —— Kimi 适配器（已 SPIKE 实测的选择器，详见 CHATALL_NOTES §9）——
const ANSWER = `(()=>{const it=document.querySelectorAll('.chat-content-item-assistant');const l=it[it.length-1];if(!l)return '';const m=l.querySelector('.markdown,.markdown-container');return ((m||l).innerText||'').trim();})()`;
const COUNT = `document.querySelectorAll('.chat-content-item-assistant').length`;
const STOP = `!!document.querySelector('.send-button-container.stop')`;
const LOGGEDIN = `!!document.querySelector('.chat-input-editor')`;
const NEWCHAT = `(()=>{const e=[...document.querySelectorAll('div,button,a,span')].find(x=>(x.textContent||'').trim()==='新建会话');if(e){e.click();return true}return false})()`;
const injectCode = (text) =>
  `(()=>{const el=document.querySelector('.chat-input-editor');if(!el)return false;el.focus();document.execCommand('insertText',false,${JSON.stringify(text)});setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),150);return true;})()`;

function makeParticipant(wv, label) {
  const exec = (code) => wv.executeJavaScript(code, true);
  return {
    async newChat() {
      D(label, "newChat");
      await exec(NEWCHAT).catch(() => {});
      await sleep(1500);
    },
    async ask(prompt, onChunk) {
      D(label, "ask len", prompt.length);
      const before = await exec(COUNT);
      await exec(injectCode(prompt));
      // 等新的 assistant 节点出现
      for (let i = 0; i < 24; i++) { await sleep(700); if ((await exec(COUNT)) > before) break; }
      // 轮询直到停止生成(无 .send-button-container.stop)且文本稳定
      let last = "", stable = 0;
      for (let i = 0; i < 90; i++) {
        await sleep(800);
        const gen = await exec(STOP);
        const a = await exec(ANSWER);
        if (a && a !== last) { last = a; stable = 0; if (onChunk) onChunk(a); }
        else if (a === last && a) { stable++; }
        if (!gen && last.length > 0 && stable >= 2) { D(label, "done len", last.length); return last; }
      }
      D(label, "timeout len", last.length);
      return last;
    },
  };
}

// —— 渲染辩论记录 ——
let curBubble = null;
function rt(text) { const d = document.createElement("div"); d.className = "rt"; d.textContent = text; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; }
function startBubble(stance) {
  const wrap = document.createElement("div"); wrap.className = "turn " + (stance === Stance.PRO ? "pro" : "con");
  const who = document.createElement("div"); who.className = "who"; who.textContent = stance === Stance.PRO ? "Kimi · 正方" : "Kimi · 反方";
  const b = document.createElement("div"); b.className = "b"; b.textContent = "…";
  const inner = document.createElement("div"); inner.appendChild(who); inner.appendChild(b);
  wrap.appendChild(inner); logEl.appendChild(wrap); logEl.scrollTop = logEl.scrollHeight; curBubble = b;
}
function updateBubble(text) { if (curBubble) { curBubble.textContent = text; logEl.scrollTop = logEl.scrollHeight; } }

// —— 等两个 webview 就绪并检测登录 ——
async function waitReady() {
  await Promise.all([
    new Promise((r) => wvPro.addEventListener("dom-ready", r, { once: true })),
    new Promise((r) => wvCon.addEventListener("dom-ready", r, { once: true })),
  ]);
  await sleep(1500);
  const p = await wvPro.executeJavaScript(LOGGEDIN).catch(() => false);
  const c = await wvCon.executeJavaScript(LOGGEDIN).catch(() => false);
  if (p && c) { startBtn.disabled = false; startBtn.textContent = "▶ 开始辩论"; statusEl.textContent = "两个 Kimi 已就绪"; }
  else { startBtn.textContent = "请在右侧两个 Kimi 中登录"; statusEl.textContent = `登录: 正方=${p} 反方=${c}`; setTimeout(waitReady, 3000); }
}
waitReady();

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true; statusEl.textContent = "辩论进行中…"; logEl.innerHTML = "";
  const topic = $("topic").value.trim();
  const rounds = parseInt($("rounds").value, 10) || 2;
  const pro = makeParticipant(wvPro, "PRO");
  const con = makeParticipant(wvCon, "CON");
  let lastStance = null;
  try {
    await runDebate(
      { topic, rounds, lang: "zh" },
      { pro, con },
      {
        onTurnStart: ({ round, stance }) => { if (stance === Stance.PRO) rt(`第 ${round} 回合`); startBubble(stance); lastStance = stance; },
        onChunk: ({ partial }) => updateBubble(partial),
        onTurn: ({ text }) => updateBubble(text),
        onComplete: () => { rt(`— 辩论结束 · 共 ${rounds} 回合 —`); statusEl.textContent = "完成"; startBtn.disabled = false; },
        onAbnormal: (e) => { const d = document.createElement("div"); d.className = "err"; d.textContent = "异常暂停：" + e.reason; logEl.appendChild(d); startBtn.disabled = false; },
        onError: (e) => { const d = document.createElement("div"); d.className = "err"; d.textContent = "出错：" + e.message; logEl.appendChild(d); startBtn.disabled = false; },
      },
      { turnTimeoutMs: 200000 }
    );
  } catch (e) { D("runDebate threw", e.message); statusEl.textContent = "出错"; startBtn.disabled = false; }
});
