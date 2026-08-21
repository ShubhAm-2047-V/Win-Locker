const { ipcRenderer } = require('electron');

// Global State
let currentParentId = 'root';
let currentCategoryFilter = 'all';
let currentTagFilter = null;
let searchQuery = '';
let deleteOriginalFiles = false;
let failedAttempts = 0;
let isCamouflageEnabled = true;

// DOM Elements
const authScreen = document.getElementById('authScreen');
const setupCard = document.getElementById('setupCard');
const loginCard = document.getElementById('loginCard');
const recoveryKeyCard = document.getElementById('recoveryKeyCard');
const resetCard = document.getElementById('resetCard');
const appScreen = document.getElementById('appScreen');
const calcCamouflageView = document.getElementById('calcCamouflageView');

const setupPasswordInput = document.getElementById('setupPasswordInput');
const setupConfirmPasswordInput = document.getElementById('setupConfirmPasswordInput');
const btnCreateMasterPassword = document.getElementById('btnCreateMasterPassword');

const recoveryKeyDisplay = document.getElementById('recoveryKeyDisplay');
const btnCopyRecoveryKey = document.getElementById('btnCopyRecoveryKey');
const btnProceedToVault = document.getElementById('btnProceedToVault');

const loginPasswordInput = document.getElementById('loginPasswordInput');
const btnUnlockVault = document.getElementById('btnUnlockVault');
const linkForgotPass = document.getElementById('linkForgotPass');

const resetRecoveryKeyInput = document.getElementById('resetRecoveryKeyInput');
const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');
const btnSubmitReset = document.getElementById('btnSubmitReset');
const btnBackToLogin = document.getElementById('btnBackToLogin');

const breadcrumbTrail = document.getElementById('breadcrumbTrail');
const searchInput = document.getElementById('searchInput');
const itemsGrid = document.getElementById('itemsGrid');
const emptyState = document.getElementById('emptyState');
const vaultBody = document.getElementById('vaultBody');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');

const btnAddFiles = document.getElementById('btnAddFiles');
const btnCreateNewFolder = document.getElementById('btnCreateNewFolder');
const btnEmptyTrashHeader = document.getElementById('btnEmptyTrashHeader');
const btnLockApp = document.getElementById('btnLockApp');
const storageSizeText = document.getElementById('storageSizeText');
const storageBarFill = document.getElementById('storageBarFill');

// Modals
const mediaModal = document.getElementById('mediaModal');
const mediaModalTitle = document.getElementById('mediaModalTitle');
const mediaModalBody = document.getElementById('mediaModalBody');
const btnCloseMediaModal = document.getElementById('btnCloseMediaModal');

const folderModal = document.getElementById('folderModal');
const folderNameInput = document.getElementById('folderNameInput');
const btnSubmitCreateFolder = document.getElementById('btnSubmitCreateFolder');
const btnCloseFolderModal = document.getElementById('btnCloseFolderModal');

const settingsModal = document.getElementById('settingsModal');
const navSettings = document.getElementById('navSettings');
const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');

const decoyPassInput = document.getElementById('decoyPassInput');
const btnSetupDecoy = document.getElementById('btnSetupDecoy');
const btnExportBackupArchive = document.getElementById('btnExportBackupArchive');
const btnImportBackupArchive = document.getElementById('btnImportBackupArchive');
const btnSyncSelectiveNow = document.getElementById('btnSyncSelectiveNow');
const cloudServerUrlInput = document.getElementById('cloudServerUrlInput');
const btnTestCloudConn = document.getElementById('btnTestCloudConn');
const btnSyncAllToCloud = document.getElementById('btnSyncAllToCloud');
const toggleCamouflageMode = document.getElementById('toggleCamouflageMode');
const intruderLogsContainer = document.getElementById('intruderLogsContainer');

// Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let accentColor = 'var(--cyan)';
  if (type === 'success') accentColor = 'var(--emerald)';
  if (type === 'error') accentColor = 'var(--rose)';

  toast.style.borderColor = accentColor;
  toast.innerHTML = `<span style="color:${accentColor}; font-weight:bold;">●</span> ${message}`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function initAuth() {
  const isSetup = await ipcRenderer.invoke('auth:isSetup');
  
  if (isCamouflageEnabled) {
    calcCamouflageView.style.display = 'flex';
    authScreen.style.display = 'none';
    appScreen.style.display = 'none';
    return;
  }

  authScreen.style.display = 'flex';
  appScreen.style.display = 'none';
  calcCamouflageView.style.display = 'none';

  if (!isSetup) {
    setupCard.style.display = 'block';
    loginCard.style.display = 'none';
    recoveryKeyCard.style.display = 'none';
    resetCard.style.display = 'none';
  } else {
    setupCard.style.display = 'none';
    loginCard.style.display = 'block';
    recoveryKeyCard.style.display = 'none';
    resetCard.style.display = 'none';
    loginPasswordInput.focus();
  }
}

// Master Password Setup
btnCreateMasterPassword.addEventListener('click', async () => {
  const p1 = setupPasswordInput.value;
  const p2 = setupConfirmPasswordInput.value;

  if (!p1 || p1.length < 4) {
    showToast('Password must be at least 4 characters', 'error');
    return;
  }
  if (p1 !== p2) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const result = await ipcRenderer.invoke('auth:setup', p1);
    setupCard.style.display = 'none';
    recoveryKeyCard.style.display = 'block';
    recoveryKeyDisplay.textContent = result.recoveryKey;
    showToast('Vault created successfully!', 'success');
  } catch (err) {
    showToast('Setup error: ' + err.message, 'error');
  }
});

