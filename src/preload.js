const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  requestPermissions: () => ipcRenderer.invoke('request-permissions'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  getRecordings: () => ipcRenderer.invoke('get-recordings'),
  deleteRecording: (filename) => ipcRenderer.invoke('delete-recording', filename),
  saveRecording: (buffer, filename) => ipcRenderer.invoke('save-recording', buffer, filename),
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  getRecordingsPath: () => ipcRenderer.invoke('get-recordings-path'),
  onMonitoringStatus: (callback) => ipcRenderer.on('monitoring-status', (event, data) => callback(data)),
  recordingStarted: () => ipcRenderer.send('recording-started'),
  recordingStopped: () => ipcRenderer.send('recording-stopped'),
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path)
});