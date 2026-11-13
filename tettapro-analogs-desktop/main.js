// Программа «TETTAPRO Аналоги» для Windows и macOS.
// Интерфейс тот же, что на сайте; таблица берётся с сайта и общая для всех.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
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

  // Ссылки (tetta.pro, почта) открываются в браузере / почтовой программе, а не внутри окна.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (/^(https?|mailto):/i.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(() => {
  // На Mac нужно меню «Правка», иначе не работают Cmd+C / Cmd+V.
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