btnCopyRecoveryKey.addEventListener('click', () => {
  navigator.clipboard.writeText(recoveryKeyDisplay.textContent);
  showToast('Recovery key copied to clipboard', 'success');
});

btnProceedToVault.addEventListener('click', () => {
  authScreen.style.display = 'none';
  appScreen.style.display = 'flex';
  loadVaultContents();

  if (currentLockTargetPath) {
    lockTriggerModal.classList.add('active');
    lockMasterPassInput.focus();
  }
});

// Unlock Vault
async function handleUnlock() {
  const pass = loginPasswordInput.value;
  if (!pass) return;

  const result = await ipcRenderer.invoke('auth:unlock', pass);
  if (result && result.success) {
    failedAttempts = 0;
    loginPasswordInput.value = '';
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    if (result.isDecoy) {
      showToast('Unlocked in Decoy Vault Mode', 'info');
    } else {
      showToast('Vault unlocked', 'success');
    }
    loadVaultContents();
  } else {
    failedAttempts++;
    showToast('Incorrect Password', 'error');
    loginPasswordInput.select();

    // Intruder Photo Capture after 3 failed attempts
    if (failedAttempts >= 3) {
      captureIntruderPhoto();
    }
  }
}

btnUnlockVault.addEventListener('click', handleUnlock);
loginPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleUnlock();
});



// Capture Intruder Webcam Snapshot
async function captureIntruderPhoto() {
  try {
    let video = document.getElementById('webcamVideo');
    let canvas = document.getElementById('webcamCanvas');

    if (!video) {
      video = document.createElement('video');
      video.id = 'webcamVideo';
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.display = 'none';
      document.body.appendChild(video);
    }

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'webcamCanvas';
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    
    video.srcObject = stream;
    await video.play().catch(() => {});

    // Wait for camera sensor initialization and video frames to become ready
    await new Promise((resolve) => {
      if (video.readyState >= 3) {
        resolve();
      } else {
        video.oncanplay = () => resolve();
        setTimeout(resolve, 1500);
      }
    });

    // Brief delay to allow camera auto-exposure to stabilize
    await new Promise((resolve) => setTimeout(resolve, 600));

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Stop all webcam tracks immediately
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;

    // Log intruder snapshot if image was captured
    if (dataUrl && dataUrl.length > 500) {
      await ipcRenderer.invoke('auth:logIntruder', {
        image: dataUrl,
        info: `${failedAttempts} consecutive incorrect password attempts`
      });

      showToast('Security Alert: Intruder snapshot captured!', 'error');
      renderIntruderLogs();
    }
  } catch (e) {
    console.warn('Webcam capture unavailable or permission denied:', e);
  }
}

linkForgotPass.addEventListener('click', () => {
  loginCard.style.display = 'none';
  resetCard.style.display = 'block';
});

btnBackToLogin.addEventListener('click', () => {
  resetCard.style.display = 'none';
  loginCard.style.display = 'block';
});

btnSubmitReset.addEventListener('click', async () => {
  const rKey = resetRecoveryKeyInput.value.trim();
  const nPass = resetNewPasswordInput.value;

  if (!rKey || !nPass) {
    showToast('Please fill in both fields', 'error');
    return;
  }

  const res = await ipcRenderer.invoke('auth:reset', { recoveryKey: rKey, newPassword: nPass });
  if (res && res.success) {
    showToast('Password reset successfully!', 'success');
    resetCard.style.display = 'none';
    loginCard.style.display = 'block';
  } else {
    showToast('Invalid Recovery Key', 'error');
  }
});

btnLockApp.addEventListener('click', lockVault);
ipcRenderer.on('app:locked', lockVault);

async function lockVault() {
  await ipcRenderer.invoke('auth:lock');
  appScreen.style.display = 'none';
  if (isCamouflageEnabled) {
    calcCamouflageView.style.display = 'flex';
  } else {
    authScreen.style.display = 'flex';
    loginCard.style.display = 'block';
    loginPasswordInput.value = '';
    loginPasswordInput.focus();
  }
  showToast('Vault locked', 'info');
}

// ============================================================
// VAULT DASHBOARD LOGIC
// ============================================================

async function loadVaultContents() {
  try {
    const data = await ipcRenderer.invoke('vault:getContents', {
      parentId: currentParentId,
      categoryFilter: currentCategoryFilter,
      searchQuery: searchQuery,
      tagFilter: currentTagFilter
    });

    renderBreadcrumbs(data.breadcrumbs);

    if (currentCategoryFilter === 'trash') {
      btnEmptyTrashHeader.style.display = 'inline-block';
      renderTrashGrid(data.trash);
    } else {
      btnEmptyTrashHeader.style.display = 'none';
      renderGrid(data.folders, data.items);
    }

    updateVaultStats();
  } catch (err) {
    showToast('Failed to load vault: ' + err.message, 'error');
  }
}

