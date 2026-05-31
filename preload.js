const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  fetchPost: (url) => ipcRenderer.invoke('fetch-post', url),
  saveCard: (dataUrl) => ipcRenderer.invoke('save-card', dataUrl),
  fetchImage: (url) => ipcRenderer.invoke('fetch-image', url)
})
