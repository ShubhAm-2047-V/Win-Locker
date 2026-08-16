// ============================================================
// MAGIC CAL - STEALTH CLOUD VAULT APPLICATION
// ============================================================

// Global Application State
const state = {
  token: sessionStorage.getItem('winlocker_session_token') || null,
  isConfigured: false,
  isDecoy: false,
  defaultCamouflage: true,
  autoLockMinutes: 10,
  files: [],
  category: 'all',
  search: '',
  stats: null,
  storageMode: 'unknown',
  activeContextFile: null,
  recoveryKey: null
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

// DOM Elements - Screens
const calcCamouflageView = document.getElementById('calcCamouflageView');
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');

// DOM Elements - Auth Cards
const setupCard = document.getElementById('setupCard');
const recoveryKeyCard = document.getElementById('recoveryKeyCard');
const loginCard = document.getElementById('loginCard');
const resetCard = document.getElementById('resetCard');

// Inputs & Buttons - Setup
const setupForm = document.getElementById('setupForm');
const setupPasswordInput = document.getElementById('setupPasswordInput');
const setupConfirmPasswordInput = document.getElementById('setupConfirmPasswordInput');
const btnCreateMasterPassword = document.getElementById('btnCreateMasterPassword');
const recoveryKeyDisplay = document.getElementById('recoveryKeyDisplay');
const btnCopyRecoveryKey = document.getElementById('btnCopyRecoveryKey');
const btnProceedToVault = document.getElementById('btnProceedToVault');

// Inputs & Buttons - Login
const loginForm = document.getElementById('loginForm');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const btnUnlockVault = document.getElementById('btnUnlockVault');
const linkForgotPass = document.getElementById('linkForgotPass');
const btnSwitchToCalc = document.getElementById('btnSwitchToCalc');
const btnExitCalculator = document.getElementById('btnExitCalculator');

// Inputs & Buttons - Reset
const resetForm = document.getElementById('resetForm');
const resetRecoveryKeyInput = document.getElementById('resetRecoveryKeyInput');
const resetNewPasswordInput = document.getElementById('resetNewPasswordInput');
const btnSubmitReset = document.getElementById('btnSubmitReset');
const btnBackToLogin = document.getElementById('btnBackToLogin');

// Main Vault UI Elements
const sidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const brandBtn = document.getElementById('brandBtn');
const currentCategoryBreadcrumb = document.getElementById('currentCategoryBreadcrumb');
const searchInput = document.getElementById('searchInput');
const btnRefresh = document.getElementById('btnRefresh');
const btnImportFiles = document.getElementById('btnImportFiles');
const btnLockApp = document.getElementById('btnLockApp');
const btnLockHeader = document.getElementById('btnLockHeader');
const fileInput = document.getElementById('fileInput');

const vaultBody = document.getElementById('vaultBody');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');
const itemsGrid = document.getElementById('itemsGrid');
const emptyState = document.getElementById('emptyState');

// Storage Quota Elements
const storageSizeText = document.getElementById('storageSizeText');
const storageBarFill = document.getElementById('storageBarFill');
const storagePercentText = document.getElementById('storagePercentText');
const storageQuotaText = document.getElementById('storageQuotaText');
const vaultStatusText = document.getElementById('vaultStatusText');

// Badges
const countAll = document.getElementById('countAll');
const countDoc = document.getElementById('countDoc');
const countImg = document.getElementById('countImg');
const countVideo = document.getElementById('countVideo');
const countAudio = document.getElementById('countAudio');
const countArchive = document.getElementById('countArchive');
const countCode = document.getElementById('countCode');

// Modals
const mediaModal = document.getElementById('mediaModal');
const mediaModalTitle = document.getElementById('mediaModalTitle');
const mediaModalBody = document.getElementById('mediaModalBody');
const btnCloseMediaModal = document.getElementById('btnCloseMediaModal');
const btnModalDownload = document.getElementById('btnModalDownload');
const btnModalCopy = document.getElementById('btnModalCopy');

const settingsModal = document.getElementById('settingsModal');
const navSettings = document.getElementById('navSettings');
const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
const toggleCamouflageOption = document.getElementById('toggleCamouflageOption');
const currentPassInput = document.getElementById('currentPassInput');
const newPassInput = document.getElementById('newPassInput');
const btnUpdatePassword = document.getElementById('btnUpdatePassword');
const decoyPassInput = document.getElementById('decoyPassInput');
const btnSaveDecoyPass = document.getElementById('btnSaveDecoyPass');
const btnRemoveDecoyPass = document.getElementById('btnRemoveDecoyPass');
const settingsRecoveryKeyDisplay = document.getElementById('settingsRecoveryKeyDisplay');
const btnCopySettingsKey = document.getElementById('btnCopySettingsKey');

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

// Toggle password visibility helper
window.togglePassView = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.style.color = '#7c3aed';
  } else {
    input.type = 'password';
    btn.style.color = '';
  }
};