function renderBreadcrumbs(crumbs) {
  breadcrumbTrail.innerHTML = '';
  if (!crumbs || crumbs.length === 0) return;

  crumbs.forEach((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    const span = document.createElement('span');

    if (isLast) {
      span.className = 'crumb-active';
      span.textContent = crumb.name;
    } else {
      span.className = 'crumb-item';
      span.textContent = crumb.name;
      span.addEventListener('click', () => {
        currentParentId = crumb.id;
        loadVaultContents();
      });
    }

    breadcrumbTrail.appendChild(span);

    if (!isLast) {
      const sep = document.createElement('span');
      sep.className = 'crumb-separator';
      sep.textContent = '/';
      breadcrumbTrail.appendChild(sep);
    }
  });
}

function renderGrid(folders, items) {
  itemsGrid.innerHTML = '';

  const totalCount = (folders ? folders.length : 0) + (items ? items.length : 0);
  if (totalCount === 0) {
    emptyState.style.display = 'flex';
    itemsGrid.style.display = 'none';
    return;
  } else {
    emptyState.style.display = 'none';
    itemsGrid.style.display = 'grid';
  }

  if (folders) {
    folders.forEach(folder => {
      const card = document.createElement('div');
      card.className = 'item-card folder-card';
      let cloudBadgeHtml = '';
      if (folder.isSelectiveBackup || folder.cloudSyncedAt) {
        cloudBadgeHtml = `<div class="cloud-synced-pill" title="Saved to Vercel Cloud Storage&#10;Synced: ${folder.cloudSyncedAt ? new Date(folder.cloudSyncedAt).toLocaleString() : 'Yes'}">☁️ Cloud</div>`;
      }

      card.innerHTML = `
        ${cloudBadgeHtml}
        <button class="item-menu-btn" title="Options">
          <svg style="width: 14px; height: 14px; fill: var(--text-muted);" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
        <div class="item-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 1.99 2H20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        </div>
        <div class="item-name" title="${folder.name}">${folder.name}</div>
        <div class="item-meta">Folder</div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.item-menu-btn')) return;
        currentParentId = folder.id;
        loadVaultContents();
      });

      card.querySelector('.item-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(folder, e);
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(folder, e);
      });

      itemsGrid.appendChild(card);
    });
  }

  if (items) {
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `item-card ${getCategoryCardClass(item.category)}`;

      let badgeHtml = '';
      if (item.colorBadge) {
        badgeHtml = `<div class="color-badge-dot badge-${item.colorBadge}"></div>`;
      }

      let tagsHtml = '';
      if (item.tags && item.tags.length > 0) {
        tagsHtml = `<div class="item-tag-list">${item.tags.map(t => `<span class="tag-chip">${t}</span>`).join('')}</div>`;
      }

      let cloudBadgeHtml = '';
      if (item.cloudUrl || item.isSelectiveBackup) {
        cloudBadgeHtml = `<div class="cloud-synced-pill" title="Saved to Vercel Cloud Storage&#10;Synced: ${item.cloudSyncedAt ? new Date(item.cloudSyncedAt).toLocaleString() : 'Yes'}">☁️ Cloud</div>`;
      }

      card.innerHTML = `
        ${badgeHtml}
        ${cloudBadgeHtml}
        <button class="item-menu-btn" title="Options">
          <svg style="width: 14px; height: 14px; fill: var(--text-muted);" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
        <div class="item-icon-wrapper">
          ${getCategoryIcon(item.category)}
        </div>
        <div class="item-name" title="${item.name}">${item.name}</div>
        <div class="item-meta">${formatBytes(item.size)}</div>
        ${tagsHtml}
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.item-menu-btn')) return;
        openFileDefault(item);
      });

      card.querySelector('.item-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(item, e);
      });

      itemsGrid.appendChild(card);
    });
  }
}

// Render Vault Recycle Bin Grid
function renderTrashGrid(trashItems) {
  itemsGrid.innerHTML = '';
  if (!trashItems || trashItems.length === 0) {
    emptyState.style.display = 'flex';
    itemsGrid.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  itemsGrid.style.display = 'grid';

  trashItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card doc-card';

    card.innerHTML = `
      <div class="item-icon-wrapper" style="color:var(--rose);">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </div>
      <div class="item-name" title="${item.name}">${item.name}</div>
      <div class="item-meta" style="color:var(--rose);">In Recycle Bin</div>
      <button class="btn-secondary btn-restore-item" style="margin-top:8px; font-size:11px; padding:4px 10px;">Restore</button>
    `;

    card.querySelector('.btn-restore-item').addEventListener('click', async () => {
      await ipcRenderer.invoke('vault:restoreTrash', item.id);
      showToast(`Restored ${item.name}`, 'success');
      loadVaultContents();
    });

    itemsGrid.appendChild(card);
  });
}

btnEmptyTrashHeader.addEventListener('click', async () => {
  if (confirm('Permanently empty all items in the Vault Recycle Bin?')) {
    await ipcRenderer.invoke('vault:emptyTrash');
    showToast('Recycle Bin emptied', 'success');
    loadVaultContents();
  }
});

function getCategoryCardClass(category) {
  if (category === 'photos') return 'photo-card';
  if (category === 'videos') return 'video-card';
  if (category === 'audio') return 'audio-card';
  if (category === 'documents') return 'doc-card';
  return 'doc-card';
}

function getCategoryIcon(category) {
  if (category === 'photos') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  if (category === 'videos') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
  if (category === 'audio') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
}

async function updateVaultStats() {
  const stats = await ipcRenderer.invoke('vault:getStats');
  storageSizeText.textContent = `${formatBytes(stats.totalSize || 0)} / ∞`;
  storageBarFill.style.width = '100%';
  storageBarFill.style.background = 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)';
}

