// 豆包 DOM 探测：登录后回我"好了"，我 touch spike/db-go.txt →
// 普查输入框/按钮 → 通用注入问题 → 等回答 → dump 会话结构(找回答容器/思考块/完成信号)。
// 日志: spike/doubao-probe.log
//   npx electron spike/doubao-probe.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "doubao-probe.log");
const GO = path.join(__dirname, "db-go.txt");
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch {} console.log(l); };
try { fs.writeFileSync(LOG, "=== doubao-probe ===\n"); } catch {}
try { if (fs.existsSync(GO)) fs.unlinkSync(GO); } catch {}

const Q = "30岁的男人年入20万可耻吗？请有力论证你的观点，约200字。";
const INPUTS = `JSON.stringify([...document.querySelectorAll('textarea,[contenteditable="true"]')].map(e=>({tag:e.tagName,ce:e.getAttribute('contenteditable'),ph:e.getAttribute('placeholder')||e.getAttribute('data-placeholder')||'',id:e.id,cls:(e.className||'').toString().slice(0,45)})))`;
const BUTTONS = `JSON.stringify([...document.querySelectorAll('button,[role=button]')].map(e=>{const r=e.getBoundingClientRect();return {txt:(e.innerText||'').trim().slice(0,10),aria:e.getAttribute('aria-label')||'',x:Math.round(r.x),y:Math.round(r.y),cls:(e.className||'').toString().slice(0,40)}}).filter(b=>b.txt||b.aria).slice(0,25))`;
// 通用注入：textarea 用 setter+input；contenteditable 用 execCommand；再回车
const inject = `(()=>{const el=document.querySelector('textarea')||document.querySelector('[contenteditable="true"]');if(!el)return 'no-input';el.focus();if(el.tagName==='TEXTAREA'){const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(el,${JSON.stringify(Q)});el.dispatchEvent(new Event('input',{bubbles:true}));}else{document.execCommand('insertText',false,${JSON.stringify(Q)});}setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),250);return 'injected tag='+el.tagName;})()`;
const clickSend = `(()=>{const bs=[...document.querySelectorAll('button,[role=button]')].map(e=>({e,r:e.getBoundingClientRect(),dis:e.disabled})).filter(o=>o.r.width>0&&!o.dis);bs.sort((a,b)=>(b.r.y-a.r.y)||(b.r.x-a.r.x));const t=bs[0];if(t){t.e.click();return 'clicked cls='+(t.e.className||'').toString().slice(0,40)}return 'none'})()`;
const TREE = `(()=>{const re=/markdown|message|msg|content|answer|reply|bubble|think|reason|chat/i;const els=[...document.querySelectorAll('div,article,section,p')].filter(e=>re.test((e.className||'').toString()));const list=els.map(e=>({cls:(e.className||'').toString().slice(0,55),len:(e.innerText||'').trim().length,head:(e.innerText||'').trim().slice(0,32)})).filter(x=>x.len>0);return JSON.stringify(list.slice(-26));})()`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 840, webPreferences: { partition: "persist:dbprobe" } });
  win.webContents.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  win.loadURL("https://www.doubao.com/chat/");
  win.webContents.openDevTools({ mode: "right" });
  const exec = (c) => win.webContents.executeJavaScript(c);
  log("窗口已开。登录豆包后回我'好了'。");
  let busy = false;
  setInterval(async () => {
    if (busy || !fs.existsSync(GO)) return; busy = true; try { fs.unlinkSync(GO); } catch {}
    log("INPUTS:", await exec(INPUTS).catch(e => "ERR " + e.message));
    log("BUTTONS:", await exec(BUTTONS).catch(e => "ERR " + e.message));
    log("inject:", await exec(inject).catch(e => "ERR " + e.message));
    await sleep(13000);
    const TESTIDS = `JSON.stringify([...document.querySelectorAll('[data-testid]')].map(e=>({t:e.getAttribute('data-testid'),len:(e.innerText||'').trim().length,head:(e.innerText||'').trim().slice(0,28)})).filter(x=>x.len>3).slice(-16))`;
    const ANSTEST = `(()=>{const tb=[...document.querySelectorAll('[class*=thinking-box-root]')].pop();const md=[...document.querySelectorAll('[class*=markdown],[class*=message-content],[class*=msg-content]')].pop();let out={hasThinkBox:!!tb};if(tb){let msg=tb;for(let i=0;i<7&&msg.parentElement;i++){msg=msg.parentElement;if(/message/i.test(msg.className||''))break;}const full=(msg.innerText||'').trim();const think=(tb.innerText||'').trim();out.thinkHead=think.slice(0,36);out.ansByMinus=full.replace(think,'').trim().slice(0,70);out.nextSib=(tb.nextElementSibling&&(tb.nextElementSibling.innerText||'').trim().slice(0,60))||'(none)';}if(md){out.mdCls=(md.className||'').toString().slice(0,50);out.mdHead=(md.innerText||'').trim().slice(0,60);}return JSON.stringify(out);})()`;
    const MSGS = `JSON.stringify([...document.querySelectorAll('[class*=message]')].filter(e=>!/message-list/i.test(e.className||'')&&(e.innerText||'').trim().length>2).slice(-7).map(e=>({cls:(e.className||'').toString().slice(0,50),think:!!e.querySelector('[class*=thinking-box-root]'),head:(e.innerText||'').trim().slice(0,22)})))`;
    log("TESTIDS:", await exec(TESTIDS).catch(e => "ERR " + e.message));
    log("ANSTEST:", await exec(ANSTEST).catch(e => "ERR " + e.message));
    log("MSGS:", await exec(MSGS).catch(e => "ERR " + e.message));
    log("=== end ===");
    busy = false;
  }, 1500);
});
app.on("window-all-closed", () => app.quit());