// ============================================================
// AUTHENTICATED FETCH HELPER
// ============================================================
async function fetchWithAuth(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    // Unauthorized -> Token expired or invalid
    state.token = null;
    sessionStorage.removeItem('winlocker_session_token');
    showView(state.defaultCamouflage ? 'calc' : 'login');
    showToast('Vault session locked. Please enter your Master Password.', 'error');
    throw new Error('Unauthorized');
  }

  return res;
}

// ============================================================
// VIEW ROUTER & NAVIGATION
// ============================================================
function showView(view) {
  calcCamouflageView.style.display = 'none';
  authScreen.style.display = 'none';
  appScreen.style.display = 'none';

  setupCard.style.display = 'none';
  recoveryKeyCard.style.display = 'none';
  loginCard.style.display = 'none';
  resetCard.style.display = 'none';

  if (view === 'calc') {
    calcCamouflageView.style.display = 'flex';
    resetCalc();
  } else if (view === 'setup') {
    authScreen.style.display = 'flex';
    setupCard.style.display = 'block';
    setupPasswordInput.value = '';
    setupConfirmPasswordInput.value = '';
    setTimeout(() => setupPasswordInput.focus(), 100);
  } else if (view === 'recovery') {
    authScreen.style.display = 'flex';
    recoveryKeyCard.style.display = 'block';
  } else if (view === 'login') {
    authScreen.style.display = 'flex';
    loginCard.style.display = 'block';
    loginPasswordInput.value = '';
    setTimeout(() => loginPasswordInput.focus(), 100);
  } else if (view === 'reset') {
    authScreen.style.display = 'flex';
    resetCard.style.display = 'block';
    resetRecoveryKeyInput.value = '';
    resetNewPasswordInput.value = '';
    setTimeout(() => resetRecoveryKeyInput.focus(), 100);
  } else if (view === 'vault') {
    appScreen.style.display = 'flex';
    fetchStats();
    fetchFiles();
  }
}

// ============================================================
// CALCULATOR CAMOUFLAGE ENGINE
// ============================================================
let calcDisplayValue = '0';
let calcPrevValue = null;
let calcOperator = null;
let calcWaitingForSecondOperand = false;
let calcKeyLog = ''; // Keeps track of recent keypresses to match master password

const calcScreen = document.getElementById('calcScreen');

function updateCalcScreen() {
  if (calcScreen) {
    calcScreen.textContent = calcDisplayValue;
  }
}

function resetCalc() {
  calcDisplayValue = '0';
  calcPrevValue = null;
  calcOperator = null;
  calcWaitingForSecondOperand = false;
  calcKeyLog = '';
  updateCalcScreen();
}

