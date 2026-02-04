"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("node:path");
let SerialPortClass = null;
function getSerialPort() {
  if (!SerialPortClass) {
    SerialPortClass = require("serialport").SerialPort || require("serialport");
  }
  return SerialPortClass;
}
class SerialService {
  constructor(mainWindow) {
    __publicField(this, "ports", /* @__PURE__ */ new Map());
    __publicField(this, "mainWindow");
    this.mainWindow = mainWindow;
  }
  // List available ports
  async listPorts() {
    try {
      const SP = getSerialPort();
      if (!SP) throw new Error("SerialPort module not loaded");
      const ports = await SP.list();
      return { success: true, ports };
    } catch (error) {
      console.error("Error listing ports:", error);
      return { success: false, error: error.message };
    }
  }
  // Open a port
  async open(connectionId, options) {
    if (this.ports.has(connectionId)) {
      await this.close(connectionId);
    }
    const SP = getSerialPort();
    return new Promise((resolve) => {
      const port = new SP({
        path: options.path,
        baudRate: options.baudRate,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 1,
        parity: options.parity || "none",
        autoOpen: false
      });
      port.open((err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          this.ports.set(connectionId, port);
          port.on("data", (data) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("serial:data", { connectionId, data });
            }
          });
          port.on("close", () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("serial:closed", { connectionId });
            }
            this.ports.delete(connectionId);
          });
          port.on("error", (err2) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("serial:error", { connectionId, error: err2.message });
            }
          });
          resolve({ success: true });
        }
      });
    });
  }
  // Close the port
  async close(connectionId) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        port.close((err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            this.ports.delete(connectionId);
            resolve({ success: true });
          }
        });
      } else {
        this.ports.delete(connectionId);
        resolve({ success: true });
      }
    });
  }
  // Write data
  async write(connectionId, data) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        const payload = typeof data === "string" ? data : Buffer.from(data);
        port.write(payload, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      } else {
        resolve({ success: false, error: "Port not open" });
      }
    });
  }
}
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let serialService = null;
const stateFile = path.join(electron.app.getPath("userData"), "window-state.json");
const saveState = () => {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    require("fs").writeFileSync(stateFile, JSON.stringify(bounds));
  }
};
const loadState = () => {
  try {
    const data = require("fs").readFileSync(stateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return { width: 1e3, height: 800 };
  }
};
function createWindow() {
  const state = loadState();
  win = new electron.BrowserWindow({
    ...state,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    backgroundColor: "#1e1e1e",
    // Fix white flash
    show: true,
    // Show immediately
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    },
    // frame: false, // Commented out to enable native window behavior (Aero Snap)
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#3c3c3c",
      // Matches --vscode-titlebar
      symbolColor: "#cccccc",
      height: 30
    }
  });
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
  win.on("resize", () => saveState());
  win.on("move", () => saveState());
  serialService = new SerialService(win);
  electron.ipcMain.handle("serial:list-ports", async () => {
    return serialService == null ? void 0 : serialService.listPorts();
  });
  electron.ipcMain.handle("serial:open", async (_event, { connectionId, options }) => {
    return serialService == null ? void 0 : serialService.open(connectionId, options);
  });
  electron.ipcMain.handle("serial:close", async (_event, { connectionId }) => {
    return serialService == null ? void 0 : serialService.close(connectionId);
  });
  electron.ipcMain.handle("serial:write", async (_event, { connectionId, data }) => {
    return serialService == null ? void 0 : serialService.write(connectionId, data);
  });
  const mqtt = require("mqtt");
  const mqttClients = /* @__PURE__ */ new Map();
  electron.ipcMain.handle("mqtt:connect", async (_event, { connectionId, config }) => {
    return new Promise((resolve) => {
      if (mqttClients.has(connectionId)) {
        const existing = mqttClients.get(connectionId);
        if (existing.connected) {
          existing.end(true);
        }
        mqttClients.delete(connectionId);
      }
      const protocol = config.protocol || "tcp";
      let host = config.host;
      if (host && host.includes("://")) {
        try {
          const urlObj = new URL(host);
          host = urlObj.hostname;
        } catch (e) {
          host = host.split("://")[1];
        }
      }
      let url = `${protocol}://${host}:${config.port}`;
      if (protocol === "ws" || protocol === "wss") {
        const rawPath = config.path || "/mqtt";
        const path2 = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
        url += path2;
      }
      const options = {
        clientId: config.clientId,
        username: config.username,
        password: config.password,
        keepalive: config.keepAlive || 60,
        clean: config.cleanSession !== void 0 ? config.cleanSession : true,
        connectTimeout: (config.connectTimeout || 30) * 1e3,
        reconnectPeriod: config.autoReconnect ? 1e3 : 0,
        // WS Options for Node.js compatibility
        wsOptions: {
          origin: "http://localhost",
          // Many brokers reject WS without Origin
          headers: {
            "User-Agent": `SerialTool/${electron.app.getVersion()}`
          }
        }
      };
      console.log(`[MQTT] Connecting to ${url}`, options);
      let initialConnectHandled = false;
      let client = null;
      try {
        client = mqtt.connect(url, options);
      } catch (err) {
        console.error(`[MQTT] Sync Error ${connectionId}:`, err);
        return resolve({ success: false, error: err.message });
      }
      const handleInitialSuccess = () => {
        if (!initialConnectHandled) {
          initialConnectHandled = true;
          mqttClients.set(connectionId, client);
          resolve({ success: true });
          if (!(win == null ? void 0 : win.isDestroyed())) win == null ? void 0 : win.webContents.send("mqtt:status", { connectionId, status: "connected" });
          if (config.topics && Array.isArray(config.topics)) {
            config.topics.forEach((t) => client.subscribe(t));
          }
        }
      };
      const handleInitialError = (err) => {
        if (!initialConnectHandled) {
          initialConnectHandled = true;
          client.end(true);
          resolve({ success: false, error: err });
        }
      };
      client.on("connect", handleInitialSuccess);
      client.on("message", (topic, message) => {
        if (!(win == null ? void 0 : win.isDestroyed())) {
          win == null ? void 0 : win.webContents.send("mqtt:message", { connectionId, topic, payload: message });
        }
      });
      client.on("error", (err) => {
        console.error(`[MQTT] Error ${connectionId}:`, err);
        if (!initialConnectHandled) {
          handleInitialError(err.message);
        } else {
          if (!(win == null ? void 0 : win.isDestroyed())) win == null ? void 0 : win.webContents.send("mqtt:error", { connectionId, error: err.message });
        }
      });
      client.on("close", () => {
        console.log(`[MQTT] Closed: ${connectionId}`);
        if (!initialConnectHandled) {
          handleInitialError("Connection closed or timed out");
        } else {
          if (!(win == null ? void 0 : win.isDestroyed())) win == null ? void 0 : win.webContents.send("mqtt:status", { connectionId, status: "disconnected" });
        }
      });
    });
  });
  electron.ipcMain.handle("mqtt:disconnect", async (_event, { connectionId }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.end();
      mqttClients.delete(connectionId);
      return { success: true };
    }
    return { success: false, error: "Client not found" };
  });
  electron.ipcMain.handle("mqtt:publish", async (_event, { connectionId, topic, payload, options }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      return new Promise((resolve) => {
        client.publish(topic, Buffer.from(payload), options, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      });
    }
    return { success: false, error: "Client not connected" };
  });
  electron.ipcMain.handle("mqtt:subscribe", async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.subscribe(topic);
      return { success: true };
    }
    return { success: false };
  });
  electron.ipcMain.handle("mqtt:unsubscribe", async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.unsubscribe(topic);
      return { success: true };
    }
    return { success: false };
  });
  const fs = require("fs").promises;
  const sessionsFile = path.join(electron.app.getPath("userData"), "sessions.json");
  electron.ipcMain.handle("session:save", async (_event, sessions) => {
    try {
      await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("session:load", async () => {
    try {
      const data = await fs.readFile(sessionsFile, "utf-8");
      return { success: true, data: JSON.parse(data) };
    } catch (error) {
      if (error.code === "ENOENT") return { success: true, data: [] };
      return { success: false, error: error.message };
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  const { exec } = require("node:child_process");
  electron.ipcMain.handle("com0com:exec", async (_event, command) => {
    return new Promise((resolve) => {
      if (!command.startsWith("setupc")) {
        return resolve({ success: false, error: "Unauthorized command" });
      }
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message, stderr });
        } else {
          resolve({ success: true, stdout });
        }
      });
    });
  });
  electron.ipcMain.handle("com0com:install", async () => {
    const isDev = !!VITE_DEV_SERVER_URL;
    let installerPath = "";
    if (isDev) {
      installerPath = path.join(__dirname, "../resources/drivers/com0com_setup.exe");
    } else {
      installerPath = path.join(process.resourcesPath, "resources/drivers/com0com_setup.exe");
    }
    const targetDir = path.join(electron.app.getPath("userData"), "drivers", "com0com");
    try {
      const stats = await fs.stat(installerPath);
      if (!stats.isFile()) {
        return { success: false, error: `Installer path is not a file: ${installerPath}` };
      }
    } catch {
      return { success: false, error: `Installer not found at: ${installerPath}` };
    }
    return new Promise((resolve) => {
      const { spawn } = require("node:child_process");
      const child = spawn(installerPath, ["/S", `/D=${targetDir}`], {
        windowsHide: false,
        shell: true
      });
      child.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, path: targetDir });
        } else {
          resolve({ success: false, error: `Installer exited with code ${code}` });
        }
      });
    });
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.whenReady().then(createWindow);
exports.MAIN_DIST = MAIN_DIST;
exports.RENDERER_DIST = RENDERER_DIST;
exports.VITE_DEV_SERVER_URL = VITE_DEV_SERVER_URL;
