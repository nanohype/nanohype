import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { fileURLToPath } from "url";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { registerIpcHandlers } from "./ipc-handlers.js";

// ── Bootstrap ────────────────────────────────────────────────────────
//
// 1. Validate that all scaffolding placeholders have been replaced.
// 2. Validate configuration (exits on invalid env vars).
//

validateBootstrap();

const config = loadConfig();

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Main process entry point for __PROJECT_NAME__.
 *
 * Creates the BrowserWindow, loads the renderer, and registers
 * IPC handlers for AI calls. API keys live here in the main
 * process — the renderer communicates through the preload bridge.
 */

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 480,
    minHeight: 400,
    backgroundColor: "#08090D",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ── Graceful Shutdown ────────────────────────────────────────────────

const shutdown = (signal: string) => {
  console.log(`[main] ${signal} received, shutting down...`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  app.quit();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
