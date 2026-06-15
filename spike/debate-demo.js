// A: 两个 Kimi 真实辩论 端到端 demo（独立 Electron，验证整体可行）。
// 复用 persist:probe 分区 => 沿用探针里已登录的 Kimi 账号（先关掉 probe 再跑本 demo）。
//
//   N="$HOME/.nvm/versions/node/v20.19.0/bin"; export PATH="$N:$PATH"; unfunction node npm npx 2>/dev/null
//   npx electron spike/debate-demo.js

const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const LOG = path.join(__dirname, "debate-demo.log");
function log(...a) { const l = `[${new Date().toISOString()}] ${a.join(" ")}`; try { fs.appendFileSync(LOG, l + "\n"); } catch (e) {} console.log(l); }
try { fs.writeFileSync(LOG, `=== DEBATE DEMO === ${new Date().toISOString()}\n`); } catch (e) {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950,
    webPreferences: { webviewTag: true, nodeIntegration: false, contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, "debate-demo.html"));
  win.webContents.openDevTools({ mode: "bottom" });
  // 把页面 console 落盘，方便无人值守排查
  win.webContents.on("console-message", (e, level, message) => {
    let msg = message; if (e && typeof e === "object" && e.message !== undefined) msg = e.message;
    if (/__DEMO__|error|Error/i.test(String(msg))) log(`[page] ${msg}`);
  });
  log("[event] demo window created");

  // 触发文件：外部 touch spike/debate-go.txt 即点击「开始辩论」（便于无人值守复测）
  const GO = path.join(__dirname, "debate-go.txt");
  try { if (fs.existsSync(GO)) fs.unlinkSync(GO); } catch (e) {}
  setInterval(() => {
    if (fs.existsSync(GO)) {
      try { fs.unlinkSync(GO); } catch (e) {}
      log("[event] GO trigger -> click start");
      win.webContents.executeJavaScript("var b=document.getElementById('start'); b && !b.disabled && b.click(); b?b.disabled:'no-btn'").then((r) => log("[event] start clicked, disabledNow=" + r)).catch((e) => log("[error] go " + e.message));
    }
  }, 1500);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
