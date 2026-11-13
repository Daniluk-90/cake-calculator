// Программа «TETTAPRO Аналоги» для Windows и macOS.
// При запуске поднимает сайт подбора на этом компьютере (http://localhost:8787) и показывает его в окне.
// Сайт в браузере и программа работают с одной таблицей: загрузили в программе — изменилось на сайте, и наоборот.
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const http = require("http");
const path = require("path");
const { startServer } = require("./server.cjs");

const PORT = 8787;
const PASSWORD = process.env.ADMIN_PASSWORD || "tettapro";
let siteUrl = null;
let mainWindow = null;

// Отвечает ли на порту уже наш сайт (вторая копия программы или отдельно запущенный сайт).
function isOurSite(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body).app === "tettapro-analogs"); } catch { resolve(false); } });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function ensureSite() {
  const opts = { root: path.join(__dirname, "app"), dataDir: path.join(app.getPath("userData"), "data"), password: PASSWORD };
  for (let port = PORT; port < PORT + 10; port++) {
    try {
      return (await startServer({ ...opts, port })).url;
    } catch (e) {
      if (e.code !== "EADDRINUSE") throw e;
      if (await isOurSite(port)) return `http://localhost:${port}`;
    }
  }
  throw new Error("Не удалось запустить сайт: порты 8787–8796 заняты.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#f3f6f8",
    title: "TETTAPRO — подбор аналогов",
    icon: path.join(__dirname, "app", "img", "icon-512.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });

  // Внешние ссылки и «Открыть сайт в браузере» — в обычном браузере / почте.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(siteUrl)) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); }
  });

  mainWindow.loadURL(siteUrl + "/?desktop=1");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(async () => {
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
    } else {
      Menu.setApplicationMenu(null);
    }
    try {
      siteUrl = await ensureSite();
    } catch (e) {
      dialog.showErrorBox("TETTAPRO Аналоги", e.message);
      app.quit();
      return;
    }
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