window.calcAction = async function(val) {
  calcKeyLog += val;
  if (calcKeyLog.length > 50) calcKeyLog = calcKeyLog.slice(-50);

  if (val === 'C') {
    resetCalc();
    return;
  }

  if (val === '+/-') {
    calcDisplayValue = String(-parseFloat(calcDisplayValue || '0'));
    updateCalcScreen();
    return;
  }

  if (val === '%') {
    calcDisplayValue = String(parseFloat(calcDisplayValue || '0') / 100);
    updateCalcScreen();
    return;
  }

  if (['+', '-', '*', '/'].includes(val)) {
    const inputValue = parseFloat(calcDisplayValue);
    if (calcOperator && calcWaitingForSecondOperand) {
      calcOperator = val;
      return;
    }
    if (calcPrevValue === null && !isNaN(inputValue)) {
      calcPrevValue = inputValue;
    } else if (calcOperator) {
      const result = calculate(calcPrevValue, inputValue, calcOperator);
      calcDisplayValue = `${parseFloat(result.toFixed(7))}`;
      calcPrevValue = result;
      updateCalcScreen();
    }
    calcWaitingForSecondOperand = true;
    calcOperator = val;
    return;
  }

  if (val === '=') {
    // 1. Secret Unlock Trigger: Try unlocking with entered number or key sequence
    const candidatePass = calcDisplayValue !== '0' ? calcDisplayValue : '';
    if (candidatePass && state.isConfigured) {
      try {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: candidatePass })
        });
        const data = await loginRes.json();
        if (data.success && data.token) {
          state.token = data.token;
          state.isDecoy = data.isDecoy || false;
          sessionStorage.setItem('winlocker_session_token', data.token);
          showToast(data.isDecoy ? 'Decoy Vault Unlocked' : 'Vault Unlocked Successfully!', 'success');
          showView('vault');
          return;
        }
      } catch (e) {}
    }

    // 2. Perform normal arithmetic evaluation
    const inputValue = parseFloat(calcDisplayValue);
    if (calcOperator && calcPrevValue !== null) {
      const result = calculate(calcPrevValue, inputValue, calcOperator);
      calcDisplayValue = `${parseFloat(result.toFixed(7))}`;
      calcPrevValue = null;
      calcOperator = null;
      calcWaitingForSecondOperand = false;
      updateCalcScreen();
    }
    return;
  }

  if (val === '.') {
    if (!calcDisplayValue.includes('.')) {
      calcDisplayValue += '.';
      updateCalcScreen();
    }
    return;
  }

  // Digits 0-9
  if (calcWaitingForSecondOperand) {
    calcDisplayValue = val;
    calcWaitingForSecondOperand = false;
  } else {
    calcDisplayValue = calcDisplayValue === '0' ? val : calcDisplayValue + val;
  }
  updateCalcScreen();
};

function calculate(first, second, op) {
  if (op === '+') return first + second;
  if (op === '-') return first - second;
  if (op === '*') return first * second;
  if (op === '/') return second !== 0 ? first / second : 0;
  return second;
}

// Global Keyboard shortcuts for Calculator mode & Unlock
document.addEventListener('keydown', (e) => {
  if (calcCamouflageView.style.display !== 'none') {
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
      calcAction(e.key);
    } else if (['+', '-', '*', '/'].includes(e.key)) {
      calcAction(e.key);
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calcAction('=');
    } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
      calcAction('C');
    }
  }
});

// ============================================================
// INITIALIZATION & AUTH STATUS CHECK
// ============================================================
async function initApp() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    state.isConfigured = data.isConfigured;
    state.defaultCamouflage = data.defaultCamouflage !== false;
    state.autoLockMinutes = data.autoLockMinutes || 10;

    if (toggleCamouflageOption) {
      toggleCamouflageOption.checked = state.defaultCamouflage;
    }

    // 1. Vault not configured -> Show Setup Card
    if (!state.isConfigured) {
      showView('setup');
      return;
    }

    // 2. Already authenticated with valid token -> Go to Vault
    if (state.token) {
      try {
        const testRes = await fetchWithAuth('/api/storage/stats');
        const testData = await testRes.json();
        if (testData.success) {
          showView('vault');
          return;
        }
      } catch (err) {
        state.token = null;
        sessionStorage.removeItem('winlocker_session_token');
      }
    }

    // 3. Vault configured & locked -> Show Calculator Camouflage or Login Screen
    if (state.defaultCamouflage) {
      showView('calc');
    } else {
      showView('login');
    }
  } catch (err) {
    console.error('Initialization error:', err);
    showView('login');
  }

  fetchHealth();
}

// ============================================================
// AUTHENTICATION EVENT LISTENERS
// ============================================================

// Switch from Calculator to Master Password Login
if (btnExitCalculator) {
  btnExitCalculator.addEventListener('click', () => {
    showView('login');
  });
}

// Switch from Login to Calculator Camouflage
if (btnSwitchToCalc) {
  btnSwitchToCalc.addEventListener('click', () => {
    showView('calc');
  });
}

// Forgot Password Link
if (linkForgotPass) {
  linkForgotPass.addEventListener('click', () => {
    showView('reset');
  });
}

// Back to Login Link
if (btnBackToLogin) {
  btnBackToLogin.addEventListener('click', () => {
    showView('login');
  });
}

