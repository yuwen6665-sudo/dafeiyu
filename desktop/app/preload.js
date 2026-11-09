const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yusheng", {
  move: (cx) => ipcRenderer.send("move", cx),
  hover: (over) => ipcRenderer.send("hover", over),
  voice: () => ipcRenderer.send("open", "voice"),
  room: () => ipcRenderer.send("open", "room"),
  onAnim: (cb) => ipcRenderer.on("anim", (_e, n) => cb(n)),
  onMood: (cb) => ipcRenderer.on("mood", (_e, m) => cb(m)),
  quit: () => ipcRenderer.send("quit"),
});
