// 受控测试 v3：你重新开启"深度思考"后说一声，我 touch spike/think-go.txt，
// 脚本自动注入问题 → 等思考+答案出来 → dump 结构 + 我的 ANSWER 结果。
// 日志: spike/think-test.log
//   npx electron spike/think-test.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "think-test.log");
const GO = path.join(__dirname, "think-go.txt");
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch {} console.log(l); };
try { fs.writeFileSync(LOG, "=== think-test v3 ===\n"); } catch {}
try { if (fs.existsSync(GO)) fs.unlinkSync(GO); } catch {}

const Q = "30岁的男人年入20万可耻吗？请有力论证你的观点，约200字。";
const STOP = `!!document.querySelector('.send-button-container.stop')`;
const inject = `(()=>{const el=document.querySelector('.chat-input-editor');if(!el)return 'no-input';el.focus();document.execCommand('insertText',false,${JSON.stringify(Q)});setTimeout(()=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})),200);return 'injected'})()`;
const ANSWER = `(()=>{const it=document.querySelectorAll('.chat-content-item-assistant');const l=it[it.length-1];if(!l)return '';let mds=[...l.querySelectorAll('.markdown,.markdown-container')].filter(m=>!m.closest('[class*=think i],[class*=thought i],[class*=reason i],[class*=cot i],details'));if(!mds.length)mds=[...l.querySelectorAll('.markdown,.markdown-container')];const t=mds[mds.length-1]||l;return ((t.innerText)||'').trim();})()`;
const DUMP = `(()=>{const it=document.querySelectorAll('.chat-content-item-assistant');const l=it[it.length-1];if(!l)return '(none)';const tree=(el,d)=>d>5?[]:[...el.children].flatMap(c=>[' '.repeat(d*2)+c.tagName.toLowerCase()+'.'+(c.className||'').toString().replace(/\\s+/g,'.').slice(0,55)+(c.children.length?'':' = "'+(c.innerText||'').trim().slice(0,40)+'"'),...tree(c,d+1)]);return tree(l,0).join('\\n').slice(0,3000);})()`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 820, webPreferences: { partition: "persist:probe" } });
  win.webContents.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));
  win.loadURL("https://www.kimi.com");
  win.webContents.openDevTools({ mode: "right" });
  const exec = (c) => win.webContents.executeJavaScript(c);
  log("窗口已开。请①重新打开'深度思考' ②回我'好了'，我自动发问并抓结构。");

  let busy = false;
  setInterval(async () => {
    if (busy || !fs.existsSync(GO)) return;
    busy = true;
    try { fs.unlinkSync(GO); } catch {}
    log("inject:", await exec(inject).catch(e => "ERR " + e.message));
    let started = false;
    for (let i = 0; i < 16; i++) { await sleep(500); if (await exec(STOP).catch(() => false)) { started = true; break; } }
    log("生成开始:", started);
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const stop = await exec(STOP).catch(() => "?");
      if (started && stop === false) break;
    }
    await sleep(800);
    log("=== DUMP 结构 ===\n" + await exec(DUMP).catch(e => "ERR " + e.message));
    log("=== 我的 ANSWER 结果 ===\n" + await exec(ANSWER).catch(e => "ERR " + e.message));
    log("=== end ===");
  }, 1500);
});
app.on("window-all-closed", () => app.quit());
