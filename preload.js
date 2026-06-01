const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  fetchPost: (url) => ipcRenderer.invoke('fetch-post', url),
  saveCard: (dataUrl) => ipcRenderer.invoke('save-card', dataUrl),
  fetchImage: (url) => ipcRenderer.invoke('fetch-image', url),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  saveToFolder: (folder, filename, dataUrl) => ipcRenderer.invoke('save-to-folder', folder, filename, dataUrl),
  reveal: (filePath) => ipcRenderer.invoke('reveal', filePath)
})
