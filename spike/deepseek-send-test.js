// 诊断 DeepSeek 发送：你登录后回我"好了"，我 touch spike/ds-go.txt。
// 脚本：填值→确认值→回车→看是否产生回答→若无则 dump 按钮(带位置)并尝试点发送→再看回答。
//   npx electron spike/deepseek-send-test.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "deepseek-probe.log");
const GO = path.join(__dirname, "ds-go.txt");
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch {} console.log(l); };
try { fs.writeFileSync(LOG, "=== deepseek-send-test ===\n"); } catch {}
try { if (fs.existsSync(GO)) fs.unlinkSync(GO); } catch {}

const Q = "测试发送：请用一句话说你好。";
const setVal = `(()=>{const el=document.querySelector('textarea');if(!el)return 'no-textarea';el.focus();const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(Q)});el.dispatchEvent(new Event('input',{bubbles:true}));return 'value='+el.value.slice(0,20);})()`;
const enter = `(()=>{const el=document.querySelector('textarea');['keydown','keypress','keyup'].forEach(t=>el.dispatchEvent(new KeyboardEvent(t,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})));return 'enter-sent';})()`;
const COUNT = `document.querySelectorAll('.ds-assistant-message-main-content').length`;
const ANSWER = `(()=>{const ms=document.querySelectorAll('.ds-assistant-message-main-content');const l=ms[ms.length-1];return l?(l.innerText||'').trim().slice(0,80):'';})()`;
// dump 输入区附近按钮（带位置，找右下角发送）
const BTNS = `JSON.stringify([...document.querySelectorAll('button,[role=button]')].map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),disabled:e.disabled||e.getAttribute('aria-disabled')==='true',cls:(e.className||'').toString().slice(0,45)}}).filter(b=>b.w>0).sort((a,b)=>b.y-a.y).slice(0,10))`;
// 点击"最靠右下、未禁用"的按钮(发送候选)
const clickSend = `(()=>{const bs=[...document.querySelectorAll('button,[role=button]')].map(e=>({e,r:e.getBoundingClientRect(),dis:e.disabled})).filter(o=>o.r.width>0&&!o.dis);bs.sort((a,b)=>(b.r.y-a.r.y)||(b.r.x-a.r.x));const t=bs[0];if(t){t.e.click();return 'clicked cls='+(t.e.className||'').toString().slice(0,40)}return 'none'})()`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 840, webPreferences: { partition: "persist:dsprobe" } });
  win.webContents.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  win.loadURL("https://chat.deepseek.com/");
  win.webContents.openDevTools({ mode: "right" });
  const exec = (c) => win.webContents.executeJavaScript(c);
  log("窗口已开。登录后回我'好了'。");
  let busy = false;
  setInterval(async () => {
    if (busy || !fs.existsSync(GO)) return; busy = true; try { fs.unlinkSync(GO); } catch {}
    const before = await exec(COUNT).catch(() => "?");
    log("setVal:", await exec(setVal).catch(e => "ERR " + e.message), "| before answers:", before);
    log("enter:", await exec(enter).catch(e => "ERR " + e.message));
    await sleep(5000);
    let after = await exec(COUNT).catch(() => "?");
    log("回车后 answers:", after, "| ANSWER:", await exec(ANSWER).catch(() => ""));
    if (after === before || after === 0) {
      log("回车没发出。BTNS(右下优先):", await exec(BTNS).catch(e => "ERR " + e.message));
      log("尝试点发送:", await exec(clickSend).catch(e => "ERR " + e.message));
      await sleep(5000);
      log("点击后 answers:", await exec(COUNT).catch(() => "?"), "| ANSWER:", await exec(ANSWER).catch(() => ""));
    }
    // 完整结构：候选答案/思考容器（找快速模式答案类名）
    const TREE = `(()=>{const re=/markdown|message|ds-|content|think|reason/i;const els=[...document.querySelectorAll('div,article,section')].filter(e=>re.test((e.className||'').toString()));const list=els.map(e=>({cls:(e.className||'').toString().slice(0,55),len:(e.innerText||'').trim().length,head:(e.innerText||'').trim().slice(0,30)})).filter(x=>x.len>0);return JSON.stringify(list.slice(-22));})()`;
    log("TREE:", await exec(TREE).catch(e => "ERR " + e.message));
    log("=== end ===");
    busy = false;
  }, 1500);
});
app.on("window-all-closed", () => app.quit());
