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
});

function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
}

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.querySelector('.theme-icon').textContent = theme === 'light' ? '🌙' : '☀️';
  localStorage.setItem('theme', theme);
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
    console.log('Checking permissions...');
    permissionsStatus.innerHTML = '<div style="text-align: center;">Checking permissions...</div>';
    
    const permissions = await window.electronAPI.requestPermissions();
    console.log('Permissions received:', permissions);
    
    if (permissions.error) {
      permissionsStatus.innerHTML = `<div style="color: var(--accent-danger);">Error: ${permissions.error}</div>`;
      return;
    }
    
    let html = '<div class="permission-item">';
    html += '<span>Microphone:</span>';
    html += `<span class="${permissions.microphone ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.microphone ? '✓ Granted' : '✗ Denied';
    html += '</span></div>';
    
    html += '<div class="permission-item">';
    html += '<span>Camera:</span>';
    html += `<span class="${permissions.camera ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.camera ? '✓ Granted' : '✗ Denied';
    html += '</span></div>';
    
    html += '<div class="permission-item">';
    html += '<span>Screen Recording:</span>';
    html += `<span class="${permissions.screen ? 'permission-granted' : 'permission-denied'}">`;
    html += permissions.screen ? '✓ Granted' : '✗ Denied';
    html += '</span></div>';
    
    if (permissions.needsScreenPermission) {
      html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--accent-warning); color: #000; border-radius: 8px; font-size: 0.875rem;">';
      html += '<strong>⚠️ Screen Recording Permission Required</strong><br><br>';
      html += '<strong>Steps:</strong><br>';
      html += '1. Open System Preferences<br>';
      html += '2. Go to Security & Privacy → Privacy<br>';
      html += '3. Select "Screen Recording" from the left<br>';
      html += '4. Check the box next to this app<br>';
      html += '5. RESTART this application<br>';
      html += '</div>';
    } else if (permissions.microphone && permissions.camera && permissions.screen) {
      html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--accent-primary); color: white; border-radius: 8px; font-size: 0.875rem;">';
      html += '✓ All permissions granted! You can start monitoring.';
      html += '</div>';
    }
    
    permissionsStatus.innerHTML = html;
    console.log('Permissions display updated');
    
  } catch (error) {
    console.error('Error checking permissions:', error);
    permissionsStatus.innerHTML = `<div style="color: var(--accent-danger);">Error checking permissions: ${error.message}</div>`;
  }
}

async function startMonitoring() {
  try {
    const permissions = await window.electronAPI.requestPermissions();
    
    if (!permissions.screen) {
      alert('Screen recording permission is required. Please grant permission in System Preferences and restart the app.');
      return;
    }
    
    await window.electronAPI.startMonitoring();
    isMonitoring = true;
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    statusIndicator.classList.add('active');
    statusIndicator.querySelector('.status-text').textContent = 'Monitoring';
    
    console.log('Monitoring started successfully');
  } catch (error) {
    console.error('Error starting monitoring:', error);
    alert('Failed to start monitoring: ' + error.message);
  }
}

async function stopMonitoring() {
  try {
    await window.electronAPI.stopMonitoring();
    isMonitoring = false;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    statusIndicator.classList.remove('active', 'recording');
    statusIndicator.querySelector('.status-text').textContent = 'Idle';
    
    recordingControls.style.display = 'none';
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    }
    
    console.log('Monitoring stopped');
  } catch (error) {
    console.error('Error stopping monitoring:', error);
  }
}

function updateMonitoringStatus(data) {
  console.log('Status update:', data);
  
  whatsappStatus.textContent = data.whatsappRunning ? 'Running ✓' : 'Not Running ✗';
  whatsappStatus.style.color = data.whatsappRunning ? 'var(--accent-primary)' : 'var(--accent-danger)';
  
  if (data.windowName) {
    whatsappStatus.textContent = `Running ✓ (${data.windowName})`;
  }
  
  callStatus.textContent = data.inCall ? 'Active Call ✓' : 'No Call';
  callStatus.style.color = data.inCall ? 'var(--accent-primary)' : 'var(--text-secondary)';
  
  recordingStatus.textContent = isCurrentlyRecording ? 'Recording ⏺' : 'Not Recording';
  recordingStatus.style.color = isCurrentlyRecording ? 'var(--accent-danger)' : 'var(--text-secondary)';
  
  if (data.inCall && !wasInCall && !isCurrentlyRecording && !recordingStartScheduled && isMonitoring) {
    console.log('🚀 CALL STARTED - Initiating auto-record');
    wasInCall = true;
    recordingStartScheduled = true;
    recordingControls.style.display = 'block';
    
    setTimeout(() => {
      if (wasInCall && !isCurrentlyRecording) {
        console.log('▶️ Starting recording NOW');
        recordingStartScheduled = false;
        startRecording();
      } else {
        recordingStartScheduled = false;
      }
    }, 2000);
  }
  
  if (!data.inCall && wasInCall && isCurrentlyRecording) {
    console.log('🛑 CALL ENDED - Stopping recording');
    wasInCall = false;
    recordingStartScheduled = false;
    stopRecording();
  }
  
  if (!data.inCall && !isCurrentlyRecording) {
    wasInCall = false;
    recordingStartScheduled = false;
  }
  
  if (data.inCall || isCurrentlyRecording) {
    recordingControls.style.display = 'block';
  } else {
    recordingControls.style.display = 'none';
  }
}

