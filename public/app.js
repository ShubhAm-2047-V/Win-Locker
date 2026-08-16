// State
let state = {
  files: [],
  category: 'all',
  search: '',
  stats: null,
  storageMode: 'unknown'
};

// DOM Elements
const totalUsedText = document.getElementById('totalUsedText');
const totalQuotaText = document.getElementById('totalQuotaText');
const quotaProgressBar = document.getElementById('quotaProgressBar');
const percentUsedText = document.getElementById('percentUsedText');
const freeRemainingText = document.getElementById('freeRemainingText');
const totalFilesCount = document.getElementById('totalFilesCount');
const storageModeBadge = document.getElementById('storageModeBadge');
const storageModeText = document.getElementById('storageModeText');

const imgCount = document.getElementById('imgCount');
const docCount = document.getElementById('docCount');
const arcCount = document.getElementById('arcCount');
const othCount = document.getElementById('othCount');

const fileList = document.getElementById('fileList');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.querySelectorAll('.filter-tabs .tab');
const refreshBtn = document.getElementById('refreshBtn');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadProgressCard = document.getElementById('uploadProgressCard');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadPercentText = document.getElementById('uploadPercentText');
const uploadStatusText = document.getElementById('uploadStatusText');

const toast = document.getElementById('toast');
const previewModal = document.getElementById('previewModal');
const modalFileName = document.getElementById('modalFileName');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalDownloadBtn = document.getElementById('modalDownloadBtn');
const modalCopyBtn = document.getElementById('modalCopyBtn');

// Helper: Show Toast
function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Fetch Server Health & Storage Mode
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    state.storageMode = data.storageMode;

    if (data.storageMode === 'vercel-blob') {
      storageModeBadge.className = 'badge badge-success';
      storageModeText.innerHTML = '● Vercel Blob Connected';
    } else {
      storageModeBadge.className = 'badge badge-warning';
      storageModeText.innerHTML = '● Local Dev Mode';
    }
  } catch (err) {
    storageModeBadge.className = 'badge badge-warning';
    storageModeText.textContent = 'Server Offline';
  }
}

