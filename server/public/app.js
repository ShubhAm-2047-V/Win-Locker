// ============================================================
// MAGIC CAL - CLOUD VAULT CLIENT APPLICATION
// ============================================================

// Application State
let state = {
  files: [],
  category: 'all',
  search: '',
  stats: null,
  storageMode: 'unknown',
  activeContextFile: null
};

const CATEGORY_NAMES = {
  all: 'All Items',
  document: 'Documents',
  image: 'Photos & Images',
  video: 'Videos',
  audio: 'Audio & Music',
  archive: 'Archives & Vaults',
  code: 'Code & Scripts',
  other: 'Other Files'
};

// DOM Elements
const sidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const brandBtn = document.getElementById('brandBtn');

const currentCategoryBreadcrumb = document.getElementById('currentCategoryBreadcrumb');
const searchInput = document.getElementById('searchInput');
const btnRefresh = document.getElementById('btnRefresh');
const btnImportFiles = document.getElementById('btnImportFiles');
const fileInput = document.getElementById('fileInput');

const vaultBody = document.getElementById('vaultBody');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');
const itemsGrid = document.getElementById('itemsGrid');
const emptyState = document.getElementById('emptyState');

const storageSizeText = document.getElementById('storageSizeText');
const storageBarFill = document.getElementById('storageBarFill');
const storagePercentText = document.getElementById('storagePercentText');
const storageQuotaText = document.getElementById('storageQuotaText');
const storageModeText = document.getElementById('storageModeText');
const btnStorageMode = document.getElementById('btnStorageMode');
const vaultStatusText = document.getElementById('vaultStatusText');

const countAll = document.getElementById('countAll');
const countDoc = document.getElementById('countDoc');
const countImg = document.getElementById('countImg');
const countVideo = document.getElementById('countVideo');
const countAudio = document.getElementById('countAudio');
const countArchive = document.getElementById('countArchive');
const countCode = document.getElementById('countCode');

const mediaModal = document.getElementById('mediaModal');
const mediaModalTitle = document.getElementById('mediaModalTitle');
const mediaModalBody = document.getElementById('mediaModalBody');
const btnCloseMediaModal = document.getElementById('btnCloseMediaModal');
const btnModalDownload = document.getElementById('btnModalDownload');
const btnModalCopy = document.getElementById('btnModalCopy');

const glassContextMenu = document.getElementById('glassContextMenu');
const toastContainer = document.getElementById('toastContainer');

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info', duration = 3200) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%) scale(0.9)';
    toast.style.transition = 'all 0.35s ease';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ============================================================
// SERVER HEALTH & STORAGE MODE
// ============================================================
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    state.storageMode = data.storageMode;

    if (data.storageMode === 'vercel-blob') {
      storageModeText.textContent = 'Vercel Blob Active';
      vaultStatusText.textContent = 'Cloud Vault (Vercel Blob)';
    } else {
      storageModeText.textContent = 'Local Mode';
      vaultStatusText.textContent = 'Local Dev Storage';
    }
  } catch (err) {
    storageModeText.textContent = 'Server Offline';
    vaultStatusText.textContent = 'Offline';
  }
}

// ============================================================
// STORAGE STATISTICS
// ============================================================
async function fetchStats() {
  try {
    const res = await fetch('/api/storage/stats');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.stats = data.stats;
    renderStats(data.stats);
  } catch (err) {
    console.error('Error fetching storage stats:', err);
  }
}

function renderStats(stats) {
  if (!stats) return;

  storageSizeText.textContent = stats.totalFormatted;
  storagePercentText.textContent = `${stats.usedPercentage}% Used`;
  storageQuotaText.textContent = `of ${stats.quotaFormatted}`;
  storageBarFill.style.width = `${Math.min(100, Math.max(0.5, stats.usedPercentage))}%`;

  countAll.textContent = stats.totalFiles || 0;

  const cb = stats.categoryBreakdown || {};
  countDoc.textContent = cb.document?.count || 0;
  countImg.textContent = cb.image?.count || 0;
  countVideo.textContent = cb.video?.count || 0;
  countAudio.textContent = cb.audio?.count || 0;
  countArchive.textContent = cb.archive?.count || 0;
  countCode.textContent = cb.code?.count || 0;
}