async function startRecording() {
  try {
    console.log('Starting recording...');
    
    const sources = await window.electronAPI.getSources();
    console.log('Available sources:', sources.length);
    
    if (sources.length === 0) {
      alert('No screen sources available. Please check permissions.');
      return;
    }
    
    const selectedSource = sources.find(s => {
      const name = s.name.toLowerCase();
      return (
        name.includes('whatsapp') &&
        !name.includes('call recorder') &&
        !name.includes('electron') &&
        !name.includes('chrome') &&
        !name.includes('screen') &&
        !name.includes('entire')
      );
    });

    if (!selectedSource) {
      alert('WhatsApp call window not found.\nStart a WhatsApp video call first.');
      return;
    }
    
    console.log('Selected source:', selectedSource.name);
    
    let audioStream;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch (audioError) {
      console.warn('Could not get audio stream:', audioError);
      audioStream = null;
    }
    
    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
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
    
    currentStream = new MediaStream();
    
    videoStream.getVideoTracks().forEach(track => {
      currentStream.addTrack(track);
      console.log('Added video track');
    });
    
    if (audioStream) {
      audioStream.getAudioTracks().forEach(track => {
        currentStream.addTrack(track);
        console.log('Added audio track');
      });
    }
    
    console.log('Stream tracks:', currentStream.getTracks().length);
    
    const options = { 
      mimeType: 'video/webm;codecs=h264,opus',
      videoBitsPerSecond: 2500000
    };
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
      console.log('H264 not supported, using VP8');
    }
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
      console.log('Using default WebM codec');
    }
    
    console.log('Using codec:', options.mimeType);
    
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(currentStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log('Data chunk received:', event.data.size, 'bytes');
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('Recording stopped, processing...');
      
      if (recordedChunks.length === 0) {
        alert('No data was recorded. Please check permissions and try again.');
        cleanupStream();
        isCurrentlyRecording = false;
        return;
      }
      
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('Created blob:', blob.size, 'bytes');
      
      const buffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
      const filename = `WhatsApp_Call_${timestamp}.mp4`;
      
      console.log('Saving and converting recording as:', filename);
      
      // Show conversion message
      recordingStatus.textContent = 'Converting to MP4...';
      recordingStatus.style.color = 'var(--accent-warning)';
      
      const saved = await window.electronAPI.saveRecording(uint8Array, filename);
      
      if (saved) {
        console.log('Recording saved successfully to:', saved);
        recordingStatus.textContent = 'Not Recording';
        recordingStatus.style.color = 'var(--text-secondary)';
        loadRecordings();
      } else {
        alert('Failed to save recording');
        recordingStatus.textContent = 'Not Recording';
        recordingStatus.style.color = 'var(--text-secondary)';
      }
      
      cleanupStream();
      window.electronAPI.recordingStopped();
      isCurrentlyRecording = false;
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      alert('Recording error: ' + event.error);
      cleanupStream();
      isCurrentlyRecording = false;
    };
    
    mediaRecorder.start(1000);
    recordingStartTime = Date.now();
    isCurrentlyRecording = true;
    
    statusIndicator.classList.add('recording');
    statusIndicator.querySelector('.status-text').textContent = 'Recording';
    
    startTimer();
    window.electronAPI.recordingStarted();
    
    console.log('Recording started successfully');
    
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Failed to start recording: ' + error.message + '\n\nMake sure screen recording permission is granted in System Preferences.');
    cleanupStream();
    isCurrentlyRecording = false;
  }
}

function stopRecording() {
  console.log('Stopping recording...');
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    
    statusIndicator.classList.remove('recording');
    if (isMonitoring) {
      statusIndicator.querySelector('.status-text').textContent = 'Monitoring';
    }
    
    stopTimer();
  }
}

function cleanupStream() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => {
      track.stop();
      console.log('Stopped track:', track.kind);
    });
    currentStream = null;
  }
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
    console.error('Error loading recordings:', error);
  }
}

function renderRecordings(recordings) {
  recordingsList.innerHTML = recordings.map(recording => {
    const date = new Date(recording.date);
    const size = formatFileSize(recording.size);
    
    return `
      <div class="recording-item">
        <div class="recording-info">
          <div class="recording-details">
            <h3>📹 ${recording.name}</h3>
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
    console.log('Opening recording:', path);
    const result = await window.electronAPI.openExternal(path);
    console.log('Open result:', result);
    
    if (result && result !== '') {
      console.error('Error opening file:', result);
      alert('Could not open the recording. Error: ' + result);
    }
  } catch (error) {
    console.error('Error opening recording:', error);
    alert('Failed to open recording: ' + error.message);
  }
}

async function openFolder(path) {
  try {
    console.log('Opening folder for:', path);
    await window.electronAPI.showItemInFolder(path);
  } catch (error) {
    console.error('Error opening folder:', error);
    alert('Failed to open folder: ' + error.message);
  }
}

async function deleteRecording(filename) {
  if (!confirm('Are you sure you want to delete this recording?')) {
    return;
  }
  
  try {
    const deleted = await window.electronAPI.deleteRecording(filename);
    if (deleted) {
      alert('Recording deleted successfully');
      loadRecordings();
    } else {
      alert('Failed to delete recording');
    }
  } catch (error) {
    console.error('Error deleting recording:', error);
    alert('Failed to delete recording');
  }
}

window.openRecording = openRecording;
window.openFolder = openFolder;
window.deleteRecording = deleteRecording;