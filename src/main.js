const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let isRecording = false;
let monitoringInterval;
let recordingsPath;
let previousCallState = false;
let callStateHistory = [];
let consecutiveCallDetections = 0;
let consecutiveNoCallDetections = 0;
const DETECTION_THRESHOLD = 2;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();
  
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture' || permission === 'displayCapture') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  console.log('Window created successfully');
}

function setupRecordingsDirectory() {
  const userDataPath = app.getPath('userData');
  recordingsPath = path.join(userDataPath, 'recordings');
  
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }
  
  console.log('📁 Recordings directory:', recordingsPath);
  return recordingsPath;
}

async function detectWhatsAppCall() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 150, height: 150 }
    });
    
    const whatsappWindows = sources.filter(source => {
      const name = source.name.toLowerCase();
      return (name.includes('whatsapp') || name.includes('call')) && 
             !name.includes('call recorder') &&
             !name.includes('electron');
    });
    
    if (whatsappWindows.length === 0) {
      return { 
        found: false, 
        inCall: false, 
        windowName: null,
        confidence: 0,
        reason: 'No WhatsApp window'
      };
    }
    
    for (const window of whatsappWindows) {
      const windowTitle = window.name.toLowerCase();
      
      const callPatterns = [
        'video call',
        'voice call', 
        'audio call',
        'calling',
        'ringing',
        'call with',
        'video chat',
        'ongoing call'
      ];
      
      const hasCallKeyword = callPatterns.some(pattern => windowTitle.includes(pattern));
      
      if (hasCallKeyword) {
        const isFalsePositive = 
          windowTitle.includes('no active call') ||
          windowTitle.includes('end call') ||
          windowTitle.includes('call ended');
        
        if (!isFalsePositive) {
          return {
            found: true,
            inCall: true,
            windowName: window.name,
            confidence: 4,
            reason: 'Active call detected'
          };
        }
      }
      
      if (windowTitle !== 'whatsapp' && 
          windowTitle.includes('whatsapp') && 
          windowTitle.includes(' - ')) {
        const afterDash = windowTitle.split(' - ')[1] || '';
        if (afterDash.length > 3 && !afterDash.includes('whatsapp')) {
          return {
            found: true,
            inCall: true,
            windowName: window.name,
            confidence: 3,
            reason: 'Potential call window detected'
          };
        }
      }
    }
    
    return {
      found: true,
      inCall: false,
      windowName: whatsappWindows[0].name,
      confidence: 4,
      reason: 'WhatsApp open but no active call'
    };
    
  } catch (error) {
    console.error('❌ Error detecting WhatsApp:', error);
    return { 
      found: false, 
      inCall: false, 
      windowName: null,
      confidence: 0,
      reason: 'Detection error: ' + error.message
    };
  }
}

function updateCallStateHistory(inCall) {
  callStateHistory.push(inCall);
  
  if (callStateHistory.length > 5) {
    callStateHistory.shift();
  }
  
  if (inCall) {
    consecutiveCallDetections++;
    consecutiveNoCallDetections = 0;
  } else {
    consecutiveNoCallDetections++;
    consecutiveCallDetections = 0;
  }
}

function getStableCallState() {
  if (previousCallState === false && consecutiveCallDetections >= DETECTION_THRESHOLD) {
    return true;
  }
  
  if (previousCallState === true && consecutiveNoCallDetections >= DETECTION_THRESHOLD) {
    return false;
  }
  
  return previousCallState;
}

async function checkMacOSScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return { granted: true, canPrompt: false };
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    
    return { granted: sources.length > 0, canPrompt: false };
  } catch (error) {
    return { granted: false, canPrompt: true };
  }
}