// 1. Handle Master Password Setup
if (btnCreateMasterPassword) {
  btnCreateMasterPassword.addEventListener('click', async (e) => {
    e.preventDefault();
    const p1 = setupPasswordInput.value;
    const p2 = setupConfirmPasswordInput.value;

    if (!p1 || p1.length < 4) {
      showToast('Master Password must be at least 4 characters', 'error');
      setupCard.classList.add('shake-error');
      setTimeout(() => setupCard.classList.remove('shake-error'), 500);
      return;
    }
    if (p1 !== p2) {
      showToast('Passwords do not match. Please re-type.', 'error');
      setupCard.classList.add('shake-error');
      setTimeout(() => setupCard.classList.remove('shake-error'), 500);
      return;
    }

    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p1 })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.token = data.token;
      state.recoveryKey = data.recoveryKey;
      state.isConfigured = true;
      sessionStorage.setItem('winlocker_session_token', data.token);

      recoveryKeyDisplay.textContent = data.recoveryKey;
      if (settingsRecoveryKeyDisplay) settingsRecoveryKeyDisplay.textContent = data.recoveryKey;

      showView('recovery');
      showToast('Vault created successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Setup failed', 'error');
    }
  });
}

// Copy Recovery Key Button
if (btnCopyRecoveryKey) {
  btnCopyRecoveryKey.addEventListener('click', () => {
    const key = recoveryKeyDisplay.textContent;
    navigator.clipboard.writeText(key);
    showToast('✅ Recovery Key copied to clipboard!', 'success');
  });
}

// Proceed to Vault Button
if (btnProceedToVault) {
  btnProceedToVault.addEventListener('click', () => {
    showView('vault');
  });
}

// 2. Handle Master Password Unlock (Login)
async function handleUnlock() {
  const pass = loginPasswordInput.value;
  if (!pass) {
    showToast('Please enter your Master Password', 'error');
    loginCard.classList.add('shake-error');
    setTimeout(() => loginCard.classList.remove('shake-error'), 500);
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();

    if (!data.success) {
      loginCard.classList.add('shake-error');
      setTimeout(() => loginCard.classList.remove('shake-error'), 500);
      showToast('Incorrect Password. Access Denied.', 'error');
      loginPasswordInput.select();
      return;
    }

    state.token = data.token;
    state.isDecoy = data.isDecoy || false;
    sessionStorage.setItem('winlocker_session_token', data.token);

    loginPasswordInput.value = '';
    showToast(data.isDecoy ? 'Decoy Vault Unlocked' : 'Vault Unlocked Successfully!', 'success');
    showView('vault');
  } catch (err) {
    showToast(err.message || 'Unlock failed', 'error');
  }
}

if (btnUnlockVault) {
  btnUnlockVault.addEventListener('click', (e) => {
    e.preventDefault();
    handleUnlock();
  });
}

if (loginPasswordInput) {
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUnlock();
    }
  });
}

// 3. Handle Password Reset via Recovery Key
if (btnSubmitReset) {
  btnSubmitReset.addEventListener('click', async (e) => {
    e.preventDefault();
    const rKey = resetRecoveryKeyInput.value.trim();
    const nPass = resetNewPasswordInput.value;

    if (!rKey || !nPass || nPass.length < 4) {
      showToast('Valid recovery key and new password (min 4 chars) required', 'error');
      resetCard.classList.add('shake-error');
      setTimeout(() => resetCard.classList.remove('shake-error'), 500);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryKey: rKey, newPassword: nPass })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.token = data.token;
      sessionStorage.setItem('winlocker_session_token', data.token);

      showToast('Master Password reset successfully!', 'success');
      showView('vault');
    } catch (err) {
      resetCard.classList.add('shake-error');
      setTimeout(() => resetCard.classList.remove('shake-error'), 500);
      showToast(err.message || 'Reset failed', 'error');
    }
  });
}

// 4. Lock Vault Action (Instant Lock)
function lockVault() {
  state.token = null;
  sessionStorage.removeItem('winlocker_session_token');
  showToast('🔒 Vault Locked', 'info');
  showView(state.defaultCamouflage ? 'calc' : 'login');
}

if (btnLockApp) btnLockApp.addEventListener('click', lockVault);
if (btnLockHeader) btnLockHeader.addEventListener('click', lockVault);
if (brandBtn) {
  brandBtn.addEventListener('click', () => {
    if (appScreen.style.display !== 'none') {
      selectCategory('all');
    }
  });
}