document.querySelectorAll('.nav-item[data-category]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-category]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategoryFilter = tab.dataset.category;
    loadVaultContents();
  });
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  loadVaultContents();
});

btnAddFiles.addEventListener('click', async () => {
  const paths = await ipcRenderer.invoke('dialog:openFiles');
  if (paths && paths.length > 0) {
    showToast(`Encrypting ${paths.length} file(s)...`, 'info');
    await ipcRenderer.invoke('vault:addFiles', {
      filePaths: paths,
      parentId: currentParentId,
      deleteOriginal: deleteOriginalFiles
    });
    showToast('Files added securely!', 'success');
    loadVaultContents();
  }
});

btnCreateNewFolder.addEventListener('click', () => {
  folderNameInput.value = '';
  folderModal.classList.add('active');
  folderNameInput.focus();
});

btnCloseFolderModal.addEventListener('click', () => {
  folderModal.classList.remove('active');
});

btnSubmitCreateFolder.addEventListener('click', async () => {
  const name = folderNameInput.value.trim();
  if (!name) return;

  await ipcRenderer.invoke('vault:createFolder', { name, parentId: currentParentId });
  folderModal.classList.remove('active');
  showToast('Virtual folder created', 'success');
  loadVaultContents();
});

vaultBody.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzoneOverlay.classList.add('active');
});

dropzoneOverlay.addEventListener('dragleave', () => {
  dropzoneOverlay.classList.remove('active');
});

dropzoneOverlay.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzoneOverlay.classList.remove('active');

  const files = Array.from(e.dataTransfer.files).map(f => f.path);
  if (files.length > 0) {
    showToast(`Importing ${files.length} item(s)...`, 'info');
    await ipcRenderer.invoke('vault:addFiles', {
      filePaths: files,
      parentId: currentParentId,
      deleteOriginal: deleteOriginalFiles
    });
    showToast('Items imported successfully!', 'success');
    loadVaultContents();
  }
});

async function openFileDefault(item) {
  if (item.type === 'folder') {
    currentParentId = item.id;
    loadVaultContents();
    return;
  }
  try {
    showToast(`Opening ${item.name}...`, 'info');
    await ipcRenderer.invoke('vault:openDefault', item.id);
  } catch (err) {
    showToast('Failed to open file: ' + err.message, 'error');
  }
}

const glassContextMenu = document.getElementById('glassContextMenu');

document.addEventListener('click', (e) => {
  if (glassContextMenu && !glassContextMenu.contains(e.target) && !e.target.closest('.item-menu-btn')) {
    glassContextMenu.style.display = 'none';
  }
});