// ============================================================
// FETCH FILES
// ============================================================
async function fetchFiles() {
  try {
    itemsGrid.innerHTML = `
      <div style="grid-column: 1/-1; display: flex; justify-content: center; padding: 40px; color: var(--text-dim);">
        <span style="font-weight: 700; font-size: 14px;">Loading files...</span>
      </div>
    `;

    const params = new URLSearchParams();
    if (state.category && state.category !== 'all') params.append('category', state.category);
    if (state.search) params.append('search', state.search);

    const res = await fetch(`/api/storage/files?${params.toString()}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.files = data.files || [];
    renderFiles(state.files);
  } catch (err) {
    itemsGrid.innerHTML = '';
    emptyState.style.display = 'flex';
    emptyState.querySelector('.empty-title').textContent = 'Error Loading Files';
    emptyState.querySelector('.empty-desc').textContent = err.message;
  }
}

// ============================================================
// SVG ICONS BY CATEGORY
// ============================================================
function getCategoryIconSvg(category) {
  switch (category) {
    case 'image':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21"/></svg>`;
    case 'document':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
    case 'video':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>`;
    case 'audio':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
    case 'archive':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`;
    case 'code':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
  }
}

function getCardClass(category) {
  switch (category) {
    case 'image': return 'photo-card';
    case 'document': return 'doc-card';
    case 'video': return 'video-card';
    case 'audio': return 'audio-card';
    case 'archive': return 'archive-card';
    case 'code': return 'code-card';
    default: return 'other-card';
  }
}

function getBadgeClass(category) {
  switch (category) {
    case 'image': return 'badge-photo';
    case 'document': return 'badge-doc';
    case 'video': return 'badge-video';
    case 'audio': return 'badge-audio';
    case 'archive': return 'badge-archive';
    case 'code': return 'badge-code';
    default: return 'badge-other';
  }
}

// ============================================================
// RENDER FILE CARDS (3D LIQUID CRYSTAL GLASS)
// ============================================================
function renderFiles(files) {
  itemsGrid.innerHTML = '';

  if (!files || files.length === 0) {
    emptyState.style.display = 'flex';
    emptyState.querySelector('.empty-title').textContent = state.search ? 'No Matching Files Found' : 'This Folder is Empty';
    emptyState.querySelector('.empty-desc').textContent = state.search ? `No items matched "${state.search}"` : 'Drag & drop files anywhere, or click "Import Files" above to upload.';
    return;
  }

  emptyState.style.display = 'none';

  files.forEach(file => {
    const card = document.createElement('div');
    const category = file.category || 'other';
    card.className = `item-card ${getCardClass(category)}`;

    const dateStr = new Date(file.uploadedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });

    card.innerHTML = `
      <span class="color-badge-dot ${getBadgeClass(category)}"></span>
      <button class="item-menu-btn" title="Options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
      <div class="item-icon-wrapper">
        ${getCategoryIconSvg(category)}
      </div>
      <div class="item-name" title="${file.name}">${file.name}</div>
      <div class="item-meta">${file.sizeFormatted} &bull; ${dateStr}</div>
    `;

    // Click card to open preview
    card.addEventListener('click', (e) => {
      if (e.target.closest('.item-menu-btn')) return;
      openPreview(file);
    });

    // Menu button click
    const menuBtn = card.querySelector('.item-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = menuBtn.getBoundingClientRect();
      openContextMenu(file, rect.left, rect.bottom + 6);
    });

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(file, e.clientX, e.clientY);
    });

    itemsGrid.appendChild(card);
  });
}

