const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  requestPermissions: () => ipcRenderer.invoke('request-permissions'),
  openSystemPreferences: (type) => ipcRenderer.invoke('open-system-preferences', type),
  getSources: () => ipcRenderer.invoke('get-sources'),
  getRecordings: () => ipcRenderer.invoke('get-recordings'),
  deleteRecording: (filename) => ipcRenderer.invoke('delete-recording', filename),
  saveRecording: (buffer, filename) => ipcRenderer.invoke('save-recording', buffer, filename),
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  getRecordingsPath: () => ipcRenderer.invoke('get-recordings-path'),
  checkWhatsAppStatus: () => ipcRenderer.invoke('check-whatsapp-status'),
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  
  recordingStarted: () => ipcRenderer.send('recording-started'),
  recordingStopped: () => ipcRenderer.send('recording-stopped'),
  
  onMonitoringStatus: (callback) => {
    ipcRenderer.on('monitoring-status', (event, data) => callback(data));
  }
});