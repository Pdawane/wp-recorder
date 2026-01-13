const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getRecordings: () => ipcRenderer.invoke('get-recordings'),
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  deleteRecording: (filepath) => ipcRenderer.invoke('delete-recording', filepath),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  openSystemPreferences: () => ipcRenderer.invoke('open-system-preferences'),
  
  onMonitoringStatus: (callback) => ipcRenderer.on('monitoring-status', (event, data) => callback(data)),
  onWhatsAppFound: (callback) => ipcRenderer.on('whatsapp-found', (event, data) => callback(data))
});