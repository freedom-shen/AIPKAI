// 用全新(未登录)分区加载豆包，自动抓"未登录"时的标志，确定可靠的登录信号。
//   npx electron spike/doubao-login-check.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const LOG = path.join(__dirname, "doubao-probe.log");
const log = (...a) => { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch {} console.log(l); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 760, show: false, webPreferences: { partition: "persist:dbtest_" + Date.now() } });
  win.webContents.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
  await win.loadURL("https://www.doubao.com/chat/").catch(() => {});
  await sleep(7000);
  const exec = (c) => win.webContents.executeJavaScript(c);
  log("LOGIN-CHECK(未登录态):");
  log("  hasTextarea:", await exec(`!!document.querySelector('textarea')`).catch(e => "ERR"));
  log("  loginBtns:", await exec(`JSON.stringify([...document.querySelectorAll('button,[role=button],a,span,div')].map(e=>(e.innerText||'').trim()).filter(t=>t&&t.length<=8&&/登录|登陆|注册/.test(t)).slice(0,10))`).catch(e => "ERR " + e.message));
  log("  bodyHead:", await exec(`(document.body.innerText||'').trim().slice(0,120)`).catch(e => "ERR"));
  log("=== check end ===");
  app.quit();
});
