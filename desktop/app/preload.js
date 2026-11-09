const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yusheng", {
  hover: (over) => ipcRenderer.send("hover", over),
  onInteractive: (cb) => ipcRenderer.on("interactive", (_e, v) => cb(v)),
  voice: () => ipcRenderer.send("open", "voice"),
  room: () => ipcRenderer.send("open", "room"),
  bounds: (b) => ipcRenderer.send("bounds", b),
  quit: () => ipcRenderer.send("quit"),
});
