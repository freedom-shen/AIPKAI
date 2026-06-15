// DeepSeek DOM 探测：你登录 chat.deepseek.com、开启"深度思考"、回我"好了"，
// 我 touch spike/ds-go.txt → 脚本 dump 输入框/按钮 → 自动注入问题 → 等答案 →
// dump 会话结构(找回答容器 + 思考块)。日志: spike/deepseek-probe.log
//   npx electron spike/deepseek-probe.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "deepseek-probe.log");
const GO = path.join(__dirname, "ds-go.txt");
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch {} console.log(l); };
try { fs.writeFileSync(LOG, "=== deepseek-probe ===\n"); } catch {}
try { if (fs.existsSync(GO)) fs.unlinkSync(GO); } catch {}

const Q = "30岁的男人年入20万可耻吗？请有力论证你的观点，约200字。";

// 输入框 / 按钮 普查
const INPUTS = `JSON.stringify([...document.querySelectorAll('textarea,[contenteditable="true"]')].map(e=>({tag:e.tagName,ph:e.placeholder||'',id:e.id,cls:(e.className||'').toString().slice(0,40)})))`;
const BUTTONS = `JSON.stringify([...document.querySelectorAll('button,[role=button]')].map(e=>({txt:(e.innerText||'').trim().slice(0,12),aria:e.getAttribute('aria-label')||'',svg:!!e.querySelector('svg'),cls:(e.className||'').toString().slice(0,40)})).filter(b=>b.txt||b.aria||b.svg).slice(0,30))`;
// 通用注入：优先 textarea，否则 contenteditable；setter+input 事件 + 回车
const inject = `(()=>{const el=document.querySelector('textarea')||document.querySelector('[contenteditable="true"]');if(!el)return 'no-input';el.focus();if(el.tagName==='TEXTAREA'){const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(Q)});el.dispatchEvent(new Event('input',{bubbles:true}));}else{document.execCommand('insertText',false,${JSON.stringify(Q)});}setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),250);return 'injected tag='+el.tagName;})()`;
// 会话结构：候选 消息/思考 容器
const TREE = `(()=>{
  const re=/markdown|message|ds-|content|assistant|chat|bubble/i;
  const els=[...document.querySelectorAll('div,article,section')].filter(e=>re.test((e.className||'').toString()));
  const list=els.map(e=>({cls:(e.className||'').toString().slice(0,55),len:(e.innerText||'').trim().length,head:(e.innerText||'').trim().slice(0,36)})).filter(x=>x.len>0);
  // 思考块候选
  const think=[...document.querySelectorAll('div,details,section')].filter(e=>/think|reason|chain|cot|深度思考|思考/i.test(((e.className||'')+' '+(e.innerText||'').slice(0,20)))).map(e=>({cls:(e.className||'').toString().slice(0,50),head:(e.innerText||'').trim().slice(0,40)}));
  return JSON.stringify({blocks:list.slice(-25),think:think.slice(0,8)});
})()`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 840, webPreferences: { partition: "persist:dsprobe" } });
  win.webContents.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  win.loadURL("https://chat.deepseek.com/");
  win.webContents.openDevTools({ mode: "right" });
  const exec = (c) => win.webContents.executeJavaScript(c);
  log("窗口已开。请①登录 DeepSeek ②开启'深度思考' ③回我'好了'。");

  let busy = false;
  setInterval(async () => {
    if (busy || !fs.existsSync(GO)) return;
    busy = true; try { fs.unlinkSync(GO); } catch {}
    log("INPUTS:", await exec(INPUTS).catch(e => "ERR " + e.message));
    log("BUTTONS:", await exec(BUTTONS).catch(e => "ERR " + e.message));
    log("inject:", await exec(inject).catch(e => "ERR " + e.message));
    await sleep(4000);
    for (let i = 0; i < 12; i++) { await sleep(3000); log("tick" + i + " TREE:", await exec(TREE).catch(e => "ERR " + e.message)); }
    log("=== end ===");
    busy = false;
  }, 1500);
});
app.on("window-all-closed", () => app.quit());