// Custom 3D Glass Dropdown Context Menu
async function showContextMenu(item, e) {
  if (!glassContextMenu) return;
  e.preventDefault();
  e.stopPropagation();

  const rect = e.target.closest('.item-card, .item-menu-btn').getBoundingClientRect();
  let posX = e.clientX || rect.right;
  let posY = e.clientY || rect.bottom;

  if (posX + 260 > window.innerWidth) posX = window.innerWidth - 270;
  if (posY + 320 > window.innerHeight) posY = window.innerHeight - 330;

  glassContextMenu.style.left = `${posX}px`;
  glassContextMenu.style.top = `${posY}px`;

  const isFolder = item.type === 'folder';

  glassContextMenu.innerHTML = `
    <div class="color-picker-section">
      <span class="color-picker-label">Color Badge</span>
      <div class="color-picker-dots">
        <div class="color-dot dot-red" data-color="red" title="Red Badge"></div>
        <div class="color-dot dot-emerald" data-color="emerald" title="Emerald Badge"></div>
        <div class="color-dot dot-blue" data-color="blue" title="Blue Badge"></div>
        <div class="color-dot dot-amber" data-color="amber" title="Amber Badge"></div>
        <div class="color-dot dot-purple" data-color="purple" title="Purple Badge"></div>
      </div>
    </div>

    <div class="context-menu-divider"></div>

    <div class="context-menu-item" id="ctxOpen">
      <svg viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
      <span>Open / Preview</span>
    </div>
    
    <div class="context-menu-item" id="ctxUnhide">
      <svg viewBox="0 0 24 24"><path d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
      <span>Unhide & Export File</span>
    </div>

    <div class="context-menu-item" id="ctxBackup">
      <svg viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
      <span>Backup This File (.winlocker)</span>
    </div>

    <div class="context-menu-divider"></div>

    <div class="context-menu-item" id="ctxSync">
      <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
      <span>${item.cloudUrl ? '☁️ Re-Sync to Vercel Cloud' : '☁️ Sync to Vercel Cloud'}</span>
    </div>

    <div class="context-menu-item" id="ctxTags">
      <svg viewBox="0 0 24 24"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
      <span>Add Custom #Tag</span>
    </div>

    <div class="context-menu-divider"></div>

    <div class="context-menu-item danger" id="ctxDelete">
      <svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      <span>Delete (Move to Recycle Bin)</span>
    </div>
  `;

  glassContextMenu.style.display = 'flex';

  // Interactive Color Dot Handlers
  const dots = glassContextMenu.querySelectorAll('.color-dot');
  dots.forEach(dot => {
    dot.onclick = async (evt) => {
      evt.stopPropagation();
      const chosenColor = dot.getAttribute('data-color');
      glassContextMenu.style.display = 'none';
      await ipcRenderer.invoke('vault:updateMetadata', {
        itemId: item.id,
        metadata: { colorBadge: chosenColor }
      });
      showToast(`Color badge set to ${chosenColor}`, 'success');
      loadVaultContents();
    };
  });

  document.getElementById('ctxOpen').onclick = () => {
    glassContextMenu.style.display = 'none';
    openFileDefault(item);
  };

  document.getElementById('ctxUnhide').onclick = async () => {
    glassContextMenu.style.display = 'none';
    const targetDir = await ipcRenderer.invoke('dialog:openDirectory');
    if (targetDir) {
      showToast(`Unhiding & exporting ${item.name}...`, 'info');
      await ipcRenderer.invoke('vault:export', { itemId: item.id, targetDir });
      showToast(`Unhidden & exported to ${targetDir}`, 'success');
    }
  };

  document.getElementById('ctxBackup').onclick = async () => {
    glassContextMenu.style.display = 'none';
    const targetDir = await ipcRenderer.invoke('dialog:openDirectory');
    if (targetDir) {
      showToast(`Creating backup copy of ${item.name}...`, 'info');
      await ipcRenderer.invoke('vault:export', { itemId: item.id, targetDir });
      showToast(`Encrypted backup saved to ${targetDir}`, 'success');
    }
  };

  document.getElementById('ctxSync').onclick = async () => {
    glassContextMenu.style.display = 'none';
    showToast(`☁️ Syncing "${item.name}" to Vercel Cloud Storage...`, 'info');
    try {
      const result = await ipcRenderer.invoke('vault:syncItemToCloud', { itemId: item.id });
      if (result && result.success) {
        showToast(`✅ "${item.name}" saved to Vercel Cloud Storage!`, 'success');
        loadVaultContents();
      } else {
        showToast(`❌ Cloud sync failed: ${(result && result.error) || 'Upload failed'}`, 'error');
      }
    } catch (err) {
      console.error('Cloud sync error:', err);
      showToast(`❌ Cloud sync error: ${err.message}`, 'error');
    }
  };

  document.getElementById('ctxTags').onclick = async () => {
    glassContextMenu.style.display = 'none';
    const tag = prompt('Enter custom tag (e.g. #Important, #Private, #Work):', (item.tags && item.tags[0]) || '#Important');
    if (tag) {
      await ipcRenderer.invoke('vault:updateMetadata', {
        itemId: item.id,
        metadata: { tags: [tag] }
      });
      showToast(`Tag added: ${tag}`, 'success');
      loadVaultContents();
    }
  };

  document.getElementById('ctxDelete').onclick = async () => {
    glassContextMenu.style.display = 'none';
    if (confirm(`Move "${item.name}" to Vault Recycle Bin?`)) {
      await ipcRenderer.invoke('vault:moveToTrash', item.id);
      showToast(`Moved ${item.name} to Recycle Bin`, 'success');
      loadVaultContents();
    }
  };
}

// Media Modal
btnCloseMediaModal.addEventListener('click', () => {
  mediaModal.classList.remove('active');
  mediaModalBody.innerHTML = '';
});

// Settings & Advanced V2 Features
navSettings.addEventListener('click', async () => {
  settingsModal.classList.add('active');
  renderIntruderLogs();
});

btnCloseSettingsModal.addEventListener('click', () => {
  settingsModal.classList.remove('active');
});

btnSetupDecoy.addEventListener('click', async () => {
  const p = decoyPassInput.value;
  if (!p || p.length < 4) {
    showToast('Panic Password must be at least 4 characters', 'error');
    return;
  }
  await ipcRenderer.invoke('auth:setupDecoy', p);
  decoyPassInput.value = '';
  showToast('Panic Password / Decoy Vault configured!', 'success');
});

btnExportBackupArchive.addEventListener('click', async () => {
  const savePath = await ipcRenderer.invoke('dialog:saveBackupFile');
  if (savePath) {
    const pass = prompt('Enter a password to encrypt this .winlocker backup file:');
    if (pass) {
      showToast('Creating encrypted backup...', 'info');
      await ipcRenderer.invoke('vault:exportBackup', { targetPath: savePath, password: pass });
      showToast('Single-file .winlocker backup saved!', 'success');
    }
  }
});

btnImportBackupArchive.addEventListener('click', async () => {
  const backupPath = await ipcRenderer.invoke('dialog:openBackupFile');
  if (backupPath) {
    const pass = prompt('Enter password for this .winlocker backup file:');
    if (pass) {
      try {
        await ipcRenderer.invoke('vault:importBackup', { backupPath, password: pass });
        showToast('Vault backup restored successfully!', 'success');
        loadVaultContents();
      } catch (e) {
        showToast('Backup restore error: ' + e.message, 'error');
      }
    }
  }
});

btnSyncSelectiveNow.addEventListener('click', async () => {
  const targetDir = await ipcRenderer.invoke('dialog:openDirectory');
  if (targetDir) {
    const res = await ipcRenderer.invoke('vault:syncSelective', targetDir);
    showToast(`Synced ${res.syncedCount} selective file(s) to backup target`, 'success');
  }
});

toggleCamouflageMode.addEventListener('change', (e) => {
  isCamouflageEnabled = e.target.checked;
  showToast(isCamouflageEnabled ? 'Calculator Camouflage enabled' : 'Camouflage disabled', 'info');
});

