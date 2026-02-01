"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
electron.contextBridge.exposeInMainWorld("serialAPI", {
  listPorts: () => electron.ipcRenderer.invoke("serial:list-ports"),
  open: (connectionId, options) => electron.ipcRenderer.invoke("serial:open", { connectionId, options }),
  close: (connectionId) => electron.ipcRenderer.invoke("serial:close", { connectionId }),
  write: (connectionId, data) => electron.ipcRenderer.invoke("serial:write", { connectionId, data }),
  onData: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback(args.data);
      }
    };
    electron.ipcRenderer.on("serial:data", listener);
    return () => electron.ipcRenderer.off("serial:data", listener);
  },
  onClosed: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback();
      }
    };
    electron.ipcRenderer.on("serial:closed", listener);
    return () => electron.ipcRenderer.off("serial:closed", listener);
  },
  onError: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback(args.error);
      }
    };
    electron.ipcRenderer.on("serial:error", listener);
    return () => electron.ipcRenderer.off("serial:error", listener);
  }
});
electron.contextBridge.exposeInMainWorld("mqttAPI", {
  connect: (connectionId, config) => electron.ipcRenderer.invoke("mqtt:connect", { connectionId, config }),
  disconnect: (connectionId) => electron.ipcRenderer.invoke("mqtt:disconnect", { connectionId }),
  publish: (connectionId, topic, payload, options) => electron.ipcRenderer.invoke("mqtt:publish", { connectionId, topic, payload, options }),
  subscribe: (connectionId, topic) => electron.ipcRenderer.invoke("mqtt:subscribe", { connectionId, topic }),
  unsubscribe: (connectionId, topic) => electron.ipcRenderer.invoke("mqtt:unsubscribe", { connectionId, topic }),
  onMessage: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback(args.topic, args.payload);
      }
    };
    electron.ipcRenderer.on("mqtt:message", listener);
    return () => electron.ipcRenderer.off("mqtt:message", listener);
  },
  onStatus: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback(args.status);
      }
    };
    electron.ipcRenderer.on("mqtt:status", listener);
    return () => electron.ipcRenderer.off("mqtt:status", listener);
  },
  onError: (connectionId, callback) => {
    const listener = (_, args) => {
      if (args.connectionId === connectionId) {
        callback(args.error);
      }
    };
    electron.ipcRenderer.on("mqtt:error", listener);
    return () => electron.ipcRenderer.off("mqtt:error", listener);
  }
});
electron.contextBridge.exposeInMainWorld("sessionAPI", {
  save: (sessions) => electron.ipcRenderer.invoke("session:save", sessions),
  load: () => electron.ipcRenderer.invoke("session:load")
});