// Fetch Storage Statistics
async function fetchStats() {
  try {
    const res = await fetch('/api/storage/stats');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.stats = data.stats;
    renderStats(data.stats);
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Render Storage Statistics
function renderStats(stats) {
  totalUsedText.textContent = stats.totalFormatted;
  totalQuotaText.textContent = stats.quotaFormatted;
  quotaProgressBar.style.width = `${Math.min(100, Math.max(0.5, stats.usedPercentage))}%`;
  percentUsedText.textContent = `${stats.usedPercentage}% Used`;
  freeRemainingText.textContent = `${stats.freeFormatted} Free`;
  totalFilesCount.textContent = stats.totalFiles;

  const cb = stats.categoryBreakdown;
  if (cb) {
    imgCount.textContent = cb.image?.count || 0;
    docCount.textContent = cb.document?.count || 0;
    arcCount.textContent = cb.archive?.count || 0;
    const oth = (cb.other?.count || 0) + (cb.media?.count || 0) + (cb.code?.count || 0);
    othCount.textContent = oth;
  }
}

// Fetch File List
async function fetchFiles() {
  try {
    const params = new URLSearchParams();
    if (state.category && state.category !== 'all') params.append('category', state.category);
    if (state.search) params.append('search', state.search);

    const res = await fetch(`/api/storage/files?${params.toString()}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.files = data.files || [];
    renderFiles(state.files);
  } catch (err) {
    fileList.innerHTML = `<div class="empty-state"><p style="color: var(--danger)">Error: ${err.message}</p></div>`;
  }
}

// Get File Icon SVG
function getFileIcon(category) {
  switch (category) {
    case 'image':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    case 'document':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    case 'archive':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    case 'media':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    case 'code':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    default:
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
  }
}

// Render File Rows
function renderFiles(files) {
  if (!files || files.length === 0) {
    fileList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 0.75rem; color: var(--text-dim);">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
        </svg>
        <p>No files found in storage</p>
        <span style="font-size: 0.8rem; color: var(--text-dim)">Drag and drop files above to upload</span>
      </div>
    `;
    return;
  }

  fileList.innerHTML = files.map(file => {
    const dateFormatted = new Date(file.uploadedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="file-row" data-url="${file.url}">
        <div class="col-name" title="${file.name}">
          <div class="file-icon">${getFileIcon(file.category)}</div>
          <span style="cursor: pointer;" onclick="openPreview('${encodeURIComponent(JSON.stringify(file))}')">${file.name}</span>
        </div>
        <div class="col-size">${file.sizeFormatted}</div>
        <div class="col-date">${dateFormatted}</div>
        <div class="col-actions">
          <button class="btn btn-secondary btn-sm" onclick="copyLink('${file.url}')" title="Copy Link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <a href="${file.downloadUrl || file.url}" target="_blank" download="${file.name}" class="btn btn-secondary btn-sm" title="Download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
          <button class="btn-danger-ghost" onclick="deleteFile('${file.url}', '${file.name}')" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Copy File Link
window.copyLink = function(url) {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast('Direct link copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy link');
  });
};

// Delete File
window.deleteFile = async function(url, filename) {
  if (!confirm(`Are you sure you want to delete "${filename}" from storage?`)) return;

  try {
    const res = await fetch(`/api/storage/delete?url=${encodeURIComponent(url)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Deleted ${filename}`);
    fetchStats();
    fetchFiles();
  } catch (err) {
    showToast(`Error deleting file: ${err.message}`);
  }
};

// Preview Modal
window.openPreview = function(encodedFile) {
  const file = JSON.parse(decodeURIComponent(encodedFile));
  modalFileName.textContent = file.name;
  modalDownloadBtn.href = file.downloadUrl || file.url;
  modalDownloadBtn.setAttribute('download', file.name);

  modalCopyBtn.onclick = () => window.copyLink(file.url);

  const fullUrl = file.url.startsWith('http') ? file.url : `${window.location.origin}${file.url}`;

  if (file.category === 'image') {
    modalBody.innerHTML = `<img src="${fullUrl}" alt="${file.name}" style="max-width: 100%; max-height: 450px; border-radius: 8px; object-fit: contain;">`;
  } else if (file.category === 'media') {
    modalBody.innerHTML = `
      <video controls style="max-width: 100%; max-height: 400px; border-radius: 8px;">
        <source src="${fullUrl}" type="${file.contentType}">
        Your browser does not support video preview.
      </video>
    `;
  } else {
    modalBody.innerHTML = `
      <div style="padding: 2rem; background: rgba(255,255,255,0.03); border-radius: 8px; text-align: left;">
        <p><strong>File Name:</strong> ${file.name}</p>
        <p><strong>Size:</strong> ${file.sizeFormatted}</p>
        <p><strong>Type:</strong> ${file.contentType}</p>
        <p><strong>Category:</strong> ${file.category}</p>
        <p><strong>Uploaded:</strong> ${new Date(file.uploadedAt).toLocaleString()}</p>
      </div>
    `;
  }

  previewModal.classList.remove('hidden');
};

modalCloseBtn.onclick = () => previewModal.classList.add('hidden');
previewModal.onclick = (e) => {
  if (e.target === previewModal) previewModal.classList.add('hidden');
};

// Upload Files
async function uploadFiles(fileListToUpload) {
  if (!fileListToUpload || fileListToUpload.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < fileListToUpload.length; i++) {
    formData.append('files', fileListToUpload[i]);
  }

  uploadProgressCard.classList.remove('hidden');
  uploadStatusText.textContent = `Uploading ${fileListToUpload.length} file(s)...`;
  uploadProgressBar.style.width = '30%';
  uploadPercentText.textContent = '30%';

  try {
    uploadProgressBar.style.width = '70%';
    uploadPercentText.textContent = '70%';

    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    uploadProgressBar.style.width = '100%';
    uploadPercentText.textContent = '100%';
    showToast(`Uploaded ${data.files.length} file(s) successfully!`);

    setTimeout(() => {
      uploadProgressCard.classList.add('hidden');
      uploadProgressBar.style.width = '0%';
    }, 1200);

    fetchStats();
    fetchFiles();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`);
    uploadProgressCard.classList.add('hidden');
  }
}

// Event Listeners for Upload
browseBtn.onclick = (e) => {
  e.stopPropagation();
  fileInput.click();
};

dropzone.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  uploadFiles(e.target.files);
  fileInput.value = '';
};

// Drag & Drop
['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  });
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  const files = dt.files;
  uploadFiles(files);
});

// Search and Filter Tab Handlers
let searchDebounce = null;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = e.target.value;
    fetchFiles();
  }, 250);
});

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.category = tab.getAttribute('data-category');
    fetchFiles();
  });
});

refreshBtn.addEventListener('click', () => {
  fetchHealth();
  fetchStats();
  fetchFiles();
  showToast('Storage refreshed');
});

// Initialize
fetchHealth();
fetchStats();
fetchFiles();
