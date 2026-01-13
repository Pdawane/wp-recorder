const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let isMonitoring = false;
let monitoringInterval;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show App', 
      click: () => mainWindow.show() 
    },
    { 
      label: 'Quit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('WhatsApp Call Recorder');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  // Request permissions on macOS
  if (process.platform === 'darwin') {
    await requestMacPermissions();
  }
  
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

// Request macOS permissions
async function requestMacPermissions() {
  try {
    // Request microphone access
    const micStatus = await systemPreferences.askForMediaAccess('microphone');
    console.log('Microphone access:', micStatus);
    
    // Request screen recording access
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log('Screen recording access:', screenStatus);
    
    if (screenStatus !== 'granted') {
      console.log('Screen recording permission needed - user must grant in System Preferences');
    }
  } catch (err) {
    console.error('Error requesting permissions:', err);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Get recordings directory
function getRecordingsDir() {
  const dir = path.join(app.getPath('documents'), 'WhatsAppRecordings');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Get list of recordings
ipcMain.handle('get-recordings', async () => {
  const dir = getRecordingsDir();
  const files = fs.readdirSync(dir);
  
  const recordings = files
    .filter(file => file.endsWith('.webm'))
    .map(file => {
      const stats = fs.statSync(path.join(dir, file));
      return {
        name: file,
        path: path.join(dir, file),
        size: stats.size,
        date: stats.mtime
      };
    })
    .sort((a, b) => b.date - a.date);
  
  return recordings;
});

// Find WhatsApp window
async function findWhatsAppWindow() {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 150, height: 150 }
  });
  
  const whatsappWindow = sources.find(source => 
    source.name.toLowerCase().includes('whatsapp') ||
    source.name.toLowerCase().includes('web.whatsapp')
  );
  
  return whatsappWindow;
}

// Start monitoring
ipcMain.handle('start-monitoring', async () => {
  isMonitoring = true;
  mainWindow.webContents.send('monitoring-status', { isMonitoring: true });
  
  monitoringInterval = setInterval(async () => {
    const whatsappWindow = await findWhatsAppWindow();
    
    if (whatsappWindow) {
      mainWindow.webContents.send('whatsapp-found', { 
        source: whatsappWindow,
        found: true 
      });
    } else {
      mainWindow.webContents.send('whatsapp-found', { found: false });
    }
  }, 3000); // Check every 3 seconds
  
  return { success: true };
});

// Stop monitoring
ipcMain.handle('stop-monitoring', async () => {
  isMonitoring = false;
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  mainWindow.webContents.send('monitoring-status', { isMonitoring: false });
  return { success: true };
});

// Save recording
ipcMain.handle('save-recording', async (event, { buffer, phoneNumber, duration }) => {
  const recordingsDir = getRecordingsDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${phoneNumber || 'unknown'}_${timestamp}_${duration}s.webm`;
  const filepath = path.join(recordingsDir, filename);

  fs.writeFileSync(filepath, Buffer.from(buffer));
  
  return { success: true, filepath, filename };
});

// Delete recording
ipcMain.handle('delete-recording', async (event, filepath) => {
  try {
    fs.unlinkSync(filepath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Check permissions status
ipcMain.handle('check-permissions', async () => {
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    
    return {
      microphone: micStatus === 'granted',
      screen: screenStatus === 'granted',
      platform: 'darwin'
    };
  }
  
  return {
    microphone: true,
    screen: true,
    platform: process.platform
  };
});

// Open recording folder
ipcMain.handle('open-folder', async () => {
  shell.openPath(getRecordingsDir());
});

// Open system preferences
ipcMain.handle('open-system-preferences', async () => {
  if (process.platform === 'darwin') {
    // Open Screen Recording preferences
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
});