async function renderIntruderLogs() {
  const logs = await ipcRenderer.invoke('auth:getIntruders');
  intruderLogsContainer.innerHTML = '';

  if (!logs || logs.length === 0) {
    intruderLogsContainer.innerHTML = '<div style="font-size:13px; color:var(--text-dim);">No intruder attempts logged.</div>';
    return;
  }

  logs.forEach(log => {
    const card = document.createElement('div');
    card.className = 'intruder-card';
    card.style.position = 'relative';
    card.innerHTML = `
      <div style="position:relative;">
        <img src="${log.image}" class="intruder-img" alt="Intruder" style="width:100%; height:140px; object-fit:cover; border-radius:8px; background:#000;">
        <button data-id="${log.id}" class="btn-delete-intruder" title="Delete Snapshot" style="position:absolute; top:6px; right:6px; background:rgba(15,23,42,0.85); border:1px solid rgba(244,63,94,0.5); color:var(--rose); border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;">&times;</button>
      </div>
      <div style="font-size:11px; color:var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</div>
      <div style="font-size:11px; color:var(--rose);">${log.attemptInfo}</div>
    `;
    
    const delBtn = card.querySelector('.btn-delete-intruder');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await ipcRenderer.invoke('auth:deleteIntruder', log.id);
        renderIntruderLogs();
        showToast('Snapshot deleted', 'info');
      });
    }

    intruderLogsContainer.appendChild(card);
  });
}

const btnClearIntruderLogs = document.getElementById('btnClearIntruderLogs');
if (btnClearIntruderLogs) {
  btnClearIntruderLogs.addEventListener('click', async () => {
    await ipcRenderer.invoke('auth:clearIntruders');
    renderIntruderLogs();
    showToast('All intruder logs cleared', 'info');
  });
}

// Camouflage Calculator Interactive Logic
let calcDisplay = '0';
let calcPrevValue = null;
let calcOperator = null;
let calcWaitingForSecondOperand = false;
let equalsHoldTimer = null;
let isEqualsLongPress = false;

function openPasswordScreen() {
  isCamouflageEnabled = false;
  calcCamouflageView.style.display = 'none';
  authScreen.style.display = 'flex';
  
  ipcRenderer.invoke('auth:isSetup').then(isSetup => {
    if (!isSetup) {
      setupCard.style.display = 'block';
      loginCard.style.display = 'none';
      if (setupPasswordInput) setupPasswordInput.focus();
    } else {
      setupCard.style.display = 'none';
      loginCard.style.display = 'block';
      if (loginPasswordInput) {
        loginPasswordInput.value = '';
        loginPasswordInput.focus();
      }
    }
  });
}

function calculateBasic(first, second, op) {
  if (op === '+') return first + second;
  if (op === '-') return first - second;
  if (op === '*') return first * second;
  if (op === '/') return second !== 0 ? first / second : 0;
  return second;
}

async function calcAction(val) {
  // If triggered by long-press, skip normal evaluation
  if (isEqualsLongPress) {
    isEqualsLongPress = false;
    return;
  }

  const screen = document.getElementById('calcScreen');
  
  if (val === 'C') {
    calcDisplay = '0';
    calcPrevValue = null;
    calcOperator = null;
    calcWaitingForSecondOperand = false;
    screen.textContent = '0';
    return;
  }

  if (val === '+/-') {
    calcDisplay = String(-parseFloat(calcDisplay || '0'));
    screen.textContent = calcDisplay;
    return;
  }

  if (val === '%') {
    calcDisplay = String(parseFloat(calcDisplay || '0') / 100);
    screen.textContent = calcDisplay;
    return;
  }

  if (['+', '-', '*', '/'].includes(val)) {
    const inputValue = parseFloat(calcDisplay);
    if (calcOperator && calcWaitingForSecondOperand) {
      calcOperator = val;
      return;
    }
    if (calcPrevValue === null && !isNaN(inputValue)) {
      calcPrevValue = inputValue;
    } else if (calcOperator) {
      const result = calculateBasic(calcPrevValue, inputValue, calcOperator);
      calcDisplay = `${parseFloat(result.toFixed(7))}`;
      calcPrevValue = result;
      screen.textContent = calcDisplay;
    }
    calcWaitingForSecondOperand = true;
    calcOperator = val;
    return;
  }

  if (val === '=') {
    // 1. Secret Unlock Trigger: Try unlocking with entered password/PIN or key equation
    const candidatePass = calcDisplay !== '0' ? calcDisplay : '';
    if (candidatePass) {
      try {
        const unlockResult = await ipcRenderer.invoke('auth:unlock', candidatePass);
        if (unlockResult) {
          calcDisplay = '0';
          screen.textContent = '0';
          isCamouflageEnabled = false;
          calcCamouflageView.style.display = 'none';
          authScreen.style.display = 'none';
          appScreen.style.display = 'flex';
          loadVaultContents();
          showToast(unlockResult.isDecoy ? 'Decoy Vault Unlocked' : 'Vault Unlocked Successfully!', 'success');
          return;
        }
      } catch (e) {}
    }

    // 2. Perform normal arithmetic evaluation
    const inputValue = parseFloat(calcDisplay);
    if (calcOperator && calcPrevValue !== null) {
      const result = calculateBasic(calcPrevValue, inputValue, calcOperator);
      calcDisplay = `${parseFloat(result.toFixed(7))}`;
      calcPrevValue = null;
      calcOperator = null;
      calcWaitingForSecondOperand = false;
      screen.textContent = calcDisplay;
    }
    return;
  }

  if (val === '.') {
    if (!calcDisplay.includes('.')) {
      calcDisplay += '.';
      screen.textContent = calcDisplay;
    }
    return;
  }

  // Digits 0-9
  if (calcWaitingForSecondOperand) {
    calcDisplay = val;
    calcWaitingForSecondOperand = false;
  } else {
    calcDisplay = calcDisplay === '0' || calcDisplay === 'Error' ? val : calcDisplay + val;
  }
  screen.textContent = calcDisplay;
}
window.calcAction = calcAction;

