const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const VaultManager = require('./lib/vaultManager');
const LockWatcher = require('./lib/lockWatcher');

let mainWindow = null;
let promptWindow = null;
let currentPromptPath = null;
let vault = null;
let lockWatcher = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    const lockArg = commandLine.find(arg => arg.toLowerCase().endsWith('.lock'));
    if (lockArg && fs.existsSync(lockArg)) {
      openCompactLockPrompt(lockArg);
    } else if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      mainWindow.focus();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
      }, 500);
    }
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'winlocker-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    title: 'WinLocker - Stealth Vault',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      plugins: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    const lockArg = process.argv.find(arg => arg.toLowerCase().endsWith('.lock'));
    if (lockArg && fs.existsSync(lockArg)) {
      openCompactLockPrompt(lockArg);
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('close', () => {
    if (vault) vault.lock();
  });

  function toggleStealthWindow() {
    console.log('HOTKEY TRIGGERED!');
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isVisible()) {
      console.log('Hiding window...');
      if (vault) vault.lock();
      if (promptWindow && !promptWindow.isDestroyed()) {
        try { promptWindow.close(); } catch (e) {}
      }
      mainWindow.webContents.send('app:locked');
      mainWindow.setSkipTaskbar(true);
      mainWindow.hide();
    } else {
      console.log('Showing window...');
      mainWindow.setSkipTaskbar(false);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
        }
      }, 500);
    }
  }

  const hotkeys = [
    'CommandOrControl+Space',
    'Ctrl+Space',
    'Ctrl+Alt+Space',
    'CommandOrControl+Alt+Space',
    'Ctrl+Shift+S',
    'Ctrl+Alt+S',
    'F9',
    'F10',
    'Ctrl+Shift+L'
  ];

  for (const hk of hotkeys) {
    try {
      const success = globalShortcut.register(hk, toggleStealthWindow);
      console.log(`Hotkey ${hk} registered:`, success);
    } catch (e) {
      console.warn(`Failed to register ${hk}:`, e.message);
    }
  }
}

/**
 * Open a small compact password popup dialog for locking a .lock file/folder
 */
function openCompactLockPrompt(targetFilePath) {
  if (!targetFilePath) return;

  if (promptWindow && !promptWindow.isDestroyed()) {
    if (currentPromptPath === targetFilePath) {
      promptWindow.focus();
      return;
    }
    try { promptWindow.close(); } catch (e) {}
  }

  currentPromptPath = targetFilePath;

  const win = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    alwaysOnTop: true,
    title: `WinLocker - Lock ${path.basename(targetFilePath)}`,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  promptWindow = win;

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'lock_prompt.html'));

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send('prompt:init', {
        targetPath: targetFilePath,
        fileName: path.basename(targetFilePath)
      });
    }
  });

  win.on('closed', () => {
    if (promptWindow === win) {
      promptWindow = null;
      currentPromptPath = null;
    }
  });
}