// ============================================================
// CONTEXT MENU
// ============================================================
function openContextMenu(file, x, y) {
  state.activeContextFile = file;

  glassContextMenu.innerHTML = `
    <button class="context-menu-item" id="ctxPreview">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      Preview File
    </button>
    <button class="context-menu-item" id="ctxCopyLink">
      <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy Direct Link
    </button>
    <a class="context-menu-item" id="ctxDownload" href="${file.downloadUrl || file.url}" target="_blank" download="${file.name}" style="text-decoration:none;">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download File
    </a>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item danger" id="ctxDelete">
      <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete File
    </button>
  `;

  // Position within viewport bounds
  const menuWidth = 230;
  const menuHeight = 180;
  const posX = Math.min(x, window.innerWidth - menuWidth - 16);
  const posY = Math.min(y, window.innerHeight - menuHeight - 16);

  glassContextMenu.style.left = `${Math.max(16, posX)}px`;
  glassContextMenu.style.top = `${Math.max(16, posY)}px`;
  glassContextMenu.style.display = 'flex';

  // Attach handlers
  document.getElementById('ctxPreview').onclick = () => {
    closeContextMenu();
    openPreview(file);
  };

  document.getElementById('ctxCopyLink').onclick = () => {
    closeContextMenu();
    copyLink(file.url);
  };

  document.getElementById('ctxDelete').onclick = () => {
    closeContextMenu();
    deleteFile(file.url, file.name);
  };
}

function closeContextMenu() {
  glassContextMenu.style.display = 'none';
  state.activeContextFile = null;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#glassContextMenu')) {
    closeContextMenu();
  }
});

// ============================================================
// MEDIA PREVIEW MODAL
// ============================================================
function openPreview(file) {
  mediaModalTitle.textContent = file.name;
  btnModalDownload.href = file.downloadUrl || file.url;
  btnModalDownload.setAttribute('download', file.name);
  btnModalCopy.onclick = () => copyLink(file.url);

  const fullUrl = file.url.startsWith('http') ? file.url : `${window.location.origin}${file.url}`;

  if (file.category === 'image') {
    mediaModalBody.innerHTML = `
      <img src="${fullUrl}" alt="${file.name}" class="media-preview-img">
    `;
  } else if (file.category === 'video') {
    mediaModalBody.innerHTML = `
      <video controls autoplay class="media-preview-video">
        <source src="${fullUrl}" type="${file.contentType || 'video/mp4'}">
        Your browser does not support HTML5 video preview.
      </video>
    `;
  } else if (file.category === 'audio') {
    mediaModalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; padding: 30px;">
        <div class="brand-icon" style="width: 70px; height: 70px; color: var(--emerald);">
          ${getCategoryIconSvg('audio')}
        </div>
        <h4 style="font-size: 16px; font-weight: 800;">${file.name}</h4>
        <audio controls autoplay class="media-preview-audio">
          <source src="${fullUrl}" type="${file.contentType || 'audio/mpeg'}">
          Your browser does not support HTML5 audio playback.
        </audio>
      </div>
    `;
  } else if (file.category === 'document' || file.category === 'code') {
    // Attempt text fetch for light files, fallback to metadata view
    if (file.size && file.size < 500000) {
      mediaModalBody.innerHTML = '<div style="color: var(--text-dim);">Loading content preview...</div>';
      fetch(fullUrl)
        .then(res => res.text())
        .then(text => {
          mediaModalBody.innerHTML = `<pre class="document-preview-text"><code>${escapeHtml(text.slice(0, 15000))}</code></pre>`;
        })
        .catch(() => {
          renderFileInfoBox(file);
        });
    } else {
      renderFileInfoBox(file);
    }
  } else {
    renderFileInfoBox(file);
  }

  mediaModal.classList.add('active');
}

function renderFileInfoBox(file) {
  mediaModalBody.innerHTML = `
    <div style="background: rgba(255,255,255,0.7); border: 1.5px solid var(--border-glass); border-radius: var(--radius-md); padding: 28px; width: 100%; max-width: 440px; box-shadow: var(--shadow-glass); text-align: left;">
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 18px;">
        <div class="item-icon-wrapper" style="margin-bottom: 0;">
          ${getCategoryIconSvg(file.category)}
        </div>
        <div>
          <h4 style="font-size: 15px; font-weight: 800; color: var(--text-main); word-break: break-all;">${file.name}</h4>
          <span style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">${file.category || 'file'}</span>
        </div>
      </div>
      <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 8px;">
        <div><strong>Size:</strong> ${file.sizeFormatted}</div>
        <div><strong>Type:</strong> ${file.contentType || 'application/octet-stream'}</div>
        <div><strong>Uploaded:</strong> ${new Date(file.uploadedAt).toLocaleString()}</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function closeMediaModal() {
  mediaModal.classList.remove('active');
  mediaModalBody.innerHTML = '';
}

btnCloseMediaModal.onclick = closeMediaModal;
mediaModal.onclick = (e) => {
  if (e.target === mediaModal) closeMediaModal();
};

// ============================================================
// COPY LINK & DELETE ACTIONS
// ============================================================
function copyLink(url) {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast('Direct file link copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy link', 'error');
  });
}