async function requestPermissions() {
  console.log('🔍 Checking permissions for platform:', process.platform);
  
  if (process.platform === 'darwin') {
    try {
      let micStatus = systemPreferences.getMediaAccessStatus('microphone');
      console.log('🎤 Microphone status:', micStatus);
      
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        micStatus = systemPreferences.getMediaAccessStatus('microphone');
        console.log('🎤 Microphone after request:', micStatus);
      }
      
      let cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      console.log('📷 Camera status:', cameraStatus);
      
      if (cameraStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        cameraStatus = systemPreferences.getMediaAccessStatus('camera');
        console.log('📷 Camera after request:', cameraStatus);
      }
      
      const screenCheck = await checkMacOSScreenRecordingPermission();
      const screenStatus = screenCheck.granted ? 'granted' : 'denied';
      console.log('🖥️ Screen recording status:', screenStatus);
      
      return {
        microphone: micStatus === 'granted',
        camera: cameraStatus === 'granted',
        screen: screenCheck.granted,
        needsScreenPermission: !screenCheck.granted,
        platform: 'darwin'
      };
      
    } catch (error) {
      console.error('❌ Permission error:', error);
      return {
        microphone: false,
        camera: false,
        screen: false,
        needsScreenPermission: true,
        platform: 'darwin',
        error: error.message
      };
    }
  } else {
    return {
      microphone: true,
      camera: true,
      screen: true,
      needsScreenPermission: false,
      platform: 'win32'
    };
  }
}

async function openSystemPreferences(type) {
  if (process.platform === 'darwin') {
    let prefPane = '';
    
    switch(type) {
      case 'screen':
        prefPane = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
        break;
      case 'microphone':
        prefPane = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';
        break;
      case 'camera':
        prefPane = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera';
        break;
    }
    
    if (prefPane) {
      try {
        await shell.openExternal(prefPane);
        
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Permission Required',
          message: `Please grant ${type} permission`,
          detail: `1. Find "${app.name}" in the list\n2. Check the box next to it\n3. Restart the app\n\nClick OK after granting permission.`,
          buttons: ['OK', 'Cancel']
        });
        
        return result.response === 0;
      } catch (error) {
        console.error('Error opening preferences:', error);
        return false;
      }
    }
  } else if (process.platform === 'win32') {
    try {
      if (type === 'microphone') {
        await shell.openExternal('ms-settings:privacy-microphone');
      } else if (type === 'camera') {
        await shell.openExternal('ms-settings:privacy-webcam');
      }
      
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Permission Required',
        message: `Please grant ${type} permission`,
        detail: 'Enable permission for this app in Windows Settings.',
        buttons: ['OK']
      });
      
      return true;
    } catch (error) {
      console.error('Error opening settings:', error);
      return false;
    }
  }
  
  return false;
}

async function getSources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 200, height: 200 },
      fetchWindowIcons: true
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
      .filter(file => file.endsWith('.mp4') || file.endsWith('.webm'))
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
      console.log('🗑️ Deleted recording:', filename);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting recording:', error);
    return false;
  }
}

