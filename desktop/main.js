// Desktop shell for the HTML5 client. The game files are served from the package through the app:// scheme, so
// no HTTP server or network port is opened. The renderer gets no Node.js access, no preload and no IPC.
"use strict";
const { app, BrowserWindow, Menu, dialog, protocol, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const GAME_ROOT = path.join(__dirname, "game");
const ORIGIN = "app://mcity";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ttf": "font/ttf",
  ".woff": "font/woff", ".svg": "image/svg+xml", ".map": "application/json",
};

// --mcity-user-data=<absolute dir> keeps automated tests away from the player's profile (%APPDATA%\Millionaire City HTML5).
const userDataArg = process.argv.find((a) => a.startsWith("--mcity-user-data="));
if (userDataArg) {
  const dir = userDataArg.slice("--mcity-user-data=".length);
  if (!path.isAbsolute(dir)) {
    dialog.showErrorBox("Millionaire City HTML5", "--mcity-user-data needs an absolute path.");
    process.exit(2);
  }
  app.setPath("userData", dir);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function serve(request) {
  const url = new URL(request.url);
  if (url.host !== "mcity") return new Response("not found", { status: 404 });
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(GAME_ROOT, rel));
  if (!file.startsWith(GAME_ROOT + path.sep)) return new Response("forbidden", { status: 403 });
  try {
    const data = fs.readFileSync(file);
    return new Response(data, { headers: { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 600, title: "Millionaire City HTML5", backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, target) => {
    if (!target.startsWith(ORIGIN + "/")) e.preventDefault();
  });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    dialog.showErrorBox("Millionaire City HTML5", `The game stopped (${details.reason}). Progress up to the last save is kept.`);
  });
  // The game needs WebGL. On this test machine Chromium's GPU process did not start when the application folder
  // path was longer than about 155 characters, so the message names that cause first.
  win.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      const webgl = String(app.getGPUFeatureStatus().webgl ?? "");
      if (webgl.startsWith("enabled")) return;
      const dir = path.dirname(process.execPath);
      dialog.showMessageBox(win, {
        type: "error", title: "Millionaire City HTML5",
        message: "Graphics acceleration (WebGL) could not be started, so the game cannot run.",
        detail: (dir.length > 150 ? `The application folder path is long (${dir.length} characters). Move the folder to a shorter path, for example C:\\Games\\Millionaire City HTML5, and start it again.\n\n` : "") +
          "Updating the graphics driver can also help. Your saved games are not affected.",
      });
    }, 2000);
  });
  win.loadURL(ORIGIN + "/index.html");
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle("app", serve);
    // Every permission is refused, except the Fullscreen API for the game's own page: the original options panel has a
    // full-screen button (F11 works through the window as well).
    session.defaultSession.setPermissionRequestHandler((_wc, perm, callback, details) =>
      callback(perm === "fullscreen" && String(details?.requestingUrl ?? "").startsWith("app://mcity/")));
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_d, cb) => cb({ cancel: true }));
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
