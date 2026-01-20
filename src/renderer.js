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

const themeToggle = document.getElementById('themeToggle');
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
  loadTheme();
  loadRecordings();
  setupEventListeners();
  console.log('🚀 App initialized');
  
  setTimeout(() => checkPermissions(), 1000);
});

function loadTheme() {
  const savedTheme = window.localStorage?.getItem('theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.querySelector('.theme-icon').textContent = theme === 'light' ? '🌙' : '☀️';
  try {
    window.localStorage?.setItem('theme', theme);
  } catch (e) {}
}

function toggleTheme() {
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function setupEventListeners() {
  themeToggle.addEventListener('click', toggleTheme);
  startBtn.addEventListener('click', startMonitoring);
  stopBtn.addEventListener('click', stopMonitoring);
  checkPermissionsBtn.addEventListener('click', checkPermissions);
  refreshBtn.addEventListener('click', loadRecordings);
  
  window.electronAPI.onMonitoringStatus((data) => {
    updateMonitoringStatus(data);
  });
}

async function checkPermissions() {
  try {
    console.log('🔍 Checking permissions...');
    permissionsStatus.innerHTML = '<div style="text-align: center;">Checking permissions...</div>';
    
    const permissions = await window.electronAPI.requestPermissions();
    
    if (permissions.error) {
      permissionsStatus.innerHTML = `<div style="color: var(--accent-danger);">Error: ${permissions.error}</div>`;
      return;
    }
    
    let html = '<div style="margin-bottom: 1rem;">';
    
    html += '<div class="permission-item">';
    html += '<span>🎤 Microphone:</span>';
    html += `<span class="${permissions.microphone ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.microphone ? '✓ Granted' : '✗ Denied';
    html += '</span>';
    if (!permissions.microphone) {
      html += '<button onclick="openPermissionSettings(\'microphone\')" style="margin-left: 10px; padding: 4px 8px; font-size: 0.75rem;">Grant Access</button>';
    }
    html += '</div>';
    
    html += '<div class="permission-item">';
    html += '<span>📷 Camera:</span>';
    html += `<span class="${permissions.camera ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.camera ? '✓ Granted' : '✗ Denied';
    html += '</span>';
    if (!permissions.camera) {
      html += '<button onclick="openPermissionSettings(\'camera\')" style="margin-left: 10px; padding: 4px 8px; font-size: 0.75rem;">Grant Access</button>';
    }
    html += '</div>';
    
    html += '<div class="permission-item">';
    html += '<span>🖥️ Screen Recording:</span>';
    html += `<span class="${permissions.screen ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.screen ? '✓ Granted' : '✗ Denied';
    html += '</span>';
    if (!permissions.screen && permissions.platform === 'darwin') {
      html += '<button onclick="openPermissionSettings(\'screen\')" style="margin-left: 10px; padding: 4px 8px; font-size: 0.75rem;">Grant Access</button>';
    }
    html += '</div>';
    
    html += '</div>';
    
    if (permissions.platform === 'darwin' && permissions.needsScreenPermission) {
      html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--accent-danger); color: white; border-radius: 8px; font-size: 0.875rem;">';
      html += '<strong>⚠️ macOS Screen Recording Permission Required</strong><br><br>';
      html += '1. Click "Grant Access" button above<br>';
      html += '2. Find this app in the list<br>';
      html += '3. Check the box next to it<br>';
      html += '4. <strong>RESTART the app</strong><br><br>';
      html += '<strong>⚠️ Without this permission, recording will fail!</strong>';
      html += '</div>';
    } else if (!permissions.microphone || !permissions.camera) {
      html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--accent-warning); color: #000; border-radius: 8px; font-size: 0.875rem;">';
      html += '<strong>⚠️ Missing Permissions</strong><br><br>';
      html += 'Click "Grant Access" buttons above to enable all permissions.<br>';
      html += 'You may need to restart the app after granting permissions.';
      html += '</div>';
    } else if (permissions.microphone && permissions.camera && permissions.screen) {
      html += '<div style="margin-top: 1rem; padding: 1.5rem; background: linear-gradient(135deg, var(--accent-primary), #667eea); color: white; border-radius: 12px; font-size: 0.9rem; line-height: 1.6;">';
      html += '<strong style="font-size: 1.1rem;">✅ All Permissions Granted!</strong><br><br>';
      
      if (permissions.platform === 'darwin') {
        html += '<div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; margin-top: 10px;">';
        html += '<strong>📱 macOS Users - CRITICAL STEP:</strong><br><br>';
        html += '<span style="font-size: 1.05rem;">When you start recording:</span><br>';
        html += '1️⃣ Choose the <strong>WhatsApp call window</strong><br>';
        html += '2️⃣ ⚠️ <strong style="background: #fbbf24; color: #000; padding: 2px 6px; border-radius: 4px;">CHECK "Share system audio"</strong> ⚠️<br>';
        html += '3️⃣ Click "Share"<br><br>';
        html += '<span style="color: #fef3c7;">Without "Share system audio", participants won\'t be recorded!</span>';
        html += '</div>';
      } else {
        html += '<div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; margin-top: 10px;">';
        html += '<strong>💻 Windows Users:</strong><br><br>';
        html += 'When recording starts, select <strong>"Entire Screen"</strong> or the <strong>WhatsApp window</strong><br>';
        html += 'Check <strong>"Share system audio"</strong> to capture participants\' voices!<br><br>';
        html += 'Your microphone will automatically capture your voice.';
        html += '</div>';
      }
      
      html += '</div>';
    }
    
    permissionsStatus.innerHTML = html;
    
  } catch (error) {
    console.error('❌ Error checking permissions:', error);
    permissionsStatus.innerHTML = `<div style="color: var(--accent-danger);">Error: ${error.message}</div>`;
  }
}

async function openPermissionSettings(type) {
  try {
    await window.electronAPI.openSystemPreferences(type);
    
    setTimeout(() => checkPermissions(), 2000);
  } catch (error) {
    console.error('Error opening settings:', error);
    alert('Failed to open system settings: ' + error.message);
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
    
    if (isCurrentlyRecording) {
      await forceStopRecording();
    }
    
    await window.electronAPI.stopMonitoring();
    isMonitoring = false;
    
    wasInCall = false;
    isCurrentlyRecording = false;
    recordingStartScheduled = false;
    recordingLock = false;
    
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
  whatsappStatus.textContent = data.whatsappRunning ? 'Running ✓' : 'Not Running ✗';
  whatsappStatus.style.color = data.whatsappRunning ? 'var(--accent-primary)' : 'var(--accent-danger)';
  
  if (data.windowName) {
    whatsappStatus.textContent = `Running ✓ (${data.windowName})`;
  }
  
  const confidenceEmoji = data.confidence >= 3 ? '🟢' : data.confidence >= 2 ? '🟡' : '🔴';
  callStatus.textContent = data.inCall ? 
    `Active Call ✓ ${confidenceEmoji}` : 
    'No Call';
  callStatus.style.color = data.inCall ? 'var(--accent-primary)' : 'var(--text-secondary)';
  
  recordingStatus.textContent = isCurrentlyRecording ? 'Recording ⏺' : 'Not Recording';
  recordingStatus.style.color = isCurrentlyRecording ? 'var(--accent-danger)' : 'var(--text-secondary)';
  
  if (!isMonitoring) return;
  
  if (data.inCall && !wasInCall && !isCurrentlyRecording && !recordingStartScheduled && !recordingLock && autoRecordingEnabled) {
    console.log('📞 CALL DETECTED - Scheduling recording');
    wasInCall = true;
    recordingStartScheduled = true;
    recordingControls.style.display = 'block';
    
    setTimeout(() => {
      if (wasInCall && !isCurrentlyRecording && !recordingLock) {
        console.log('▶️ Auto-starting recording');
        recordingStartScheduled = false;
        startRecording();
      } else {
        recordingStartScheduled = false;
      }
    }, 3000);
  }
  
  if (!data.inCall && wasInCall) {
    console.log('📴 CALL ENDED');
    wasInCall = false;
    recordingStartScheduled = false;
    
    if (isCurrentlyRecording) {
      stopRecording();
    }
  }
  
  if (data.inCall) {
    wasInCall = true;
  }
  
  if (data.inCall || isCurrentlyRecording) {
    recordingControls.style.display = 'block';
  } else {
    recordingControls.style.display = 'none';
  }
}

async function startRecording() {
  if (recordingLock || isCurrentlyRecording) {
    console.log('⚠️ Recording already in progress');
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
      alert('❌ WhatsApp call window not found!\n\nMake sure you have an active call.\n\nYou can also select "Entire Screen" when prompted.');
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    console.log('✅ Found window:', selectedSource.name);
    
    console.log('🖥️ Step 3: Capturing screen WITH system audio...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT: CHECK "Share system audio"!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
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
      alert('❌ Failed to capture screen:\n\n' + error.message);
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
      alert('❌ No video track captured!');
      videoStream.getTracks().forEach(t => t.stop());
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      recordingLock = false;
      return;
    }
    
    videoTracks.forEach((track, i) => {
      console.log(`  📹 Video ${i}:`, {
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState,
        settings: track.getSettings()
      });
    });
    
    if (systemAudioTracks.length === 0) {
      console.error('❌❌❌ NO SYSTEM AUDIO DETECTED! ❌❌❌');
      console.error('Participants will NOT be recorded!');
      
      const continueWithout = confirm(
        '❌ CRITICAL: System audio NOT captured!\n\n' +
        'Participants\' voices will NOT be recorded!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        'To fix:\n' +
        '1. Click Cancel\n' +
        '2. Start recording again\n' +
        '3. CHECK "Share system audio" box\n' +
        '4. Select "Entire Screen" or WhatsApp window\n' +
        '5. Click Share\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        'Continue WITHOUT participants\' audio?'
      );
      
      if (!continueWithout) {
        videoStream.getTracks().forEach(t => t.stop());
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        recordingLock = false;
        return;
      }
      console.log('⚠️ User chose to continue without system audio');
    } else {
      console.log('✅ System audio DETECTED!');
      systemAudioTracks.forEach((track, i) => {
        console.log(`  🔊 System Audio ${i}:`, {
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          settings: track.getSettings()
        });
      });
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
        
        console.log('✅ System audio connected (Gain: 2.0x)');
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
        
        console.log('✅ Microphone connected (Gain: 1.5x)');
        audioSourcesConnected++;
      } catch (err) {
        console.error('❌ Failed to connect microphone:', err);
      }
    }
    
    console.log(`📊 Total audio sources mixed: ${audioSourcesConnected}`);
    
    if (audioSourcesConnected === 0) {
      alert('❌ No audio sources available!\n\nCannot record without audio.');
      videoStream.getTracks().forEach(t => t.stop());
      if (audioContext) audioContext.close();
      recordingLock = false;
      return;
    }
    
    console.log('🎬 Step 5: Creating final recording stream...');
    currentStream = new MediaStream();
    
    videoTracks.forEach(track => {
      currentStream.addTrack(track);
      console.log('➕ Added video track');
    });
    
    const mixedAudioTracks = audioDestination.stream.getAudioTracks();
    mixedAudioTracks.forEach(track => {
      currentStream.addTrack(track);
      console.log('➕ Added mixed audio track');
    });
    
    console.log('📊 Final stream composition:');
    console.log('  Video tracks:', currentStream.getVideoTracks().length);
    console.log('  Audio tracks:', currentStream.getAudioTracks().length);
    
    currentStream.getAudioTracks().forEach((track, i) => {
      console.log(`  🎵 Final Audio ${i}:`, {
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState,
        settings: track.getSettings()
      });
    });
    
    console.log('📹 Step 6: Setting up MediaRecorder...');
    
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
        console.log('✅ Using codec:', type);
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
        console.log(`📦 Chunk ${recordedChunks.length}: ${event.data.size} bytes`);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('⏹️ Recording stopped');
      console.log('═══════════════════════════════════════');
      
      if (recordedChunks.length === 0) {
        alert('❌ No data recorded!\n\nPlease try again.');
        cleanupStream();
        isCurrentlyRecording = false;
        recordingLock = false;
        return;
      }
      
      try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        console.log('📦 Recording details:');
        console.log('  Total chunks:', recordedChunks.length);
        console.log('  Total size:', sizeMB, 'MB');
        
        if (blob.size < 1000) {
          alert('❌ Recording too small!\n\nAudio/video may not have been captured.');
          cleanupStream();
          isCurrentlyRecording = false;
          recordingLock = false;
          return;
        }
        
        const buffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
        const filename = `WhatsApp_Call_${timestamp}.webm`;
        
        recordingStatus.textContent = 'Saving recording... ⏳';
        recordingStatus.style.color = 'var(--accent-warning)';
        
        console.log('💾 Saving:', filename);
        
        const saved = await window.electronAPI.saveRecording(uint8Array, filename);
        
        if (saved) {
          console.log('✅ Saved successfully:', saved);
          recordingStatus.textContent = 'Not Recording';
          recordingStatus.style.color = 'var(--text-secondary)';
          
          const fileExt = saved.endsWith('.mp4') ? 'MP4' : 'WebM';
          const savedFilename = saved.split(/[/\\]/).pop();
          
          alert(`✅ Recording saved as ${fileExt}! (${sizeMB} MB)\n\n${savedFilename}`);
          loadRecordings();
        } else {
          throw new Error('Save returned null');
        }
      } catch (saveError) {
        console.error('❌ Save failed:', saveError);
        alert('❌ Failed to save:\n\n' + saveError.message);
        recordingStatus.textContent = 'Failed ❌';
        recordingStatus.style.color = 'var(--accent-danger)';
      }
      
      cleanupStream();
      window.electronAPI.recordingStopped();
      isCurrentlyRecording = false;
      recordingLock = false;
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('❌ MediaRecorder error:', event.error);
      alert('❌ Recording error:\n\n' + event.error.message);
      cleanupStream();
      isCurrentlyRecording = false;
      recordingLock = false;
    };
    
    console.log('🔴 STARTING RECORDING NOW!');
    mediaRecorder.start(1000);
    recordingStartTime = Date.now();
    isCurrentlyRecording = true;
    
    statusIndicator.classList.add('recording');
    statusIndicator.querySelector('.status-text').textContent = 'Recording';
    
    startTimer();
    window.electronAPI.recordingStarted();
    
    console.log('═══════════════════════════════════════');
    console.log('✅ Recording started successfully!');
    console.log('🎙️ Active sources:');
    if (systemAudioTracks.length > 0) console.log('  ✅ System audio (participants)');
    if (micStream) console.log('  ✅ Microphone (you)');
    console.log('═══════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Recording failed:', error);
    console.error('Stack:', error.stack);
    alert('❌ Failed to start recording:\n\n' + error.message);
    cleanupStream();
    isCurrentlyRecording = false;
    recordingLock = false;
  }
}

function stopRecording() {
  console.log('⏹️ Stopping recording...');
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    statusIndicator.classList.remove('recording');
    if (isMonitoring) {
      statusIndicator.querySelector('.status-text').textContent = 'Monitoring';
    }
    stopTimer();
  }
}

async function forceStopRecording() {
  console.log('🛑 Force stopping recording...');
  
  if (mediaRecorder) {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
  }
  
  cleanupStream();
  stopTimer();
  
  isCurrentlyRecording = false;
  recordingLock = false;
  recordingStartScheduled = false;
  
  statusIndicator.classList.remove('recording');
  recordingStatus.textContent = 'Not Recording';
  recordingStatus.style.color = 'var(--text-secondary)';
}

function cleanupStream() {
  console.log('🧹 Cleaning up streams...');
  
  if (currentStream) {
    currentStream.getTracks().forEach(track => {
      track.stop();
      console.log('🛑 Stopped:', track.kind, track.label);
    });
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
  
  console.log('✅ Cleanup complete');
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