app.whenReady().then(() => {
  vault = new VaultManager();
  lockWatcher = new LockWatcher();

  lockWatcher.on('lock-detected', (data) => {
    openCompactLockPrompt(data.targetPath);
  });

  lockWatcher.start();

  protocol.handle('winlocker-media', async (request) => {
    try {
      const url = new URL(request.url);
      const itemId = url.pathname.replace(/^\//, '');

      if (!vault || !vault.isUnlocked()) {
        return new Response('Vault is locked', { status: 401 });
      }

      const fileBuffer = await vault.getFileBuffer(itemId);
      const item = vault.getItemById(itemId);
      
      let contentType = 'application/octet-stream';
      if (item) {
        const ext = path.extname(item.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
          contentType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`;
        } else if (['.mp4', '.webm', '.mkv', '.mov'].includes(ext)) {
          contentType = `video/${ext.replace('.', '')}`;
        } else if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) {
          contentType = `audio/${ext.replace('.', '')}`;
        } else if (ext === '.pdf') {
          contentType = 'application/pdf';
        }
      }

      return new Response(fileBuffer, {
        headers: { 'Content-Type': contentType }
      });
    } catch (err) {
      console.error('Media protocol error:', err);
      return new Response('Error loading media', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.on('prompt:close', (event, data) => {
  let targetPath = null;
  let ignore = false;
  if (typeof data === 'string') {
    targetPath = data;
  } else if (data && typeof data === 'object') {
    targetPath = data.targetPath;
    ignore = data.ignore;
  }

  const pathToIgnore = targetPath || currentPromptPath;
  if (pathToIgnore && lockWatcher) {
    lockWatcher.ignorePath(pathToIgnore);
  }

  if (promptWindow) {
    try { promptWindow.close(); } catch (e) {}
  }
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.webContents.send('vault:refresh');
  }
});

ipcMain.handle('auth:isSetup', async () => {
  return vault.isSetup();
});

ipcMain.handle('auth:setup', async (event, password) => {
  return await vault.setupMasterPassword(password);
});

ipcMain.handle('auth:setupDecoy', async (event, decoyPassword) => {
  return await vault.setupDecoyPassword(decoyPassword);
});

ipcMain.handle('auth:unlock', async (event, password) => {
  return vault.unlock(password);
});

ipcMain.handle('auth:lock', async () => {
  vault.lock();
  return true;
});

ipcMain.on('app:lock-and-close', () => {
  if (vault) vault.lock();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:locked');
    mainWindow.hide();
  }
});

ipcMain.handle('auth:reset', async (event, { recoveryKey, newPassword }) => {
  return vault.resetPasswordWithRecoveryKey(recoveryKey, newPassword);
});

ipcMain.handle('auth:changePassword', async (event, { oldPassword, newPassword }) => {
  return await vault.changePassword(oldPassword, newPassword);
});

ipcMain.handle('auth:logIntruder', async (event, { image, info }) => {
  return await vault.logIntruderAttempt(image, info);
});

ipcMain.handle('auth:getIntruders', async () => {
  return vault.getIntruderLogs();
});

ipcMain.handle('auth:deleteIntruder', async (event, logId) => {
  return vault.deleteIntruderLog(logId);
});

ipcMain.handle('auth:clearIntruders', async () => {
  return vault.clearIntruderLogs();
});

// Vault Operations Handlers
ipcMain.handle('vault:getContents', async (event, { parentId, categoryFilter, searchQuery, tagFilter }) => {
  if (!vault.isUnlocked()) throw new Error('Vault is locked');
  return vault.getFolderContents(parentId, categoryFilter, searchQuery, tagFilter);
});

ipcMain.handle('vault:createFolder', async (event, { name, parentId }) => {
  return await vault.createFolder(name, parentId);
});

ipcMain.handle('vault:addFiles', async (event, { filePaths, parentId, deleteOriginal }) => {
  const results = [];
  for (const fp of filePaths) {
    const item = await vault.addFile(fp, parentId, deleteOriginal);
    results.push(item);
  }
  return results;
});

ipcMain.handle('vault:lockCustomItem', async (event, { targetPath, masterPassword, itemPassword }) => {
  return await vault.addFileWithCustomPassword(targetPath, masterPassword, itemPassword);
});

ipcMain.handle('vault:updateMetadata', async (event, { itemId, metadata }) => {
  return await vault.updateItemMetadata(itemId, metadata);
});

ipcMain.handle('vault:moveToTrash', async (event, itemId) => {
  return await vault.moveToTrash(itemId);
});

ipcMain.handle('vault:restoreTrash', async (event, itemId) => {
  return await vault.restoreFromTrash(itemId);
});

ipcMain.handle('vault:emptyTrash', async () => {
  return await vault.emptyTrash();
});

ipcMain.handle('vault:export', async (event, { itemId, targetDir }) => {
  return await vault.exportItem(itemId, targetDir);
});

ipcMain.handle('vault:openDefault', async (event, itemId) => {
  return await vault.openWithDefaultApp(itemId, shell);
});

ipcMain.handle('vault:delete', async (event, itemId) => {
  return await vault.deleteItem(itemId);
});

ipcMain.handle('vault:getStats', async () => {
  return vault.getVaultStats();
});

ipcMain.handle('vault:getFileText', async (event, itemId) => {
  const buf = await vault.getFileBuffer(itemId);
  return buf.toString('utf8');
});

ipcMain.handle('vault:exportBackup', async (event, { targetPath, password }) => {
  return await vault.exportWinLockerBackup(targetPath, password);
});

ipcMain.handle('vault:importBackup', async (event, { backupPath, password }) => {
  return await vault.importWinLockerBackup(backupPath, password);
});

ipcMain.handle('vault:syncSelective', async (event, targetDir) => {
  return await vault.syncSelectiveBackups(targetDir);
});

// Vercel Cloud Storage Synchronization Handlers
ipcMain.handle('vault:syncItemToCloud', async (event, { itemId, serverUrl }) => {
  return await vault.syncItemToCloud(itemId, serverUrl);
});

ipcMain.handle('vault:syncAllToCloud', async (event, { serverUrl }) => {
  return await vault.syncAllToCloud(serverUrl);
});

ipcMain.handle('vault:getCloudSettings', async () => {
  return vault.getCloudSettings();
});

ipcMain.handle('vault:setCloudSettings', async (event, settings) => {
  return await vault.setCloudSettings(settings);
});

ipcMain.handle('vault:testCloudConnection', async (event, serverUrl) => {
  try {
    const base = (serverUrl || 'https://win-locker.vercel.app').replace(/\/+$/, '');
    const res = await fetch(`${base}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// File Dialog Pickers
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });
  return result.filePaths;
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('dialog:saveBackupFile', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save WinLocker Backup (.winlocker)',
    defaultPath: `WinLocker_Backup_${Date.now()}.winlocker`,
    filters: [{ name: 'WinLocker Archive', extensions: ['winlocker'] }]
  });
  return result.filePath;
});

ipcMain.handle('dialog:openBackupFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select WinLocker Backup Archive',
    filters: [{ name: 'WinLocker Archive', extensions: ['winlocker'] }],
    properties: ['openFile']
  });
  return result.filePaths[0];
});
