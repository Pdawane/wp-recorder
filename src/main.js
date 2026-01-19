const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let isRecording = false;
let monitoringInterval;
let recordingsPath;
let previousCallState = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();
  console.log('Window created successfully');
}

function setupRecordingsDirectory() {
  const userDataPath = app.getPath('userData');
  recordingsPath = path.join(userDataPath, 'recordings');
  
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }
  
  return recordingsPath;
}

async function detectWhatsAppWindow() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    console.log(`Found ${sources.length} windows`);
    
    const whatsappWindow = sources.find(source => {
      const name = source.name.toLowerCase();
      console.log('Window:', source.name);
      return name.includes('whatsapp') && !name.includes('call recorder');
    });
    
    if (whatsappWindow) {
      console.log('WhatsApp window found:', whatsappWindow.name);
      
      const windowTitle = whatsappWindow.name.toLowerCase();
      const hasDash = windowTitle.includes(' - ');
      const hasVideoCall = windowTitle.includes('video call');
      const hasVoiceCall = windowTitle.includes('voice call');
      const hasAudioCall = windowTitle.includes('audio call');
      const hasCalling = windowTitle.includes('calling');
      const hasCallKeyword = hasVideoCall || hasVoiceCall || hasAudioCall || hasCalling;
      
      const whatsappIndex = windowTitle.indexOf('whatsapp');
      const callKeywordIndex = hasVideoCall ? windowTitle.indexOf('video call') :
                               hasVoiceCall ? windowTitle.indexOf('voice call') :
                               hasAudioCall ? windowTitle.indexOf('audio call') :
                               hasCalling ? windowTitle.indexOf('calling') : -1;
      
      const inCall = hasDash && hasCallKeyword && callKeywordIndex > whatsappIndex;
      
      console.log('Call detection - Has dash:', hasDash, 'Has keyword:', hasCallKeyword, 'In call:', inCall);
      
      return {
        found: true,
        inCall: inCall,
        windowName: whatsappWindow.name
      };
    }
    
    console.log('WhatsApp window not found');
    return { found: false, inCall: false, windowName: null };
    
  } catch (error) {
    console.error('Error detecting WhatsApp:', error);
    return { found: false, inCall: false, windowName: null };
  }
}

async function requestPermissions() {
  console.log('Checking permissions for platform:', process.platform);
  
  if (process.platform === 'darwin') {
    try {
      let micStatus = systemPreferences.getMediaAccessStatus('microphone');
      console.log('Initial microphone status:', micStatus);
      
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        console.log('Microphone access requested, granted:', granted);
        micStatus = systemPreferences.getMediaAccessStatus('microphone');
      }
      
      let cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      console.log('Initial camera status:', cameraStatus);
      
      if (cameraStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        console.log('Camera access requested, granted:', granted);
        cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      }
      
      const screenStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('Screen recording status:', screenStatus);
      
      const result = {
        microphone: micStatus === 'granted',
        camera: cameraStatus === 'granted',
        screen: screenStatus === 'granted',
        needsScreenPermission: screenStatus !== 'granted'
      };
      
      console.log('Permission result:', result);
      return result;
      
    } catch (error) {
      console.error('Permission error:', error);
      return {
        microphone: false,
        camera: false,
        screen: false,
        needsScreenPermission: true,
        error: error.message
      };
    }
  } else {
    console.log('Windows platform - assuming permissions granted');
    return {
      microphone: true,
      camera: true,
      screen: true,
      needsScreenPermission: false
    };
  }
}

async function getSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 200, height: 200 }
    });
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      display_id: source.display_id
    }));
  } catch (error) {
    console.error('Error getting sources:', error);
    return [];
  }
}

