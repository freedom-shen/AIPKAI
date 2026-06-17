const { app, BrowserWindow } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

// 单实例锁：避免多开导致多个进程争抢同一分区数据库(IndexedDB LOCK)，造成网页卡住/白屏
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#EFEEF3",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    titleBarStyle: "hiddenInset",
    webPreferences: {
      webviewTag: true, // 允许 <webview> 嵌入真实 AI 网页
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // 调试：把渲染层 console 落盘，便于无 GUI 排查
  const fs = require("fs");
  const logPath = path.join(__dirname, "..", "app-debug.log");
  try { fs.writeFileSync(logPath, `=== app debug ${new Date().toISOString()} ===\n`); } catch (e) {}
  win.webContents.on("console-message", (e, level, message) => {
    let msg = message; if (e && typeof e === "object" && e.message !== undefined) msg = e.message;
    if (/\[login\]|\[debate\]|error/i.test(String(msg))) { try { fs.appendFileSync(logPath, msg + "\n"); } catch (_) {} }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
