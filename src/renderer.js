let isMonitoring = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let timerInterval = null;
let currentTheme = 'light';
let currentStream = null;
let wasInCall = false;
let isCurrentlyRecording = false;
let recordingStartScheduled = false;
let autoRecordingEnabled = true;
let recordingLock = false;
let audioContext = null;
let audioDestination = null;
let callEndGracePeriod = null;
let pendingSave = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const checkPermissionsBtn = document.getElementById('checkPermissionsBtn');
const permissionsStatus = document.getElementById('permissionsStatus');
const statusIndicator = document.getElementById('statusIndicator');
const whatsappStatus = document.getElementById('whatsappStatus');
const callStatus = document.getElementById('callStatus');
const recordingStatus = document.getElementById('recordingStatus');
const recordingControls = document.getElementById('recordingControls');
const recordingTimer = document.getElementById('recordingTimer');
const refreshBtn = document.getElementById('refreshBtn');
const recordingsList = document.getElementById('recordingsList');
const noRecordings = document.getElementById('noRecordings');

document.addEventListener('DOMContentLoaded', () => {
  loadRecordings();
  setupEventListeners();
  console.log('🚀 App initialized');
  
  setTimeout(() => checkPermissions(), 1000);
});

function setupEventListeners() {
  startBtn.addEventListener('click', startMonitoring);
  stopBtn.addEventListener('click', stopMonitoring);
  checkPermissionsBtn.addEventListener('click', checkPermissions);
  refreshBtn.addEventListener('click', loadRecordings);
  
  window.electronAPI.onMonitoringStatus((data) => {
    updateMonitoringStatus(data);
  });
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    backgroundColor: type === 'success' ? '#4ade80' : 
                     type === 'error' ? '#f87171' : 
                     '#fbbf24',
    color: '#000000',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '10000',
    maxWidth: '400px',
    fontSize: '0.9rem',
    fontWeight: '600',
    animation: 'slideIn 0.3s ease-out',
    cursor: 'pointer'
  });
  
  document.body.appendChild(notification);
  
  notification.addEventListener('click', () => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  });
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function showPersistentNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type} notification-persistent`;
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    display: inline-block;
    width: 16px;
    height: 16px;
    margin-left: 10px;
    border: 2px solid rgba(0,0,0,0.1);
    border-top: 2px solid #000;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  
  notification.appendChild(messageSpan);
  notification.appendChild(spinner);
  
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '16px 24px',
    backgroundColor: type === 'success' ? '#4ade80' : 
                     type === 'error' ? '#f87171' : 
                     '#fbbf24',
    color: '#000000',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: '10001',
    maxWidth: '500px',
    fontSize: '0.95rem',
    fontWeight: '700',
    animation: 'slideIn 0.3s ease-out',
    border: '3px solid rgba(0,0,0,0.2)'
  });
  
  // Add spinning animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  return notification;
}

async function checkPermissions() {
  try {
    console.log('🔍 Checking permissions...');
    permissionsStatus.innerHTML = '<div style="text-align: center; font-size: 0.75rem; color: var(--text-secondary);">Checking...</div>';
    
    const permissions = await window.electronAPI.requestPermissions();
    
    if (permissions.error) {
      permissionsStatus.innerHTML = `<div style="color: var(--accent-red); font-size: 0.75rem;">Error: ${permissions.error}</div>`;
      return;
    }
    
    let html = '<div class="permissions-compact">';
    
    html += `🎤 <span class="${permissions.microphone ? 'permission-granted' : 'permission-denied'}">${permissions.microphone ? '✓' : '✗'}</span>`;
    html += '<span class="permissions-divider">|</span>';
    html += `📷 <span class="${permissions.camera ? 'permission-granted' : 'permission-denied'}">${permissions.camera ? '✓' : '✗'}</span>`;
    html += '<span class="permissions-divider">|</span>';
    html += `🖥️ <span class="${permissions.screen ? 'permission-granted' : 'permission-denied'}">${permissions.screen ? '✓' : '✗'}</span>`;
    
    if (permissions.microphone && permissions.camera && permissions.screen) {
      html += '<span class="permissions-divider">|</span>';
      html += '<span class="permissions-all-granted">All granted</span>';
    }
    
    html += '</div>';
    
    if (permissions.platform === 'win32' && permissions.microphone && permissions.camera && permissions.screen) {
      html += '<div class="windows-instructions">';
      html += '<strong>Windows:</strong> Select "Entire Screen" or WhatsApp window • Check "Share system audio"';
      html += '</div>';
    }
    
    if (permissions.platform === 'darwin' && permissions.needsScreenPermission) {
      html += '<div class="windows-instructions" style="border-left-color: var(--accent-red); color: var(--accent-red); font-weight: 600;">';
      html += '⚠️ macOS: Grant Screen Recording permission in System Settings • Restart app';
      html += '</div>';
    } else if (!permissions.microphone || !permissions.camera) {
      html += '<div class="windows-instructions" style="border-left-color: var(--accent-red);">';
      html += '⚠️ Missing permissions • Click buttons above to grant';
      html += '</div>';
    }
    
    permissionsStatus.innerHTML = html;
    
  } catch (error) {
    console.error('❌ Error checking permissions:', error);
    permissionsStatus.innerHTML = `<div style="color: var(--accent-red); font-size: 0.75rem;">Error: ${error.message}</div>`;
  }
}

async function openPermissionSettings(type) {
  try {
    await window.electronAPI.openSystemPreferences(type);
    setTimeout(() => checkPermissions(), 2000);
  } catch (error) {
    console.error('Error opening settings:', error);
    showNotification('❌ No screen sources available! Check permissions.', 'error');
  }
}

async function startMonitoring() {
  try {
    console.log('🚀 Starting monitoring...');
    
    const permissions = await window.electronAPI.requestPermissions();
    
    const missingPermissions = [];
    
    if (!permissions.microphone) missingPermissions.push('Microphone');
    if (!permissions.camera) missingPermissions.push('Camera');
    if (!permissions.screen) missingPermissions.push('Screen Recording');
    
    if (missingPermissions.length > 0) {
      alert('❌ Missing Required Permissions:\n\n' + 
            missingPermissions.join(', ') + 
            '\n\nPlease grant all permissions and restart the app.');
      return;
    }
    
    await window.electronAPI.startMonitoring();
    isMonitoring = true;
    
    wasInCall = false;
    isCurrentlyRecording = false;
    recordingStartScheduled = false;
    recordingLock = false;
    pendingSave = false;
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    statusIndicator.classList.add('active');
    statusIndicator.querySelector('.status-text').textContent = 'Monitoring';
    
    console.log('✅ Monitoring started');
  } catch (error) {
    console.error('❌ Error starting monitoring:', error);
    alert('Failed to start monitoring: ' + error.message);
  }
}

async function stopMonitoring() {
  try {
    console.log('🛑 Stopping monitoring...');
    
    // Cancel any grace period
    if (callEndGracePeriod) {
      clearTimeout(callEndGracePeriod);
      callEndGracePeriod = null;
    }
    
    // If recording, stop and wait for save
    if (isCurrentlyRecording && mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('⏹️ Stopping active recording...');
      pendingSave = true;
      mediaRecorder.stop();
      
      // Wait for save to complete
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!pendingSave && !isCurrentlyRecording) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 15000);
      });
    }
    
    await window.electronAPI.stopMonitoring();
    isMonitoring = false;
    
    wasInCall = false;
    isCurrentlyRecording = false;
    recordingStartScheduled = false;
    recordingLock = false;
    pendingSave = false;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    statusIndicator.classList.remove('active', 'recording');
    statusIndicator.querySelector('.status-text').textContent = 'Idle';
    
    recordingControls.style.display = 'none';
    
    console.log('✅ Monitoring stopped');
  } catch (error) {
    console.error('❌ Error stopping monitoring:', error);
  }
}

function updateMonitoringStatus(data) {
  // Extract participant name from window title ONLY during active call
  let participantName = '';
  if (data.inCall && data.windowName) {
    const windowTitle = data.windowName;
    
    // Try to extract name from common patterns
    if (windowTitle.includes('WhatsApp') && windowTitle.includes('-')) {
      const parts = windowTitle.split('-');
      if (parts.length > 1) {
        let name = parts[1].trim();
        // Remove common suffixes
        name = name.replace(/\s*(Video|Voice|Audio)?\s*Call.*$/i, '').trim();
        if (name && name.toLowerCase() !== 'whatsapp') {
          participantName = ` (${name})`;
        }
      }
    } else if (windowTitle.toLowerCase().includes('call with')) {
      let name = windowTitle.replace(/.*call with\s*/i, '').trim();
      if (name) {
        participantName = ` (${name})`;
      }
    } else if (windowTitle.toLowerCase().includes('video call') || windowTitle.toLowerCase().includes('voice call')) {
      // Extract name before "Video Call" or "Voice Call"
      let name = windowTitle.replace(/\s*-?\s*(Video|Voice|Audio)\s*Call.*/i, '').replace('WhatsApp', '').trim();
      if (name && name !== '') {
        participantName = ` (${name})`;
      }
    }
  }
  
  whatsappStatus.textContent = data.whatsappRunning ? `Running ✓${participantName}` : 'Not Running ✗';
  whatsappStatus.style.color = data.whatsappRunning ? 'var(--accent-primary)' : 'var(--accent-danger)';
  
  const confidenceEmoji = data.confidence >= 3 ? '🟢' : data.confidence >= 2 ? '🟡' : '🔴';
  callStatus.textContent = data.inCall ? 
    `Active Call ✓ ${confidenceEmoji}` : 
    'No Call';
  callStatus.style.color = data.inCall ? 'var(--accent-primary)' : 'var(--text-secondary)';
  
  recordingStatus.textContent = isCurrentlyRecording ? 'Recording ⏺' : 'Not Recording';
  recordingStatus.style.color = isCurrentlyRecording ? 'var(--accent-danger)' : 'var(--text-secondary)';
  
  if (!isMonitoring) return;
  
  // CRITICAL FIX: Handle call end - stop immediately, no grace period
  if (!data.inCall && wasInCall && isCurrentlyRecording) {
    console.log('📴 CALL ENDED - Stopping recording immediately');
    wasInCall = false;
    recordingStartScheduled = false;
    
    // Clear any grace period if exists
    if (callEndGracePeriod) {
      clearTimeout(callEndGracePeriod);
      callEndGracePeriod = null;
    }
    
    // Stop recording now
    stopRecording();
    return;
  }
  
  // Reset wasInCall if call ended but we weren't recording
  if (!data.inCall && wasInCall && !isCurrentlyRecording) {
    console.log('📴 CALL ENDED (not recording)');
    wasInCall = false;
    recordingStartScheduled = false;
    if (callEndGracePeriod) {
      clearTimeout(callEndGracePeriod);
      callEndGracePeriod = null;
    }
  }
  
  // Auto-start recording when call is detected
  if (data.inCall && !wasInCall && !isCurrentlyRecording && !recordingStartScheduled && !recordingLock && autoRecordingEnabled && !pendingSave) {
    console.log('📞 CALL DETECTED - Scheduling recording');
    wasInCall = true;
    recordingStartScheduled = true;
    recordingControls.style.display = 'block';
    
    setTimeout(() => {
      if (wasInCall && !isCurrentlyRecording && !recordingLock && !pendingSave) {
        console.log('▶️ Auto-starting recording');
        recordingStartScheduled = false;
        startRecording();
      } else {
        recordingStartScheduled = false;
      }
    }, 2000);
  }
  
  // Update wasInCall state for ongoing calls
  if (data.inCall) {
    wasInCall = true;
  }
  
  // Show/hide recording controls
  if (data.inCall || isCurrentlyRecording) {
    recordingControls.style.display = 'block';
  } else {
    recordingControls.style.display = 'none';
  }
}

async function startRecording() {
  if (recordingLock || isCurrentlyRecording || pendingSave) {
    console.log('⚠️ Recording already in progress or pending save');
    return;
  }
  
  recordingLock = true;
  
  try {
    console.log('🎬 Starting recording...');
    console.log('═══════════════════════════════════════');
    
    let micStream = null;
    try {
      console.log('🎤 Step 1: Requesting microphone access...');
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 1
        },
        video: false
      });
      
      const micTrack = micStream.getAudioTracks()[0];
      console.log('✅ Microphone acquired!');
      console.log('  Settings:', micTrack.getSettings());
      console.log('  Label:', micTrack.label);
    } catch (micError) {
      console.error('❌ Microphone failed:', micError);
      const continueWithout = confirm(
        '⚠️ Could not access microphone!\n\n' +
        'Your voice will NOT be recorded.\n\n' +
        'Continue with participants\' audio only?'
      );
      if (!continueWithout) {
        recordingLock = false;
        return;
      }
    }
    
    console.log('🔍 Step 2: Finding WhatsApp call window...');
    const sources = await window.electronAPI.getSources();
    
    if (sources.length === 0) {
      alert('❌ No screen sources available!\n\nCheck permissions.');
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    const selectedSource = sources.find(s => {
      const name = s.name.toLowerCase();
      return (name.includes('whatsapp') || name.includes('call')) && 
             !name.includes('call recorder') && 
             !name.includes('electron') && 
             !name.includes('chrome');
    });

    if (!selectedSource) {
      showNotification('❌ WhatsApp call window not found! Make sure you have an active call.', 'error');
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    console.log('✅ Found window:', selectedSource.name);
    
    console.log('🖥️ Step 3: Capturing screen WITH system audio...');
    
    let videoStream;
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
            googHighpassFilter: false
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            minFrameRate: 15,
            maxFrameRate: 30
          }
        }
      });
      console.log('✅ Screen capture acquired!');
      
    } catch (error) {
      console.error('❌ Screen capture failed:', error);
      showNotification('❌ Failed to capture screen: ' + error.message, 'error');
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    const videoTracks = videoStream.getVideoTracks();
    const systemAudioTracks = videoStream.getAudioTracks();
    
    console.log('📊 Stream Analysis:');
    console.log('  Video tracks:', videoTracks.length);
    console.log('  System audio tracks:', systemAudioTracks.length);
    
    if (videoTracks.length === 0) {
      showNotification('❌ No video track captured!', 'error');
      videoStream.getTracks().forEach(t => t.stop());
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    if (systemAudioTracks.length === 0) {
      console.error('❌ NO SYSTEM AUDIO DETECTED!');
      
      const continueWithout = confirm(
        '❌ CRITICAL: System audio NOT captured!\n\n' +
        'Participants\' voices will NOT be recorded!\n\n' +
        'To fix:\n' +
        '1. Click Cancel\n' +
        '2. Start recording again\n' +
        '3. CHECK "Share system audio" box\n' +
        '4. Select "Entire Screen" or WhatsApp window\n' +
        '\n\nContinue WITHOUT participants\' audio?'
      );
      
      if (!continueWithout) {
        videoStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        recordingLock = false;
        return;
      }
    }
    
    console.log('🎚️ Step 4: Mixing audio streams...');
    audioContext = new AudioContext({ sampleRate: 48000 });
    audioDestination = audioContext.createMediaStreamDestination();
    
    let audioSourcesConnected = 0;
    
    if (systemAudioTracks.length > 0) {
      try {
        const systemAudioStream = new MediaStream(systemAudioTracks);
        const systemSource = audioContext.createMediaStreamSource(systemAudioStream);
        const systemGain = audioContext.createGain();
        systemGain.gain.value = 2.0;
        
        systemSource.connect(systemGain);
        systemGain.connect(audioDestination);
        
        console.log('✅ System audio connected');
        audioSourcesConnected++;
      } catch (err) {
        console.error('❌ Failed to connect system audio:', err);
      }
    }
    
    if (micStream) {
      try {
        const micSource = audioContext.createMediaStreamSource(micStream);
        const micGain = audioContext.createGain();
        micGain.gain.value = 1.5;
        
        micSource.connect(micGain);
        micGain.connect(audioDestination);
        
        console.log('✅ Microphone connected');
        audioSourcesConnected++;
      } catch (err) {
        console.error('❌ Failed to connect microphone:', err);
      }
    }
    
    if (audioSourcesConnected === 0) {
      showNotification('❌ No audio sources available!', 'error');
      videoStream.getTracks().forEach(t => t.stop());
      if (audioContext) audioContext.close();
      recordingLock = false;
      return;
    }
    
    currentStream = new MediaStream();
    videoTracks.forEach(track => currentStream.addTrack(track));
    audioDestination.stream.getAudioTracks().forEach(track => currentStream.addTrack(track));
    
    const supportedTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ];
    
    let selectedType = 'video/webm';
    for (const type of supportedTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }
    
    const options = { 
      mimeType: selectedType,
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 256000
    };
    
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(currentStream, options);
    
    mediaRecorder._videoStream = videoStream;
    mediaRecorder._micStream = micStream;
    mediaRecorder._audioContext = audioContext;
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('⏹️ MediaRecorder stopped');
      pendingSave = true;
      
      if (recordedChunks.length === 0) {
        console.error('❌ No chunks recorded!');
        showNotification('❌ No data recorded!', 'error');
        cleanupStream();
        isCurrentlyRecording = false;
        recordingLock = false;
        pendingSave = false;
        return;
      }
      
      try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        
        if (blob.size < 1000) {
          showNotification('❌ Recording too small!', 'error');
          cleanupStream();
          isCurrentlyRecording = false;
          recordingLock = false;
          pendingSave = false;
          return;
        }
        
        const buffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
        const filename = `WhatsApp_Call_${timestamp}.webm`;
        
        // Show conversion progress notification
        const conversionNotif = showPersistentNotification(
          '⏳ Converting to MP4... Please wait, do not close the app!',
          'info'
        );
        
        recordingStatus.textContent = 'Converting to MP4 ⏳';
        recordingStatus.style.color = 'var(--accent-warning)';
        
        // Estimate conversion time (rough estimate: 1 second per MB)
        const estimatedSeconds = Math.ceil(blob.size / 1024 / 1024);
        let countdown = estimatedSeconds;
        
        const countdownInterval = setInterval(() => {
          if (countdown > 0) {
            recordingStatus.textContent = `Converting to MP4... ~${countdown}s ⏳`;
            countdown--;
          }
        }, 1000);
        
        const saved = await window.electronAPI.saveRecording(uint8Array, filename);
        
        clearInterval(countdownInterval);
        conversionNotif.remove();
        
        if (saved) {
          recordingStatus.textContent = 'Not Recording';
          recordingStatus.style.color = 'var(--text-secondary)';
          
          const savedFilename = saved.split(/[/\\]/).pop();
          showNotification(`✅ Saved as MP4! (${sizeMB} MB)`, 'success');
          loadRecordings();
        } else {
          throw new Error('Save failed');
        }
      } catch (saveError) {
        console.error('❌ Save failed:', saveError);
        showNotification('❌ Failed to save: ' + saveError.message, 'error');
        recordingStatus.textContent = 'Save Failed ❌';
        recordingStatus.style.color = 'var(--accent-danger)';
      } finally {
        cleanupStream();
        window.electronAPI.recordingStopped();
        isCurrentlyRecording = false;
        recordingLock = false;
        pendingSave = false;
      }
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('❌ MediaRecorder error:', event.error);
      cleanupStream();
      isCurrentlyRecording = false;
      recordingLock = false;
      pendingSave = false;
    };
    
    mediaRecorder.start(1000);
    recordingStartTime = Date.now();
    isCurrentlyRecording = true;
    
    statusIndicator.classList.add('recording');
    statusIndicator.querySelector('.status-text').textContent = 'Recording';
    
    startTimer();
    window.electronAPI.recordingStarted();
    
    console.log('✅ Recording started successfully!');
    
  } catch (error) {
    console.error('❌ Recording failed:', error);
    cleanupStream();
    isCurrentlyRecording = false;
    recordingLock = false;
    pendingSave = false;
  }
}

function stopRecording() {
  console.log('⏹️ stopRecording() called');
  
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    console.log('⚠️ No active recording to stop');
    return;
  }
  
  console.log('✅ Stopping mediaRecorder...');
  mediaRecorder.stop();
  
  statusIndicator.classList.remove('recording');
  if (isMonitoring) {
    statusIndicator.querySelector('.status-text').textContent = 'Monitoring';
  }
  stopTimer();
}

function cleanupStream() {
  console.log('🧹 Cleaning up streams...');
  
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  
  if (mediaRecorder) {
    if (mediaRecorder._videoStream) {
      mediaRecorder._videoStream.getTracks().forEach(t => t.stop());
    }
    if (mediaRecorder._micStream) {
      mediaRecorder._micStream.getTracks().forEach(t => t.stop());
    }
    if (mediaRecorder._audioContext && mediaRecorder._audioContext.state !== 'closed') {
      mediaRecorder._audioContext.close();
    }
  }
  
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  
  audioDestination = null;
}

function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  recordingTimer.textContent = '00:00:00';
  recordingStartTime = null;
}

function updateTimerDisplay() {
  if (!recordingStartTime) return;
  
  const elapsed = Date.now() - recordingStartTime;
  const seconds = Math.floor(elapsed / 1000) % 60;
  const minutes = Math.floor(elapsed / 60000) % 60;
  const hours = Math.floor(elapsed / 3600000);
  
  recordingTimer.textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function loadRecordings() {
  try {
    const recordings = await window.electronAPI.getRecordings();
    
    if (recordings.length === 0) {
      recordingsList.innerHTML = '';
      noRecordings.style.display = 'flex';
    } else {
      noRecordings.style.display = 'none';
      renderRecordings(recordings);
    }
  } catch (error) {
    console.error('❌ Error loading recordings:', error);
  }
}

function renderRecordings(recordings) {
  recordingsList.innerHTML = recordings.map(recording => {
    const date = new Date(recording.date);
    const size = formatFileSize(recording.size);
    const isWebM = recording.name.endsWith('.webm');
    const icon = isWebM ? '🎞️' : '📹';
    
    return `
      <div class="recording-item">
        <div class="recording-info">
          <div class="recording-details">
            <h3>${icon} ${recording.name}</h3>
            <div class="recording-meta">
              <span>📅 ${date.toLocaleDateString()}</span>
              <span>🕐 ${date.toLocaleTimeString()}</span>
              <span>📦 ${size}</span>
            </div>
          </div>
        </div>
        <div class="recording-actions">
          <button class="btn-action" onclick="openRecording('${recording.path.replace(/\\/g, '\\\\')}')">
            ▶ Open
          </button>
          <button class="btn-action" onclick="openFolder('${recording.path.replace(/\\/g, '\\\\')}')">
            📁 Show in Folder
          </button>
          <button class="btn-action btn-danger" onclick="deleteRecording('${recording.name}')">
            🗑 Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function openRecording(path) {
  try {
    const result = await window.electronAPI.openExternal(path);
    if (result && result !== '') {
      alert('Could not open: ' + result);
    }
  } catch (error) {
    alert('Failed to open: ' + error.message);
  }
}

async function openFolder(path) {
  try {
    await window.electronAPI.showItemInFolder(path);
  } catch (error) {
    alert('Failed to open folder: ' + error.message);
  }
}

async function deleteRecording(filename) {
  if (!confirm('Delete this recording?')) return;
  
  try {
    const deleted = await window.electronAPI.deleteRecording(filename);
    if (deleted) {
      loadRecordings();
    } else {
      alert('Failed to delete');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

window.openRecording = openRecording;
window.openFolder = openFolder;
window.deleteRecording = deleteRecording;
window.openPermissionSettings = openPermissionSettings;