// Hold '=' for 3 seconds to open the Password Screen
const btnCalcEquals = document.getElementById('calcSecretUnlock');
if (btnCalcEquals) {
  const startHold = () => {
    isEqualsLongPress = false;
    clearTimeout(equalsHoldTimer);
    equalsHoldTimer = setTimeout(() => {
      isEqualsLongPress = true;
      openPasswordScreen();
    }, 3000);
  };

  const cancelHold = () => {
    clearTimeout(equalsHoldTimer);
  };

  btnCalcEquals.addEventListener('mousedown', startHold);
  btnCalcEquals.addEventListener('touchstart', startHold, { passive: true });
  btnCalcEquals.addEventListener('pointerdown', startHold);

  btnCalcEquals.addEventListener('mouseup', cancelHold);
  btnCalcEquals.addEventListener('mouseleave', cancelHold);
  btnCalcEquals.addEventListener('touchend', cancelHold);
  btnCalcEquals.addEventListener('touchcancel', cancelHold);
  btnCalcEquals.addEventListener('pointerup', cancelHold);
  btnCalcEquals.addEventListener('pointerleave', cancelHold);
}

// Keyboard support: Numbers, operators, and Hold '=' or 'Enter' for 3 seconds
let keyHoldTimer = null;
document.addEventListener('keydown', (e) => {
  if (calcCamouflageView && calcCamouflageView.style.display !== 'none') {
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
      calcAction(e.key);
    } else if (['+', '-', '*', '/'].includes(e.key)) {
      calcAction(e.key);
    } else if (e.key === 'Enter' || e.key === '=') {
      if (!keyHoldTimer && !e.repeat) {
        keyHoldTimer = setTimeout(() => {
          isEqualsLongPress = true;
          openPasswordScreen();
        }, 3000);
      }
      e.preventDefault();
      calcAction('=');
    } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
      calcAction('C');
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === '=' || e.key === 'Enter') {
    clearTimeout(keyHoldTimer);
    keyHoldTimer = null;
  }
});

// Switch from Login Card back to Calculator Camouflage
const btnSwitchToCalc = document.getElementById('btnSwitchToCalc');
if (btnSwitchToCalc) {
  btnSwitchToCalc.addEventListener('click', () => {
    isCamouflageEnabled = true;
    authScreen.style.display = 'none';
    calcCamouflageView.style.display = 'flex';
    calcAction('C');
  });
}

const togglePasswordVisibility = document.getElementById('togglePasswordVisibility');
if (togglePasswordVisibility) {
  togglePasswordVisibility.addEventListener('click', () => {
    const input = document.getElementById('loginPasswordInput');
    if (input) {
      if (input.type === 'password') {
        input.type = 'text';
      } else {
        input.type = 'password';
      }
    }
  });
}

let currentLockTargetPath = null;

const lockTriggerModal = document.getElementById('lockTriggerModal');
const lockTriggerFileName = document.getElementById('lockTriggerFileName');
const lockMasterPassInput = document.getElementById('lockMasterPassInput');
const lockItemPassInput = document.getElementById('lockItemPassInput');
const btnConfirmLockTrigger = document.getElementById('btnConfirmLockTrigger');
const btnCloseLockTriggerModal = document.getElementById('btnCloseLockTriggerModal');

ipcRenderer.on('app:lockTrigger', async (event, data) => {
  currentLockTargetPath = data.targetPath;
  lockTriggerFileName.textContent = data.fileName;
  lockMasterPassInput.value = '';
  lockItemPassInput.value = '';

  const isSetup = await ipcRenderer.invoke('auth:isSetup');
  if (!isSetup) {
    if (setupCard.style.display !== 'block') {
      showToast('Please set up your Master Password first', 'info');
      authScreen.style.display = 'flex';
      setupCard.style.display = 'block';
      loginCard.style.display = 'none';
      setupPasswordInput.focus();
    }
    return;
  }

  lockTriggerModal.classList.add('active');
  lockMasterPassInput.focus();
});

btnConfirmLockTrigger.addEventListener('click', async () => {
  const masterPass = lockMasterPassInput.value;
  const itemPass = lockItemPassInput.value;

  if (!masterPass) {
    showToast('Please enter your WinLocker Master Password', 'error');
    return;
  }

  try {
    showToast('Encrypting and locking file...', 'info');
    await ipcRenderer.invoke('vault:lockCustomItem', {
      targetPath: currentLockTargetPath,
      masterPassword: masterPass,
      itemPassword: itemPass
    });

    lockTriggerModal.classList.remove('active');
    showToast('File locked and hidden from Windows!', 'success');
    loadVaultContents();
  } catch (err) {
    showToast('Lock Error: ' + err.message, 'error');
  }
});