// ============================================================
// VAULT SETTINGS MODAL & CONFIGURATION
// ============================================================
if (navSettings) {
  navSettings.addEventListener('click', () => {
    settingsModal.classList.add('active');
    currentPassInput.value = '';
    newPassInput.value = '';
    decoyPassInput.value = '';
  });
}

if (btnCloseSettingsModal) {
  btnCloseSettingsModal.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
}

// Toggle Camouflage Mode default
if (toggleCamouflageOption) {
  toggleCamouflageOption.addEventListener('change', async () => {
    const isEnabled = toggleCamouflageOption.checked;
    state.defaultCamouflage = isEnabled;
    try {
      await fetchWithAuth('/api/auth/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultCamouflage: isEnabled })
      });
      showToast(`Camouflage mode ${isEnabled ? 'enabled' : 'disabled'} on startup`, 'success');
    } catch (err) {
      showToast('Failed to update camouflage settings', 'error');
    }
  });
}

// Update Master Password from Settings
if (btnUpdatePassword) {
  btnUpdatePassword.addEventListener('click', async () => {
    const curr = currentPassInput.value;
    const next = newPassInput.value;

    if (!curr || !next || next.length < 4) {
      showToast('Please enter your current password and a new password (min 4 chars)', 'error');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curr, newPassword: next })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.token = data.token;
      sessionStorage.setItem('winlocker_session_token', data.token);
      currentPassInput.value = '';
      newPassInput.value = '';

      showToast('✅ Master Password changed successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    }
  });
}

// Save Decoy Password
if (btnSaveDecoyPass) {
  btnSaveDecoyPass.addEventListener('click', async () => {
    const dPass = decoyPassInput.value;
    if (!dPass || dPass.length < 4) {
      showToast('Decoy Password must be at least 4 characters', 'error');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/auth/decoy-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decoyPassword: dPass, enable: true })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      decoyPassInput.value = '';
      showToast('✅ Panic / Decoy Password configured successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to set decoy password', 'error');
    }
  });
}

// Remove Decoy Password
if (btnRemoveDecoyPass) {
  btnRemoveDecoyPass.addEventListener('click', async () => {
    try {
      const res = await fetchWithAuth('/api/auth/decoy-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: false })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      decoyPassInput.value = '';
      showToast('Decoy password disabled', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to disable decoy password', 'error');
    }
  });
}

// Copy Settings Recovery Key
if (btnCopySettingsKey) {
  btnCopySettingsKey.addEventListener('click', () => {
    const key = settingsRecoveryKeyDisplay.textContent;
    if (key && !key.includes('XXXX')) {
      navigator.clipboard.writeText(key);
      showToast('Recovery key copied to clipboard', 'success');
    } else {
      showToast('Recovery key is stored securely in your initial vault setup', 'info');
    }
  });
}

// ============================================================
// SERVER HEALTH & STORAGE STATS
// ============================================================
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    state.storageMode = data.storageMode;

    if (vaultStatusText) {
      vaultStatusText.textContent = data.isVaultProtected ? 'Cloud Vault Protected' : 'Vault Connected';
    }
  } catch (err) {
    if (vaultStatusText) vaultStatusText.textContent = 'Offline';
  }
}