async function deleteFile(url, filename) {
  if (!confirm(`Are you sure you want to delete "${filename}" from your vault?`)) return;

  try {
    const res = await fetch(`/api/storage/delete?url=${encodeURIComponent(url)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Deleted "${filename}"`, 'success');
    fetchStats();
    fetchFiles();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ============================================================
// UPLOAD FILES
// ============================================================
async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append('files', fileList[i]);
  }

  showToast(`Uploading ${fileList.length} file(s)...`, 'info');

  try {
    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Successfully uploaded ${data.files.length} file(s)!`, 'success');
    fetchStats();
    fetchFiles();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}

// Import button and file input
btnImportFiles.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
  uploadFiles(e.target.files);
  fileInput.value = '';
};

// ============================================================
// DRAG & DROP SUPPORT
// ============================================================
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropzoneOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropzoneOverlay.classList.remove('active');
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzoneOverlay.classList.remove('active');

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    uploadFiles(e.dataTransfer.files);
  }
});

// ============================================================
// CATEGORY SELECTION & NAVIGATION
// ============================================================
window.selectCategory = function(cat) {
  state.category = cat;
  currentCategoryBreadcrumb.textContent = CATEGORY_NAMES[cat] || 'Items';

  document.querySelectorAll('.nav-list .nav-item').forEach(item => {
    if (item.getAttribute('data-category') === cat) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Close mobile sidebar if open
  sidebar.classList.remove('mobile-open');

  fetchFiles();
};

document.querySelectorAll('.nav-list .nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const cat = item.getAttribute('data-category');
    selectCategory(cat);
  });
});

brandBtn.onclick = () => selectCategory('all');

// ============================================================
// SEARCH & REFRESH
// ============================================================
let searchTimer = null;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    fetchFiles();
  }, 250);
});

btnRefresh.onclick = () => {
  fetchHealth();
  fetchStats();
  fetchFiles();
  showToast('Vault refreshed', 'info');
};

btnStorageMode.onclick = () => {
  fetchHealth();
  fetchStats();
};

// ============================================================
// MOBILE SIDEBAR TOGGLE
// ============================================================
if (btnToggleSidebar) {
  btnToggleSidebar.onclick = (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('mobile-open');
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sidebar') && !e.target.closest('#btnToggleSidebar')) {
      sidebar.classList.remove('mobile-open');
    }
  });
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMediaModal();
    closeContextMenu();
  }
});

// ============================================================
// INITIALIZATION
// ============================================================
fetchHealth();
fetchStats();
fetchFiles();