btnCloseLockTriggerModal.addEventListener('click', () => {
  lockTriggerModal.classList.remove('active');
});

// Pressing Ctrl + Space / Ctrl + Spacebar locks the vault and closes the app window
window.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
    e.preventDefault();
    try {
      await ipcRenderer.invoke('auth:lock');
      ipcRenderer.send('app:lock-and-close');
    } catch (err) {}
  }
});

if (btnLockApp) {
  btnLockApp.addEventListener('click', async () => {
    await ipcRenderer.invoke('auth:lock');
    appScreen.style.display = 'none';
    authScreen.style.display = 'none';
    isCamouflageEnabled = true;
    calcCamouflageView.style.display = 'flex';
    calcAction('C');
    showToast('Vault Locked', 'info');
  });
}

ipcRenderer.on('app:locked', () => {
  appScreen.style.display = 'none';
  authScreen.style.display = 'none';
  isCamouflageEnabled = true;
  calcCamouflageView.style.display = 'flex';
  calcAction('C');
});

// Vault Settings Modal Controls
if (navSettings) {
  navSettings.addEventListener('click', async () => {
    try {
      const cloudSettings = await ipcRenderer.invoke('vault:getCloudSettings');
      if (cloudServerUrlInput) {
        cloudServerUrlInput.value = (cloudSettings && cloudSettings.serverUrl) || 'https://win-locker.vercel.app';
      }
    } catch (e) {}
    settingsModal.classList.add('active');
  });
}

if (btnCloseSettingsModal) {
  btnCloseSettingsModal.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
}

if (btnTestCloudConn) {
  btnTestCloudConn.addEventListener('click', async () => {
    const url = cloudServerUrlInput.value.trim() || 'https://win-locker.vercel.app';
    showToast('Testing connection to Vercel Cloud...', 'info');
    try {
      await ipcRenderer.invoke('vault:setCloudSettings', { serverUrl: url });
      const testRes = await ipcRenderer.invoke('vault:testCloudConnection', url);
      if (testRes && testRes.success) {
        showToast('✅ Vercel Cloud Server Connected Successfully!', 'success');
      } else {
        showToast(`❌ Connection Failed: ${(testRes && testRes.error) || 'Server unreachable'}`, 'error');
      }
    } catch (err) {
      showToast(`❌ Connection Error: ${err.message}`, 'error');
    }
  });
}

if (btnSyncAllToCloud) {
  btnSyncAllToCloud.addEventListener('click', async () => {
    const url = cloudServerUrlInput.value.trim() || 'https://win-locker.vercel.app';
    showToast('☁️ Uploading all vault files to Vercel Cloud Storage...', 'info');
    try {
      await ipcRenderer.invoke('vault:setCloudSettings', { serverUrl: url });
      const res = await ipcRenderer.invoke('vault:syncAllToCloud', { serverUrl: url });
      if (res && res.success) {
        showToast(`✅ Synced ${res.count} file(s) to Vercel Cloud Storage!`, 'success');
        loadVaultContents();
      } else {
        showToast(`❌ Cloud Sync failed: ${(res && res.error) || 'Upload error'}`, 'error');
      }
    } catch (err) {
      showToast(`❌ Cloud Sync error: ${err.message}`, 'error');
    }
  });
}

if (btnSyncSelectiveNow) {
  btnSyncSelectiveNow.addEventListener('click', async () => {
    const targetDir = await ipcRenderer.invoke('dialog:openDirectory');
    if (targetDir) {
      showToast('Exporting local backup sync...', 'info');
      try {
        const count = await ipcRenderer.invoke('vault:syncSelective', targetDir);
        showToast(`✅ Synced ${count || 0} files to ${targetDir}`, 'success');
      } catch (err) {
        showToast(`❌ Local sync failed: ${err.message}`, 'error');
      }
    }
  });
}

if (btnSetupDecoy) {
  btnSetupDecoy.addEventListener('click', async () => {
    const pass = decoyPassInput.value;
    if (!pass) {
      showToast('Please enter a decoy/panic password', 'error');
      return;
    }
    try {
      await ipcRenderer.invoke('auth:setupDecoy', pass);
      decoyPassInput.value = '';
      showToast('✅ Panic Password set successfully!', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

if (btnExportBackupArchive) {
  btnExportBackupArchive.addEventListener('click', async () => {
    const targetPath = await ipcRenderer.invoke('dialog:saveBackupFile');
    if (targetPath) {
      const pass = prompt('Enter a password to encrypt this .winlocker backup:');
      if (pass) {
        showToast('Creating backup archive...', 'info');
        try {
          await ipcRenderer.invoke('vault:exportBackup', { targetPath, password: pass });
          showToast('✅ Backup created successfully!', 'success');
        } catch (err) {
          showToast('Export error: ' + err.message, 'error');
        }
      }
    }
  });
}

if (btnImportBackupArchive) {
  btnImportBackupArchive.addEventListener('click', async () => {
    const backupPath = await ipcRenderer.invoke('dialog:openBackupFile');
    if (backupPath) {
      const pass = prompt('Enter the password for this .winlocker backup:');
      if (pass) {
        showToast('Restoring backup archive...', 'info');
        try {
          await ipcRenderer.invoke('vault:importBackup', { backupPath, password: pass });
          showToast('✅ Vault restored from backup!', 'success');
          loadVaultContents();
        } catch (err) {
          showToast('Import error: ' + err.message, 'error');
        }
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