async function fetchStats() {
  try {
    const res = await fetchWithAuth('/api/storage/stats');
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
// FETCH & RENDER VAULT FILES
// ============================================================
async function fetchFiles() {
  try {
    let url = `/api/storage/files?category=${encodeURIComponent(state.category)}`;
    if (state.search) {
      url += `&search=${encodeURIComponent(state.search)}`;
    }

    const res = await fetchWithAuth(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.files = data.files || [];
    renderFiles(state.files);
  } catch (err) {
    console.error('Error fetching files:', err);
  }
}

function getCategoryIcon(category) {
  switch (category) {
    case 'image':
      return { bg: 'linear-gradient(135deg, rgba(244, 114, 182, 0.3), rgba(236, 72, 153, 0.4))', color: '#db2777', svg: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' };
    case 'document':
      return { bg: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(14e, 165, 233, 0.4))', color: '#0284c7', svg: '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>' };
    case 'video':
      return { bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(147, 51, 234, 0.4))', color: '#9333ea', svg: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>' };
    case 'audio':
      return { bg: 'linear-gradient(135deg, rgba(52, 211, 153, 0.3), rgba(16, 185, 129, 0.4))', color: '#059669', svg: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' };
    case 'archive':
      return { bg: 'linear-gradient(135deg, rgba(251, 146, 60, 0.3), rgba(234, 88, 12, 0.4))', color: '#ea580c', svg: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' };
    case 'code':
      return { bg: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(79, 70, 229, 0.4))', color: '#4f46e5', svg: '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' };
    default:
      return { bg: 'linear-gradient(135deg, rgba(148, 163, 184, 0.3), rgba(100, 116, 139, 0.4))', color: '#475569', svg: '<svg viewBox="0 0 24 24"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>' };
  }
}

function renderFiles(files) {
  itemsGrid.innerHTML = '';

  if (!files || files.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'vault-item-card';

    const iconData = getCategoryIcon(file.category);
    let previewContent = '';

    if (file.category === 'image') {
      previewContent = `<div class="item-thumb-box" style="background-image: url('${file.url}'); background-size: cover; background-position: center; border: 1.5px solid var(--border-glass);"></div>`;
    } else {
      previewContent = `
        <div class="item-thumb-box" style="background: ${iconData.bg}; color: ${iconData.color}; border: 1.5px solid var(--border-glass);">
          ${iconData.svg}
        </div>
      `;
    }

    card.innerHTML = `
      ${previewContent}
      <div class="item-name" title="${file.name}">${file.name}</div>
      <div class="item-meta">${file.sizeFormatted}</div>
    `;

    // Click to preview modal
    card.addEventListener('click', () => {
      openMediaPreview(file);
    });

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e, file);
    });

    itemsGrid.appendChild(card);
  });
}

// ============================================================
// MEDIA PREVIEW MODAL
// ============================================================
function openMediaPreview(file) {
  mediaModalTitle.textContent = file.name;
  mediaModalBody.innerHTML = '';

  const downloadHref = file.downloadUrl || file.url;
  btnModalDownload.href = downloadHref;
  btnModalDownload.setAttribute('download', file.name);

  btnModalCopy.onclick = () => {
    navigator.clipboard.writeText(file.url);
    showToast('Direct file link copied to clipboard!', 'success');
  };

  if (file.category === 'image') {
    const img = document.createElement('img');
    img.src = file.url;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '50vh';
    img.style.borderRadius = '16px';
    img.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    mediaModalBody.appendChild(img);
  } else if (file.category === 'video') {
    const video = document.createElement('video');
    video.src = file.url;
    video.controls = true;
    video.autoplay = true;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '50vh';
    video.style.borderRadius = '16px';
    mediaModalBody.appendChild(video);
  } else if (file.category === 'audio') {
    const audioWrapper = document.createElement('div');
    audioWrapper.style.padding = '20px';
    audioWrapper.style.width = '100%';
    audioWrapper.innerHTML = `
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 12px; text-align: center;">🎵 ${file.name}</div>
      <audio controls autoplay style="width: 100%;">
        <source src="${file.url}" type="${file.contentType}">
      </audio>
    `;
    mediaModalBody.appendChild(audioWrapper);
  } else {
    const infoBox = document.createElement('div');
    infoBox.style.padding = '24px';
    infoBox.style.background = 'rgba(255, 255, 255, 0.6)';
    infoBox.style.borderRadius = '18px';
    infoBox.style.border = '1px solid var(--border-glass)';
    infoBox.style.textAlign = 'center';
    infoBox.style.width = '100%';
    infoBox.innerHTML = `
      <div style="font-size: 40px; margin-bottom: 8px;">📄</div>
      <div style="font-weight: 800; font-size: 16px; margin-bottom: 4px;">${file.name}</div>
      <div style="font-size: 13px; color: var(--text-dim); margin-bottom: 16px;">${file.category.toUpperCase()} • ${file.sizeFormatted}</div>
      <div style="font-size: 12px; color: var(--text-muted);">Uploaded: ${new Date(file.uploadedAt).toLocaleString()}</div>
    `;
    mediaModalBody.appendChild(infoBox);
  }

  mediaModal.classList.add('active');
}

if (btnCloseMediaModal) {
  btnCloseMediaModal.addEventListener('click', () => {
    mediaModal.classList.remove('active');
    mediaModalBody.innerHTML = '';
  });
}

// ============================================================
// CONTEXT MENU (RIGHT-CLICK)
// ============================================================
function openContextMenu(e, file) {
  state.activeContextFile = file;
  glassContextMenu.innerHTML = `
    <div class="context-menu-item" onclick="openMediaPreview(state.activeContextFile); hideContextMenu();">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      Preview File
    </div>
    <div class="context-menu-item" onclick="downloadFileDirect(state.activeContextFile); hideContextMenu();">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download
    </div>
    <div class="context-menu-item" onclick="copyFileLink(state.activeContextFile); hideContextMenu();">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy Direct Link
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" onclick="deleteFilePrompt(state.activeContextFile); hideContextMenu();">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete File
    </div>
  `;

  glassContextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
  glassContextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  glassContextMenu.style.display = 'block';
}

function hideContextMenu() {
  glassContextMenu.style.display = 'none';
}

document.addEventListener('click', () => hideContextMenu());

window.copyFileLink = function(file) {
  if (!file) return;
  navigator.clipboard.writeText(file.url);
  showToast('Direct file link copied!', 'success');
};

window.downloadFileDirect = function(file) {
  if (!file) return;
  const link = document.createElement('a');
  link.href = file.downloadUrl || file.url;
  link.download = file.name;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.deleteFilePrompt = async function(file) {
  if (!file) return;
  if (!confirm(`Are you sure you want to delete "${file.name}" from your cloud vault?`)) return;

  try {
    const res = await fetchWithAuth('/api/storage/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: file.url, pathname: file.pathname })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`"${file.name}" deleted successfully`, 'success');
    fetchFiles();
    fetchStats();
  } catch (err) {
    showToast(err.message || 'Failed to delete file', 'error');
  }
};

// ============================================================
// FILE UPLOAD HANDLING (DRAG & DROP + INPUT)
// ============================================================
if (btnImportFiles) {
  btnImportFiles.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length > 0) {
      await uploadFiles(fileInput.files);
      fileInput.value = '';
    }
  });
}

// Drag & Drop
['dragenter', 'dragover'].forEach(eventName => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
    if (appScreen.style.display !== 'none' && dropzoneOverlay) {
      dropzoneOverlay.classList.add('active');
    }
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
    if (dropzoneOverlay) {
      dropzoneOverlay.classList.remove('active');
    }
  }, false);
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (appScreen.style.display !== 'none' && e.dataTransfer && e.dataTransfer.files.length > 0) {
    await uploadFiles(e.dataTransfer.files);
  }
});

