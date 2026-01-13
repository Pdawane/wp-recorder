let mediaRecorder;
let recordedChunks = [];
let isMonitoring = false;
let isRecording = false;
let currentSource = null;
let startTime;
let timerInterval;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const folderBtn = document.getElementById('folderBtn');
const refreshBtn = document.getElementById('refreshBtn');
const openPreferencesBtn = document.getElementById('openPreferencesBtn');
const recheckBtn = document.getElementById('recheckBtn');
const permissionWarning = document.getElementById('permissionWarning');
const statusCard = document.getElementById('statusCard');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const statusSubtext = document.getElementById('statusSubtext');
const recordingTimer = document.getElementById('recordingTimer');
const recordingsList = document.getElementById('recordingsList');

// Check permissions on startup
checkPermissions();

// Load recordings on startup
loadRecordings();

// Check permissions
async function checkPermissions() {
  const permissions = await window.electronAPI.checkPermissions();
  
  if (permissions.platform === 'darwin') {
    if (!permissions.screen || !permissions.microphone) {
      permissionWarning.classList.remove('hidden');
      startBtn.disabled = true;
      
      let missing = [];
      if (!permissions.screen) missing.push('Screen Recording');
      if (!permissions.microphone) missing.push('Microphone');
      
      permissionWarning.querySelector('.warning-content div:last-child').textContent = 
        `${missing.join(' and ')} permission${missing.length > 1 ? 's' : ''} needed to record calls`;
    } else {
      permissionWarning.classList.add('hidden');
      startBtn.disabled = false;
    }
  }
}

// Open system preferences
openPreferencesBtn.addEventListener('click', async () => {
  await window.electronAPI.openSystemPreferences();
  alert('Please enable "WhatsApp Call Recorder" in Screen Recording settings, then click Recheck');
});

// Recheck permissions
recheckBtn.addEventListener('click', async () => {
  await checkPermissions();
  if (permissionWarning.classList.contains('hidden')) {
    alert('✅ Permissions granted! You can now start monitoring.');
  }
});

// Start monitoring
startBtn.addEventListener('click', async () => {
  await window.electronAPI.startMonitoring();
  isMonitoring = true;
  
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  
  updateStatus('monitoring', '🔍', 'Monitoring...', 'Looking for WhatsApp calls');
});

// Stop monitoring
stopBtn.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  }
  
  await window.electronAPI.stopMonitoring();
  isMonitoring = false;
  
  stopBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
  
  updateStatus('idle', '⭕', 'Monitoring Stopped', 'Press Start to begin monitoring');
});

// Open recordings folder
folderBtn.addEventListener('click', () => {
  window.electronAPI.openFolder();
});

// Refresh recordings list
refreshBtn.addEventListener('click', () => {
  loadRecordings();
});

// Listen for WhatsApp window detection
window.electronAPI.onWhatsAppFound(async (data) => {
  if (!isMonitoring) return;
  
  if (data.found && data.source) {
    if (!isRecording) {
      updateStatus('found', '✅', 'WhatsApp Detected!', 'Starting recording...');
      await startRecording(data.source);
    }
  } else {
    if (isRecording) {
      updateStatus('monitoring', '⚠️', 'Call Ended', 'Saving recording...');
      stopRecording();
    } else {
      updateStatus('monitoring', '🔍', 'Monitoring...', 'Waiting for WhatsApp call');
    }
  }
});

// Start recording
async function startRecording(source) {
  try {
    currentSource = source;
    
    // Get the stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop'
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      }
    });

    const options = { mimeType: 'video/webm; codecs=vp9' };
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = handleRecordingStop;

    recordedChunks = [];
    mediaRecorder.start();
    isRecording = true;

    // Start timer
    startTime = Date.now();
    recordingTimer.classList.remove('hidden');
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);

    updateStatus('recording', '🔴', 'Recording in Progress', 'Call is being recorded');
  } catch (err) {
    console.error('Error starting recording:', err);
    updateStatus('error', '❌', 'Recording Failed', err.message);
  }
}

// Stop recording
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    clearInterval(timerInterval);
    
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    isRecording = false;
    recordingTimer.classList.add('hidden');
  }
}

// Handle recording stop
async function handleRecordingStop() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const arrayBuffer = await blob.arrayBuffer();
  
  const duration = Math.floor((Date.now() - startTime) / 1000);
  const phoneNumber = extractPhoneNumber();

  try {
    const result = await window.electronAPI.saveRecording({
      buffer: arrayBuffer,
      phoneNumber: phoneNumber,
      duration: duration
    });

    if (result.success) {
      updateStatus('success', '✅', 'Recording Saved!', result.filename);
      loadRecordings();
      
      setTimeout(() => {
        if (isMonitoring) {
          updateStatus('monitoring', '🔍', 'Monitoring...', 'Waiting for WhatsApp call');
        }
      }, 3000);
    }
  } catch (err) {
    console.error('Error saving recording:', err);
    updateStatus('error', '❌', 'Save Failed', err.message);
  }
}

// Extract phone number from window title (basic attempt)
function extractPhoneNumber() {
  if (currentSource && currentSource.name) {
    const match = currentSource.name.match(/\+?\d[\d\s-]{8,}/);
    return match ? match[0].replace(/\s/g, '') : 'unknown';
  }
  return 'unknown';
}

// Update timer display
function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  recordingTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update status display
function updateStatus(type, icon, text, subtext) {
  statusCard.className = 'status-card';
  if (type === 'recording') {
    statusCard.classList.add('recording');
  } else if (type === 'found' || type === 'success') {
    statusCard.classList.add('active');
  }
  
  statusIcon.textContent = icon;
  statusText.textContent = text;
  statusSubtext.textContent = subtext;
}

// Load recordings list
async function loadRecordings() {
  try {
    const recordings = await window.electronAPI.getRecordings();
    
    if (recordings.length === 0) {
      recordingsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div>No recordings available</div>
        </div>
      `;
      return;
    }
    
    recordingsList.innerHTML = '';
    
    recordings.forEach(recording => {
      const item = document.createElement('div');
      item.className = 'recording-item';
      
      const date = new Date(recording.date);
      const size = formatFileSize(recording.size);
      
      item.innerHTML = `
        <div class="recording-info">
          <div class="recording-name">${recording.name}</div>
          <div class="recording-meta">${date.toLocaleDateString()} ${date.toLocaleTimeString()} • ${size}</div>
        </div>
        <div class="recording-actions">
          <button class="btn-small" onclick="openRecording('${recording.path}')">▶️</button>
          <button class="btn-small btn-delete" onclick="deleteRecording('${recording.path}', '${recording.name}')">🗑️</button>
        </div>
      `;
      
      recordingsList.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading recordings:', err);
  }
}

// Open recording
function openRecording(filepath) {
  const { shell } = require('electron');
  shell.openPath(filepath);
}

// Delete recording
async function deleteRecording(filepath, filename) {
  if (confirm(`Delete recording: ${filename}?`)) {
    const result = await window.electronAPI.deleteRecording(filepath);
    if (result.success) {
      loadRecordings();
    } else {
      alert('Failed to delete recording: ' + result.error);
    }
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Make functions global for onclick handlers
window.openRecording = openRecording;
window.deleteRecording = deleteRecording;