function getRecordings() {
  try {
    const files = fs.readdirSync(recordingsPath);
    const recordings = files
      .filter(file => file.endsWith('.mp4'))
      .map(file => {
        const filePath = path.join(recordingsPath, file);
        const stats = fs.statSync(filePath);
        
        return {
          id: file,
          name: file,
          path: filePath,
          size: stats.size,
          date: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return recordings;
  } catch (error) {
    console.error('Error getting recordings:', error);
    return [];
  }
}

function deleteRecording(filename) {
  try {
    const filePath = path.join(recordingsPath, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting recording:', error);
    return false;
  }
}

async function convertWebMToMP4(webmPath, mp4Path) {
  return new Promise((resolve, reject) => {
    console.log('Converting WebM to MP4...');
    console.log('Input:', webmPath);
    console.log('Output:', mp4Path);
    
    ffmpeg(webmPath)
      .outputOptions([
        '-c:v libx264',           // H.264 video codec (universal compatibility)
        '-preset fast',            // Encoding speed/quality balance
        '-crf 23',                 // Quality (lower = better, 18-28 is good range)
        '-c:a aac',                // AAC audio codec (universal compatibility)
        '-b:a 192k',               // Audio bitrate
        '-movflags +faststart',    // Enable streaming/quick playback
        '-pix_fmt yuv420p'         // Pixel format for compatibility
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('Conversion completed successfully');
        // Delete the temporary WebM file
        try {
          fs.unlinkSync(webmPath);
          console.log('Temporary WebM file deleted');
        } catch (err) {
          console.error('Error deleting temporary WebM:', err);
        }
        resolve(mp4Path);
      })
      .on('error', (err) => {
        console.error('Conversion error:', err);
        reject(err);
      })
      .save(mp4Path);
  });
}

async function saveRecording(buffer, filename) {
  try {
    // Save as temporary WebM first
    const tempWebMPath = path.join(recordingsPath, filename.replace('.mp4', '_temp.webm'));
    fs.writeFileSync(tempWebMPath, Buffer.from(buffer));
    console.log('WebM saved temporarily:', tempWebMPath);
    
    // Convert to MP4
    const mp4Path = path.join(recordingsPath, filename);
    await convertWebMToMP4(tempWebMPath, mp4Path);
    
    console.log('Final MP4 saved:', mp4Path);
    return mp4Path;
  } catch (error) {
    console.error('Error saving/converting recording:', error);
    return null;
  }
}

function startMonitoring() {
  console.log('Starting monitoring...');
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  
  previousCallState = false;
  
  monitoringInterval = setInterval(async () => {
    const detection = await detectWhatsAppWindow();
    
    const callStateChanged = detection.inCall !== previousCallState;
    
    if (callStateChanged) {
      console.log('CALL STATE CHANGED: was', previousCallState, 'now', detection.inCall);
      previousCallState = detection.inCall;
    }
    
    const statusData = {
      whatsappRunning: detection.found,
      inCall: detection.inCall,
      isRecording: isRecording,
      windowName: detection.windowName,
      callStateChanged: callStateChanged
    };
    
    console.log('Status:', statusData);
    
    mainWindow.webContents.send('monitoring-status', statusData);
  }, 1000);
  
  console.log('Monitoring interval started');
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  previousCallState = false;
}

ipcMain.handle('request-permissions', async () => {
  return await requestPermissions();
});

ipcMain.handle('get-sources', async () => {
  return await getSources();
});

ipcMain.handle('get-recordings', () => {
  return getRecordings();
});

ipcMain.handle('delete-recording', (event, filename) => {
  return deleteRecording(filename);
});

ipcMain.handle('save-recording', async (event, buffer, filename) => {
  return await saveRecording(buffer, filename);
});

ipcMain.handle('start-monitoring', () => {
  startMonitoring();
  return true;
});

ipcMain.handle('stop-monitoring', () => {
  stopMonitoring();
  return true;
});

ipcMain.handle('get-recordings-path', () => {
  return recordingsPath;
});

ipcMain.handle('check-whatsapp-status', async () => {
  return await detectWhatsAppWindow();
});

ipcMain.handle('open-external', async (event, filePath) => {
  try {
    const result = await shell.openPath(filePath);
    return result;
  } catch (error) {
    console.error('Error opening file:', error);
    return error.message;
  }
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (error) {
    console.error('Error showing item in folder:', error);
    return false;
  }
});

ipcMain.on('recording-started', () => {
  isRecording = true;
});

ipcMain.on('recording-stopped', () => {
  isRecording = false;
});

app.whenReady().then(() => {
  setupRecordingsDirectory();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  stopMonitoring();
});