async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append('files', fileList[i]);
  }

  showToast(`Uploading ${fileList.length} file(s) to Cloud Vault...`, 'info');

  try {
    const res = await fetchWithAuth('/api/storage/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`✅ Uploaded ${data.files.length} file(s) successfully!`, 'success');
    fetchFiles();
    fetchStats();
  } catch (err) {
    showToast(err.message || 'File upload failed', 'error');
  }
}

// ============================================================
// SEARCH & CATEGORY FILTERING
// ============================================================
window.selectCategory = function(cat) {
  state.category = cat;
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-category') === cat) {
      item.classList.add('active');
    } else if (item.getAttribute('data-category')) {
      item.classList.remove('active');
    }
  });

  if (currentCategoryBreadcrumb) {
    currentCategoryBreadcrumb.textContent = CATEGORY_NAMES[cat] || 'All Items';
  }

  fetchFiles();
};

document.querySelectorAll('.nav-item').forEach(item => {
  const cat = item.getAttribute('data-category');
  if (cat) {
    item.addEventListener('click', () => selectCategory(cat));
  }
});

if (searchInput) {
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      fetchFiles();
    }, 300);
  });
}

if (btnRefresh) {
  btnRefresh.addEventListener('click', () => {
    fetchStats();
    fetchFiles();
    showToast('Vault refreshed', 'info', 1800);
  });
}

if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });
}

// ============================================================
// AUTO-LOCK INACTIVITY TIMER
// ============================================================
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (state.token && state.autoLockMinutes > 0) {
    idleTimer = setTimeout(() => {
      if (state.token && appScreen.style.display !== 'none') {
        lockVault();
        showToast('Vault auto-locked due to inactivity.', 'info');
      }
    }, state.autoLockMinutes * 60 * 1000);
  }
}

['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

// START APPLICATION
initApp();
