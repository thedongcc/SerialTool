import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
// Lazy load SerialPort to improve startup speed
// import { SerialPort as SerialPortType } from 'serialport' // Type only
let SerialPortClass: any = null;

function getSerialPort() {
  if (!SerialPortClass) {
    SerialPortClass = require('serialport').SerialPort || require('serialport');
  }
  return SerialPortClass;
}

class SerialService {
  private ports: Map<string, any> = new Map();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  // List available ports
  async listPorts() {
    try {
      const SP = getSerialPort();
      if (!SP) throw new Error('SerialPort module not loaded');
      // @ts-ignore
      const ports = await SP.list();
      return { success: true, ports };
    } catch (error: any) {
      console.error('Error listing ports:', error);
      return { success: false, error: error.message };
    }
  }

  // Open a port
  async open(connectionId: string, options: { path: string; baudRate: number; dataBits?: 5 | 6 | 7 | 8; stopBits?: 1 | 1.5 | 2; parity?: 'none' | 'even' | 'mark' | 'odd' | 'space' }) {
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
        parity: options.parity || 'none',
        autoOpen: false,
      });

      port.open((err: any) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          this.ports.set(connectionId, port);

          // Setup listeners with connectionId
          port.on('data', (data: any) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:data', { connectionId, data });
            }
          });

          port.on('close', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:closed', { connectionId });
            }
            this.ports.delete(connectionId);
          });

          port.on('error', (err: any) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial:error', { connectionId, error: err.message });
            }
          });

          resolve({ success: true });
        }
      });
    });
  }

  // Close the port
  async close(connectionId: string) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        port.close((err: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            this.ports.delete(connectionId);
            resolve({ success: true });
          }
        });
      } else {
        this.ports.delete(connectionId); // Ensure cleanup if it was somehow in map but closed or null
        resolve({ success: true });
      }
    });
  }

  // Write data
  async write(connectionId: string, data: string | number[]) {
    return new Promise((resolve) => {
      const port = this.ports.get(connectionId);
      if (port && port.isOpen) {
        const payload = typeof data === 'string' ? data : Buffer.from(data);
        port.write(payload, (err: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      } else {
        resolve({ success: false, error: 'Port not open' });
      }
    });
  }
}

// The built directory structure
//
// ├─┬─ dist
// │ ├─- index.html
// │ ├── icon.svg
// │ ├── icon.ico
// ├─┬─ dist-electron
// │ ├── main.js
// │ └── preload.js
//
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let serialService: SerialService | null = null

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
const saveState = () => {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    require('fs').writeFileSync(stateFile, JSON.stringify(bounds));
  }
};

const loadState = () => {
  try {
    const data = require('fs').readFileSync(stateFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { width: 1000, height: 800 }; // Default
  }
};

function createWindow() {
  const state = loadState();

  win = new BrowserWindow({
    ...state,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    backgroundColor: '#1e1e1e', // Fix white flash
    show: true, // Show immediately
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    // frame: false, // Commented out to enable native window behavior (Aero Snap)
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#3c3c3c', // Matches --vscode-titlebar
      symbolColor: '#cccccc',
      height: 30
    },
  })

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.on('resize', () => saveState());
  win.on('move', () => saveState());

  // Initialize SerialService
  serialService = new SerialService(win)

  // Register IPC Handlers
  ipcMain.handle('serial:list-ports', async () => {
    return serialService?.listPorts()
  })

  ipcMain.handle('serial:open', async (_event, { connectionId, options }) => {
    return serialService?.open(connectionId, options)
  })

  ipcMain.handle('serial:close', async (_event, { connectionId }) => {
    return serialService?.close(connectionId)
  })

  ipcMain.handle('serial:write', async (_event, { connectionId, data }) => {
    return serialService?.write(connectionId, data)
  })

  // MQTT Service Logic
  const mqtt = require('mqtt');
  const mqttClients = new Map();

  ipcMain.handle('mqtt:connect', async (_event, { connectionId, config }) => {
    // config: { protocol, host, port, clientId, username, password, keepAlive, clean, ... }
    return new Promise((resolve) => {
      if (mqttClients.has(connectionId)) {
        const existing = mqttClients.get(connectionId);
        if (existing.connected) {
          existing.end(true);
        }
        mqttClients.delete(connectionId);
      }

      const protocol = config.protocol || 'tcp';
      const url = `${protocol}://${config.host}:${config.port}`;
      const options = {
        clientId: config.clientId,
        username: config.username,
        password: config.password,
        keepalive: config.keepAlive || 60,
        clean: config.cleanSession !== undefined ? config.cleanSession : true,
        connectTimeout: (config.connectTimeout || 30) * 1000,
        reconnectPeriod: config.autoReconnect ? 1000 : 0,
      };

      console.log(`[MQTT] Connecting to ${url}`, options);
      const client = mqtt.connect(url, options);

      client.on('connect', () => {
        console.log(`[MQTT] Connected: ${connectionId}`);
        mqttClients.set(connectionId, client);
        resolve({ success: true });
        if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'connected' });

        // Restore subscriptions if any?
        // Frontend handles re-subscription logic usually, or we can pass them in connect
        if (config.topics && Array.isArray(config.topics)) {
          config.topics.forEach((t: string) => client.subscribe(t));
        }
      });

      client.on('message', (topic: string, message: Buffer) => {
        if (!win?.isDestroyed()) {
          win?.webContents.send('mqtt:message', { connectionId, topic, payload: message }); // Send Buffer
        }
      });

      client.on('error', (err: Error) => {
        console.error(`[MQTT] Error ${connectionId}:`, err);
        if (!win?.isDestroyed()) win?.webContents.send('mqtt:error', { connectionId, error: err.message });
        // If initial connect fails?
        // mqtt.connect returns client immediately. 'error' event handles failure.
        // We might resolve success=false if it happens immediately? 
        // But mqtt client retries.
      });

      client.on('close', () => {
        if (!win?.isDestroyed()) win?.webContents.send('mqtt:status', { connectionId, status: 'disconnected' });
      });

      // Handle connection failure for the initial promise?
      // A bit tricky with mqtt.js as it auto-reconnects. 
      // We'll rely on events.
    });
  });

  ipcMain.handle('mqtt:disconnect', async (_event, { connectionId }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.end();
      mqttClients.delete(connectionId);
      return { success: true };
    }
    return { success: false, error: 'Client not found' };
  });

  ipcMain.handle('mqtt:publish', async (_event, { connectionId, topic, payload, options }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      return new Promise((resolve) => {
        client.publish(topic, Buffer.from(payload), options, (err: Error | undefined) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      });
    }
    return { success: false, error: 'Client not connected' };
  });

  ipcMain.handle('mqtt:subscribe', async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.subscribe(topic); // TODO: handle callback
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('mqtt:unsubscribe', async (_event, { connectionId, topic }) => {
    const client = mqttClients.get(connectionId);
    if (client) {
      client.unsubscribe(topic);
      return { success: true };
    }
    return { success: false };
  });

  // Session Management
  const fs = require('fs').promises;
  const sessionsFile = path.join(app.getPath('userData'), 'sessions.json');

  ipcMain.handle('session:save', async (_event, sessions) => {
    try {
      await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session:load', async () => {
    try {
      const data = await fs.readFile(sessionsFile, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    } catch (error: any) {
      if (error.code === 'ENOENT') return { success: true, data: [] };
      return { success: false, error: error.message };
    }
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