async function saveRecording(buffer, filename) {
  if (!recordingsPath) {
    throw new Error('Recordings directory not initialized');
  }

  if (!fs.existsSync(recordingsPath)) {
    console.log('📁 Creating recordings directory...');
    fs.mkdirSync(recordingsPath, { recursive: true });
  }

  const tempWebm = path.join(recordingsPath, filename);
  const finalMp4 = tempWebm.replace('.webm', '.mp4');

  try {
    console.log('📝 Writing WebM file:', tempWebm);
    console.log('📊 Buffer size:', buffer.length, 'bytes');
    
    fs.writeFileSync(tempWebm, Buffer.from(buffer));
    
    const webmStats = fs.statSync(tempWebm);
    console.log('✅ WebM file written:', webmStats.size, 'bytes');

    if (webmStats.size < 1000) {
      throw new Error('WebM file too small - recording may be corrupted');
    }

    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      console.warn('⚠️ FFmpeg not found at:', ffmpegPath);
      console.warn('⚠️ Keeping WebM format');
      return tempWebm;
    }

    console.log('✅ FFmpeg found at:', ffmpegPath);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempWebm, (err, metadata) => {
        if (err) {
          console.error('⚠️ FFprobe error:', err);
          console.log('⚠️ Keeping WebM without conversion');
          resolve(tempWebm);
          return;
        }

        console.log('📊 WebM Streams:');
        const hasVideo = metadata.streams.some(s => s.codec_type === 'video');
        const hasAudio = metadata.streams.some(s => s.codec_type === 'audio');
        
        console.log('  Video:', hasVideo);
        console.log('  Audio:', hasAudio);
        
        metadata.streams.forEach((stream, idx) => {
          console.log(`  Stream ${idx}:`, stream.codec_type, stream.codec_name);
        });

        if (!hasVideo) {
          console.error('❌ No video stream found!');
          resolve(tempWebm);
          return;
        }

        console.log('🔄 Starting FFmpeg conversion...');
        
        const outputOptions = [
          '-c:v copy',
          '-movflags +faststart'
        ];

        if (hasAudio) {
          outputOptions.push('-c:a aac', '-b:a 192k', '-ar 48000');
        } else {
          console.warn('⚠️ No audio stream - video only');
        }

        const ffmpegCommand = ffmpeg(tempWebm)
          .outputOptions(outputOptions)
          .on('start', cmd => {
            console.log('▶️ FFmpeg command:', cmd);
          })
          .on('progress', progress => {
            if (progress.percent) {
              console.log(`⏳ Converting: ${Math.round(progress.percent)}%`);
            }
          })
          .on('end', () => {
            console.log('✅ FFmpeg conversion complete');
            try {
              if (fs.existsSync(finalMp4)) {
                const mp4Size = fs.statSync(finalMp4).size;
                console.log('✅ MP4 file size:', mp4Size, 'bytes');
                
                if (mp4Size > 1000) {
                  if (fs.existsSync(tempWebm)) {
                    fs.unlinkSync(tempWebm);
                    console.log('🗑️ Deleted temp WebM');
                  }
                  resolve(finalMp4);
                } else {
                  console.error('❌ MP4 too small, keeping WebM');
                  if (fs.existsSync(finalMp4)) fs.unlinkSync(finalMp4);
                  resolve(tempWebm);
                }
              } else {
                console.error('❌ MP4 not created, keeping WebM');
                resolve(tempWebm);
              }
            } catch (err) {
              console.error('❌ Post-conversion error:', err);
              resolve(tempWebm);
            }
          })
          .on('error', (err, stdout, stderr) => {
            console.error('❌ FFmpeg conversion error:', err.message);
            if (stderr) console.error('FFmpeg stderr:', stderr);
            
            console.log('⚠️ Keeping WebM due to conversion error');
            if (fs.existsSync(finalMp4)) {
              try {
                fs.unlinkSync(finalMp4);
              } catch (e) {}
            }
            resolve(tempWebm);
          });

        ffmpegCommand.save(finalMp4);
      });
    });

  } catch (error) {
    console.error('❌ Error in saveRecording:', error);
    
    if (fs.existsSync(tempWebm)) {
      console.log('⚠️ Returning WebM due to error');
      return tempWebm;
    }
    
    throw error;
  }
}

function startMonitoring() {
  console.log('🚀 Starting monitoring...');
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  
  previousCallState = false;
  callStateHistory = [];
  consecutiveCallDetections = 0;
  consecutiveNoCallDetections = 0;
  isRecording = false;
  
  monitoringInterval = setInterval(async () => {
    const detection = await detectWhatsAppCall();
    updateCallStateHistory(detection.inCall);
    const stableCallState = getStableCallState();
    const callStateChanged = stableCallState !== previousCallState;
    
    if (callStateChanged) {
      console.log('🔔 CALL STATE CHANGED:', previousCallState, '→', stableCallState);
      previousCallState = stableCallState;
    }
    
    const statusData = {
      whatsappRunning: detection.found,
      inCall: stableCallState,
      isRecording: isRecording,
      windowName: detection.windowName,
      callStateChanged: callStateChanged,
      confidence: detection.confidence,
      reason: detection.reason,
      rawDetection: detection.inCall,
      consecutiveCalls: consecutiveCallDetections,
      consecutiveNoCalls: consecutiveNoCallDetections
    };
    
    mainWindow.webContents.send('monitoring-status', statusData);
  }, 1000);
  
  console.log('✅ Monitoring started');
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  
  previousCallState = false;
  callStateHistory = [];
  consecutiveCallDetections = 0;
  consecutiveNoCallDetections = 0;
}

ipcMain.handle('request-permissions', async () => {
  return await requestPermissions();
});

ipcMain.handle('open-system-preferences', async (event, type) => {
  return await openSystemPreferences(type);
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
  try {
    console.log('📥 Received save request:', filename);
    console.log('📊 Buffer size:', buffer.length, 'bytes');
    
    const result = await saveRecording(buffer, filename);
    console.log('✅ Save complete:', result);
    return result;
  } catch (error) {
    console.error('❌ Save recording error:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
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
  return await detectWhatsAppCall();
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
    console.error('Error showing folder:', error);
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