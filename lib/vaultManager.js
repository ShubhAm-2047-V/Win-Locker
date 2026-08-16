const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const cryptoEngine = require('./cryptoEngine');

class VaultManager {
  constructor(vaultDir) {
    this.vaultDir = vaultDir || path.join(process.env.APPDATA || process.env.HOME || '.', 'WinLockerVault');
    this.authPath = path.join(this.vaultDir, 'auth.json');
    this.indexPath = path.join(this.vaultDir, 'index.vault');
    this.decoyIndexPath = path.join(this.vaultDir, 'decoy_index.vault');
    this.blobsDir = path.join(this.vaultDir, 'blobs');
    this.intrudersDir = path.join(this.vaultDir, 'intruders');

    this.masterKey = null;
    this.indexData = null; // Memory cache when unlocked
    this.isDecoyMode = false;

    this.initStorage();
  }

  /**
   * Initialize directory structure and set hidden/system attributes on Windows
   */
  initStorage() {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }
    if (!fs.existsSync(this.blobsDir)) {
      fs.mkdirSync(this.blobsDir, { recursive: true });
    }
    if (!fs.existsSync(this.intrudersDir)) {
      fs.mkdirSync(this.intrudersDir, { recursive: true });
    }

    if (process.platform === 'win32') {
      exec(`attrib +h +s "${this.vaultDir}"`, (err) => {
        if (err) console.error('Failed to set stealth attributes on vault directory:', err);
      });
    }
  }

  isSetup() {
    return fs.existsSync(this.authPath);
  }

  /**
   * Initial Setup: Create master password, salt, recovery key, and initialize blank vault index
   */
  async setupMasterPassword(password) {
    if (this.isSetup()) {
      throw new Error('WinLocker is already set up');
    }

    const salt = cryptoEngine.generateSalt();
    const key = cryptoEngine.deriveKey(password, salt);
    const hashToken = cryptoEngine.hashPassword(password, salt);
    const recoveryKey = cryptoEngine.generateRecoveryKey();
    const recoverySalt = cryptoEngine.generateSalt();
    const recoveryKeyHashToken = cryptoEngine.hashPassword(recoveryKey, recoverySalt);

    const authConfig = {
      isConfigured: true,
      salt: salt.toString('hex'),
      hashToken: hashToken,
      recoverySalt: recoverySalt.toString('hex'),
      recoveryHashToken: recoveryKeyHashToken,
      decoySalt: null,
      decoyHashToken: null,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(this.authPath, JSON.stringify(authConfig, null, 2), 'utf8');

    this.masterKey = key;
    this.isDecoyMode = false;
    this.indexData = { version: 2, folders: [], items: [], trash: [] };

    await this.saveIndex();
    return { recoveryKey };
  }

  /**
   * Set up or update Decoy / Panic Password
   */
  async setupDecoyPassword(decoyPassword) {
    if (!this.isSetup()) throw new Error('Vault is not set up');
    const authConfig = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));

    const decoySalt = cryptoEngine.generateSalt();
    const decoyKey = cryptoEngine.deriveKey(decoyPassword, decoySalt);
    const decoyHashToken = cryptoEngine.hashPassword(decoyPassword, decoySalt);

    authConfig.decoySalt = decoySalt.toString('hex');
    authConfig.decoyHashToken = decoyHashToken;

    fs.writeFileSync(this.authPath, JSON.stringify(authConfig, null, 2), 'utf8');

    // Create initial decoy index with sample safe files
    const decoyIndex = {
      version: 2,
      folders: [{ id: 'folder_sample', name: 'Public Documents', parentId: 'root', createdAt: new Date().toISOString() }],
      items: [
        {
          id: 'item_sample1',
          name: 'Welcome_Note.txt',
          parentId: 'root',
          type: 'file',
          category: 'documents',
          size: 120,
          blobId: 'sample1.bin',
          createdAt: new Date().toISOString()
        }
      ],
      trash: []
    };

    const jsonString = JSON.stringify(decoyIndex, null, 2);
    const encryptedBuffer = cryptoEngine.encryptBuffer(Buffer.from(jsonString, 'utf8'), decoyKey);
    fs.writeFileSync(this.decoyIndexPath, encryptedBuffer);

    return { success: true };
  }

  /**
   * Unlock vault with master password or decoy panic password
   */
  unlock(password) {
    if (!this.isSetup()) {
      throw new Error('Vault is not set up yet');
    }

    const authConfig = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
    const salt = Buffer.from(authConfig.salt, 'hex');
    const computedHash = cryptoEngine.hashPassword(password, salt);

    // Check main master password
    if (computedHash === authConfig.hashToken) {
      this.masterKey = cryptoEngine.deriveKey(password, salt);
      this.isDecoyMode = false;
      this.loadIndex();
      this.purgeExpiredItems();
      return { success: true, isDecoy: false };
    }

    // Check decoy panic password
    if (authConfig.decoySalt && authConfig.decoyHashToken) {
      const decoySalt = Buffer.from(authConfig.decoySalt, 'hex');
      const computedDecoyHash = cryptoEngine.hashPassword(password, decoySalt);

      if (computedDecoyHash === authConfig.decoyHashToken) {
        this.masterKey = cryptoEngine.deriveKey(password, decoySalt);
        this.isDecoyMode = true;
        this.loadIndex();
        return { success: true, isDecoy: true };
      }
    }

    return { success: false };
  }

  resetPasswordWithRecoveryKey(recoveryKey, newPassword) {
    if (!this.isSetup()) throw new Error('Vault is not set up');
    const authConfig = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
    const recoverySalt = Buffer.from(authConfig.recoverySalt, 'hex');
    const computedRecoveryHash = cryptoEngine.hashPassword(recoveryKey, recoverySalt);

    if (computedRecoveryHash !== authConfig.recoveryHashToken) {
      return false;
    }

    const newSalt = cryptoEngine.generateSalt();
    const newKey = cryptoEngine.deriveKey(newPassword, newSalt);
    const newHashToken = cryptoEngine.hashPassword(newPassword, newSalt);

    const newRecoveryKey = cryptoEngine.generateRecoveryKey();
    const newRecoverySalt = cryptoEngine.generateSalt();
    const newRecoveryHashToken = cryptoEngine.hashPassword(newRecoveryKey, newRecoverySalt);

    authConfig.salt = newSalt.toString('hex');
    authConfig.hashToken = newHashToken;
    authConfig.recoverySalt = newRecoverySalt.toString('hex');
    authConfig.recoveryHashToken = newRecoveryHashToken;

    fs.writeFileSync(this.authPath, JSON.stringify(authConfig, null, 2), 'utf8');

    this.masterKey = newKey;
    this.isDecoyMode = false;
    this.saveIndex();

    return { success: true, newRecoveryKey };
  }

  async changePassword(oldPassword, newPassword) {
    if (!this.masterKey) throw new Error('Vault is locked');

    const authConfig = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
    const salt = Buffer.from(authConfig.salt, 'hex');
    const computedHash = cryptoEngine.hashPassword(oldPassword, salt);

    if (computedHash !== authConfig.hashToken) {
      return { success: false, reason: 'Incorrect current password' };
    }

    const newSalt = cryptoEngine.generateSalt();
    const newKey = cryptoEngine.deriveKey(newPassword, newSalt);
    const newHashToken = cryptoEngine.hashPassword(newPassword, newSalt);

    authConfig.salt = newSalt.toString('hex');
    authConfig.hashToken = newHashToken;

    fs.writeFileSync(this.authPath, JSON.stringify(authConfig, null, 2), 'utf8');

    this.masterKey = newKey;
    await this.saveIndex();

    return { success: true };
  }

  cleanTempFiles() {
    try {
      const tempDir = path.join(require('os').tmpdir(), 'WinLockerTemp');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Could not clean temp files:', e);
    }
  }

  lock() {
    this.masterKey = null;
    this.indexData = null;
    this.isDecoyMode = false;
    this.cleanTempFiles();
  }

  isUnlocked() {
    return this.masterKey !== null;
  }

  loadIndex() {
    if (!this.masterKey) throw new Error('Cannot load index while vault is locked');
    const activePath = this.isDecoyMode ? this.decoyIndexPath : this.indexPath;

    if (!fs.existsSync(activePath)) {
      this.indexData = { version: 2, folders: [], items: [], trash: [] };
      return;
    }

    try {
      const encryptedBuffer = fs.readFileSync(activePath);
      const decryptedBuffer = cryptoEngine.decryptBuffer(encryptedBuffer, this.masterKey);
      this.indexData = JSON.parse(decryptedBuffer.toString('utf8'));
      if (!this.indexData.trash) this.indexData.trash = [];
    } catch (err) {
      console.error('Index load error:', err);
      this.indexData = { version: 2, folders: [], items: [], trash: [] };
    }
  }

  async saveIndex() {
    if (!this.masterKey || !this.indexData) throw new Error('Vault is locked');
    const activePath = this.isDecoyMode ? this.decoyIndexPath : this.indexPath;

    const jsonString = JSON.stringify(this.indexData, null, 2);
    const encryptedBuffer = cryptoEngine.encryptBuffer(Buffer.from(jsonString, 'utf8'), this.masterKey);
    fs.writeFileSync(activePath, encryptedBuffer);
  }

  determineCategory(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const photoExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico'];
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'];
    const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf', '.csv', '.json', '.xml', '.html', '.css', '.js', '.py', '.cpp', '.h', '.java', '.c', '.cs', '.php', '.sql', '.sh', '.bat', '.ps1'];

    if (photoExts.includes(ext)) return 'photos';
    if (videoExts.includes(ext)) return 'videos';
    if (audioExts.includes(ext)) return 'audio';
    if (docExts.includes(ext)) return 'documents';
    return 'other';
  }

  async createFolder(name, parentId = 'root') {
    if (!this.masterKey) throw new Error('Vault locked');

    const folder = {
      id: 'folder_' + crypto.randomBytes(8).toString('hex'),
      name: name.trim(),
      parentId: parentId || 'root',
      createdAt: new Date().toISOString()
    };

    this.indexData.folders.push(folder);
    await this.saveIndex();
    return folder;
  }

  async addFile(sourceFilePath, parentId = 'root', deleteOriginal = false) {
    if (!this.masterKey) throw new Error('Vault locked');
    if (!fs.existsSync(sourceFilePath)) throw new Error(`Source file not found: ${sourceFilePath}`);

    const stat = fs.statSync(sourceFilePath);
    if (stat.isDirectory()) {
      return this.addDirectory(sourceFilePath, parentId, deleteOriginal);
    }

    const fileName = path.basename(sourceFilePath);
    const blobId = crypto.randomBytes(16).toString('hex') + '.bin';
    const destBlobPath = path.join(this.blobsDir, blobId);

    await cryptoEngine.encryptFileStream(sourceFilePath, destBlobPath, this.masterKey);

    const item = {
      id: 'item_' + crypto.randomBytes(8).toString('hex'),
      name: fileName,
      parentId: parentId || 'root',
      type: 'file',
      category: this.determineCategory(fileName),
      size: stat.size,
      blobId: blobId,
      tags: [],
      colorBadge: null,
      expiresAt: null,
      isSelectiveBackup: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.indexData.items.push(item);
    await this.saveIndex();

    if (deleteOriginal) {
      try {
        fs.unlinkSync(sourceFilePath);
      } catch (e) {
        console.warn('Could not delete original file:', e);
      }
    }

    return item;
  }

  /**
   * Add file/folder with Master Password verification + Custom Item Password locking
   */
  async addFileWithCustomPassword(sourceFilePath, masterPassInput, itemPassInput, parentId = 'root') {
    if (!fs.existsSync(sourceFilePath)) throw new Error('Source file/folder not found');

    const authConfig = JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
    const salt = Buffer.from(authConfig.salt, 'hex');
    const computedMasterHash = cryptoEngine.hashPassword(masterPassInput, salt);

    if (computedMasterHash !== authConfig.hashToken) {
      throw new Error('Incorrect WinLocker Master Password');
    }

    const effectiveKey = itemPassInput ? cryptoEngine.deriveKey(itemPassInput, salt) : this.masterKey || cryptoEngine.deriveKey(masterPassInput, salt);
    const itemPassHash = itemPassInput ? cryptoEngine.hashPassword(itemPassInput, salt) : null;

    const stat = fs.statSync(sourceFilePath);
    const originalName = path.basename(sourceFilePath).replace(/\.lock$/i, '');

    const blobId = crypto.randomBytes(16).toString('hex') + '.bin';
    const destBlobPath = path.join(this.blobsDir, blobId);

    if (stat.isDirectory()) {
      // Handle folder encryption
      await this.addDirectory(sourceFilePath, parentId, true);
      return { success: true, name: originalName };
    }

    await cryptoEngine.encryptFileStream(sourceFilePath, destBlobPath, effectiveKey);

    const item = {
      id: 'item_' + crypto.randomBytes(8).toString('hex'),
      name: originalName,
      parentId: parentId || 'root',
      type: 'file',
      category: this.determineCategory(originalName),
      size: stat.size,
      blobId: blobId,
      hasCustomPassword: !!itemPassInput,
      itemPassHash: itemPassHash,
      tags: ['#Locked'],
      colorBadge: 'red',
      createdAt: new Date().toISOString()
    };

    if (!this.indexData) this.loadIndex();
    this.indexData.items.push(item);
    await this.saveIndex();

    // Delete original .lock file from Windows disk
    try {
      fs.unlinkSync(sourceFilePath);
    } catch (e) {
      console.warn('Could not remove original .lock file:', e);
    }

    return item;
  }

  /**
   * Set Metadata (Tags, Color Badge, Expiration Date, Selective Backup Flag)
   */
  async updateItemMetadata(itemId, { tags, colorBadge, expiresAt, isSelectiveBackup }) {
    if (!this.masterKey) throw new Error('Vault locked');
    const item = this.getItemById(itemId);
    if (!item) throw new Error('Item not found');

    if (tags !== undefined) item.tags = tags;
    if (colorBadge !== undefined) item.colorBadge = colorBadge;
    if (expiresAt !== undefined) item.expiresAt = expiresAt;
    if (isSelectiveBackup !== undefined) item.isSelectiveBackup = isSelectiveBackup;

    item.updatedAt = new Date().toISOString();
    await this.saveIndex();
    return item;
  }

  /**
   * Move Item to Vault Recycle Bin (Trash)
   */
  async moveToTrash(itemId) {
    if (!this.masterKey) throw new Error('Vault locked');

    const itemIdx = this.indexData.items.findIndex(i => i.id === itemId);
    if (itemIdx !== -1) {
      const item = this.indexData.items.splice(itemIdx, 1)[0];
      item.deletedAt = new Date().toISOString();
      this.indexData.trash.push(item);
      await this.saveIndex();
      return true;
    }

    const folderIdx = this.indexData.folders.findIndex(f => f.id === itemId);
    if (folderIdx !== -1) {
      const folder = this.indexData.folders.splice(folderIdx, 1)[0];
      folder.deletedAt = new Date().toISOString();
      folder.type = 'folder';
      this.indexData.trash.push(folder);
      await this.saveIndex();
      return true;
    }

    return false;
  }

  /**
   * Restore item from Vault Recycle Bin
   */
  async restoreFromTrash(itemId) {
    if (!this.masterKey) throw new Error('Vault locked');
    const trashIdx = this.indexData.trash.findIndex(i => i.id === itemId);
    if (trashIdx === -1) return false;

    const item = this.indexData.trash.splice(trashIdx, 1)[0];
    delete item.deletedAt;

    if (item.type === 'folder') {
      delete item.type;
      this.indexData.folders.push(item);
    } else {
      this.indexData.items.push(item);
    }

    await this.saveIndex();
    return true;
  }

  /**
   * Empty Vault Recycle Bin permanently
   */
  async emptyTrash() {
    if (!this.masterKey) throw new Error('Vault locked');

    for (const trashed of this.indexData.trash) {
      if (trashed.blobId) {
        const blobPath = path.join(this.blobsDir, trashed.blobId);
        if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
      }
    }

    this.indexData.trash = [];
    await this.saveIndex();
    return true;
  }

  /**
   * Check and purge expired self-destruct items
   */
  async purgeExpiredItems() {
    if (!this.indexData || !this.indexData.items) return;
    const now = Date.now();
    const expiredList = this.indexData.items.filter(i => i.expiresAt && new Date(i.expiresAt).getTime() < now);

    for (const expItem of expiredList) {
      await this.deleteItem(expItem.id);
    }
  }

  async exportItem(itemId, targetDirPath) {
    if (!this.masterKey) throw new Error('Vault locked');

    const item = this.getItemById(itemId);
    if (!item) throw new Error('Item not found');

    if (item.type === 'file') {
      const blobPath = path.join(this.blobsDir, item.blobId);
      const destFilePath = path.join(targetDirPath, item.name);
      await cryptoEngine.decryptFileStream(blobPath, destFilePath, this.masterKey);
      return destFilePath;
    } else {
      const folderExportPath = path.join(targetDirPath, item.name);
      if (!fs.existsSync(folderExportPath)) {
        fs.mkdirSync(folderExportPath, { recursive: true });
      }
      const childFolders = this.indexData.folders.filter(f => f.parentId === item.id);
      for (const f of childFolders) {
        await this.exportItem(f.id, folderExportPath);
      }
      const childFiles = this.indexData.items.filter(i => i.parentId === item.id);
      for (const f of childFiles) {
        await this.exportItem(f.id, folderExportPath);
      }
      return folderExportPath;
    }
  }

  async openWithDefaultApp(itemId, shell) {
    if (!this.masterKey) throw new Error('Vault locked');

    const item = this.getItemById(itemId);
    if (!item || item.type !== 'file') throw new Error('File not found');

    const tempDir = path.join(require('os').tmpdir(), 'WinLockerTemp', item.id);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, item.name);
    const blobPath = path.join(this.blobsDir, item.blobId);

    await cryptoEngine.decryptFileStream(blobPath, tempFilePath, this.masterKey);

    const errorMsg = await shell.openPath(tempFilePath);
    if (errorMsg) {
      throw new Error(errorMsg);
    }
    return tempFilePath;
  }

  async getFileBuffer(itemId) {
    if (!this.masterKey) throw new Error('Vault locked');
    const item = this.getItemById(itemId);
    if (!item || item.type !== 'file') throw new Error('File not found');

    const blobPath = path.join(this.blobsDir, item.blobId);
    return await cryptoEngine.decryptFileToBuffer(blobPath, this.masterKey);
  }

  async deleteItem(itemId) {
    if (!this.masterKey) throw new Error('Vault locked');

    const itemIndex = this.indexData.items.findIndex(i => i.id === itemId);
    if (itemIndex !== -1) {
      const item = this.indexData.items[itemIndex];
      const blobPath = path.join(this.blobsDir, item.blobId);
      if (fs.existsSync(blobPath)) {
        fs.unlinkSync(blobPath);
      }
      this.indexData.items.splice(itemIndex, 1);
      await this.saveIndex();
      return true;
    }

    const folderIndex = this.indexData.folders.findIndex(f => f.id === itemId);
    if (folderIndex !== -1) {
      const folderId = itemId;
      const childItems = this.indexData.items.filter(i => i.parentId === folderId);
      for (const child of childItems) {
        await this.deleteItem(child.id);
      }
      const childFolders = this.indexData.folders.filter(f => f.parentId === folderId);
      for (const childF of childFolders) {
        await this.deleteItem(childF.id);
      }
      this.indexData.folders.splice(folderIndex, 1);
      await this.saveIndex();
      return true;
    }

    return false;
  }

  getItemById(itemId) {
    if (!this.indexData) return null;
    const file = this.indexData.items.find(i => i.id === itemId);
    if (file) return file;
    const folder = this.indexData.folders.find(f => f.id === itemId);
    if (folder) return { ...folder, type: 'folder' };
    return null;
  }

  getFolderContents(parentId = 'root', categoryFilter = null, searchQuery = '', tagFilter = null) {
    if (!this.indexData) return { folders: [], items: [], trash: [], breadcrumbs: [] };

    let folders = this.indexData.folders.filter(f => f.parentId === parentId);
    let items = this.indexData.items.filter(i => i.parentId === parentId);

    if (categoryFilter === 'trash') {
      return { folders: [], items: [], trash: this.indexData.trash || [], breadcrumbs: [{ id: 'trash', name: 'Recycle Bin' }] };
    }

    if (categoryFilter && categoryFilter !== 'all') {
      folders = [];
      items = this.indexData.items.filter(i => i.category === categoryFilter);
    }

    if (tagFilter) {
      folders = [];
      items = this.indexData.items.filter(i => i.tags && i.tags.includes(tagFilter));
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      folders = this.indexData.folders.filter(f => f.name.toLowerCase().includes(q));
      items = this.indexData.items.filter(i => i.name.toLowerCase().includes(q) || (i.tags && i.tags.some(t => t.toLowerCase().includes(q))));
    }

    const breadcrumbs = [];
    let currentId = parentId;
    while (currentId && currentId !== 'root') {
      const parentFolder = this.indexData.folders.find(f => f.id === currentId);
      if (parentFolder) {
        breadcrumbs.unshift({ id: parentFolder.id, name: parentFolder.name });
        currentId = parentFolder.parentId;
      } else {
        break;
      }
    }
    breadcrumbs.unshift({ id: 'root', name: 'Vault Root' });

    return { folders, items, trash: this.indexData.trash || [], breadcrumbs };
  }

  /**
   * Save encrypted Intruder Webcam Snapshot log
   */
  async logIntruderAttempt(base64Image, attemptInfo) {
    const intruderId = 'intruder_' + Date.now();
    const logPath = path.join(this.intrudersDir, intruderId + '.json');
    const data = {
      id: intruderId,
      timestamp: new Date().toISOString(),
      attemptInfo: attemptInfo || '3 consecutive wrong password attempts',
      image: base64Image
    };
    fs.writeFileSync(logPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Get list of intruder attempts
   */
  getIntruderLogs() {
    if (!fs.existsSync(this.intrudersDir)) return [];
    const files = fs.readdirSync(this.intrudersDir);
    const logs = [];
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.intrudersDir, f), 'utf8');
          logs.push(JSON.parse(content));
        } catch (e) {}
      }
    }
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  deleteIntruderLog(logId) {
    if (!fs.existsSync(this.intrudersDir) || !logId) return false;
    const logPath = path.join(this.intrudersDir, logId + '.json');
    if (fs.existsSync(logPath)) {
      try {
        fs.unlinkSync(logPath);
        return true;
      } catch (e) {}
    }
    return false;
  }

  clearIntruderLogs() {
    if (!fs.existsSync(this.intrudersDir)) return true;
    const files = fs.readdirSync(this.intrudersDir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(this.intrudersDir, f));
        } catch (e) {}
      }
    }
    return true;
  }

  /**
   * Selective Backup Sync: Syncs items marked with isSelectiveBackup to a destination directory
   */
  async syncSelectiveBackups(destinationDir) {
    if (!this.masterKey) throw new Error('Vault locked');
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const markedItems = this.indexData.items.filter(i => i.isSelectiveBackup);
    const results = [];

    for (const item of markedItems) {
      const blobPath = path.join(this.blobsDir, item.blobId);
      const destPath = path.join(destinationDir, item.blobId);
      if (fs.existsSync(blobPath)) {
        fs.copyFileSync(blobPath, destPath);
        results.push(item.name);
      }
    }

    return { syncedCount: results.length, files: results };
  }

  /**
   * Export single-file encrypted .winlocker backup archive
   */
  async exportWinLockerBackup(targetFilePath, backupPassword) {
    if (!this.masterKey) throw new Error('Vault locked');

    const backupSalt = cryptoEngine.generateSalt();
    const backupKey = cryptoEngine.deriveKey(backupPassword, backupSalt);

    const payload = {
      index: this.indexData,
      blobs: {}
    };

    for (const item of this.indexData.items) {
      const blobPath = path.join(this.blobsDir, item.blobId);
      if (fs.existsSync(blobPath)) {
        payload.blobs[item.blobId] = fs.readFileSync(blobPath).toString('base64');
      }
    }

    const jsonStr = JSON.stringify(payload);
    const encryptedBuf = cryptoEngine.encryptBuffer(Buffer.from(jsonStr, 'utf8'), backupKey);

    const fileContent = Buffer.concat([
      Buffer.from('WINLOCKER', 'utf8'),
      backupSalt,
      encryptedBuf
    ]);

    fs.writeFileSync(targetFilePath, fileContent);
    return true;
  }

  /**
   * Import single-file encrypted .winlocker backup archive
   */
  async importWinLockerBackup(backupFilePath, backupPassword) {
    if (!fs.existsSync(backupFilePath)) throw new Error('Backup file not found');
    const fileBuf = fs.readFileSync(backupFilePath);

    const header = fileBuf.subarray(0, 9).toString('utf8');
    if (header !== 'WINLOCKER') throw new Error('Invalid .winlocker backup file');

    const backupSalt = fileBuf.subarray(9, 25);
    const encryptedPayload = fileBuf.subarray(25);

    const backupKey = cryptoEngine.deriveKey(backupPassword, backupSalt);
    const decryptedJsonBuf = cryptoEngine.decryptBuffer(encryptedPayload, backupKey);
    const payload = JSON.parse(decryptedJsonBuf.toString('utf8'));

    for (const blobId in payload.blobs) {
      const blobBuf = Buffer.from(payload.blobs[blobId], 'base64');
      fs.writeFileSync(path.join(this.blobsDir, blobId), blobBuf);
    }

    this.indexData.folders = payload.index.folders || [];
    this.indexData.items = payload.index.items || [];
    this.indexData.trash = payload.index.trash || [];

    await this.saveIndex();
    return true;
  }

  getVaultStats() {
    if (!this.indexData) return { totalSize: 0, fileCount: 0, folderCount: 0, byCategory: {} };

    let totalSize = 0;
    const byCategory = { documents: 0, photos: 0, videos: 0, audio: 0, other: 0 };

    for (const item of this.indexData.items) {
      totalSize += item.size || 0;
      if (byCategory[item.category] !== undefined) {
        byCategory[item.category] += 1;
      } else {
        byCategory.other += 1;
      }
    }

    return {
      totalSize,
      fileCount: this.indexData.items.length,
      folderCount: this.indexData.folders.length,
      byCategory,
      isDecoyMode: this.isDecoyMode
    };
  }

  /**
   * Upload buffer to Vercel Cloud Storage Server
   */
  async uploadBufferToCloud(fileBuffer, originalFilename, serverUrl = 'https://win-locker.vercel.app') {
    const base = (serverUrl || 'https://win-locker.vercel.app').replace(/\/+$/, '');
    const uploadEndpoint = `${base}/api/storage/upload`;

    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('files', blob, originalFilename);

    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud server returned ${response.status}: ${errText}`);
    }

    const result = await response.json();
    if (!result.success || !result.files || result.files.length === 0) {
      throw new Error(result.error || 'Failed to upload file to cloud storage');
    }

    return result.files[0];
  }

  /**
   * Sync a specific vault file or folder to Vercel Cloud Storage
   */
  async syncItemToCloud(itemId, serverUrl) {
    if (!this.masterKey) throw new Error('Vault is locked');

    const item = this.getItemById(itemId);
    if (!item) throw new Error('Item not found in vault');

    const activeServerUrl = (serverUrl || (this.indexData.settings && this.indexData.settings.cloudServerUrl) || 'https://win-locker.vercel.app').replace(/\/+$/, '');

    if (item.type === 'file') {
      const fileBuffer = await this.getFileBuffer(itemId);
      const cloudFile = await this.uploadBufferToCloud(fileBuffer, item.name, activeServerUrl);

      item.isSelectiveBackup = true;
      item.cloudUrl = cloudFile.url;
      item.cloudDownloadUrl = cloudFile.downloadUrl || cloudFile.url;
      item.cloudSyncedAt = new Date().toISOString();

      await this.saveIndex();
      return { success: true, count: 1, item, cloudFile };
    } else if (item.type === 'folder' || (this.indexData.folders && this.indexData.folders.some(f => f.id === itemId))) {
      // Find all nested files in this folder and subfolders
      const getAllNestedFiles = (folderId) => {
        let files = this.indexData.items.filter(i => i.parentId === folderId && i.type === 'file');
        const subFolders = this.indexData.folders.filter(f => f.parentId === folderId);
        for (const sub of subFolders) {
          files = files.concat(getAllNestedFiles(sub.id));
        }
        return files;
      };

      const childFiles = getAllNestedFiles(itemId);
      let uploadedCount = 0;
      const errors = [];

      for (const child of childFiles) {
        try {
          const fileBuf = await this.getFileBuffer(child.id);
          const cloudFile = await this.uploadBufferToCloud(fileBuf, child.name, activeServerUrl);
          child.isSelectiveBackup = true;
          child.cloudUrl = cloudFile.url;
          child.cloudDownloadUrl = cloudFile.downloadUrl || cloudFile.url;
          child.cloudSyncedAt = new Date().toISOString();
          uploadedCount++;
        } catch (e) {
          console.error(`Error uploading child file ${child.name}:`, e);
          errors.push({ name: child.name, error: e.message });
        }
      }

      // If empty folder, upload a metadata placeholder
      if (childFiles.length === 0) {
        try {
          const metaBuffer = Buffer.from(JSON.stringify({ folderName: item.name, folderId: item.id, createdAt: new Date().toISOString() }));
          await this.uploadBufferToCloud(metaBuffer, `${item.name}.folder_meta`, activeServerUrl);
          uploadedCount++;
        } catch (metaErr) {
          console.warn('Could not sync empty folder meta:', metaErr.message);
        }
      }

      // Mark folder as synced
      const targetFolder = this.indexData.folders.find(f => f.id === itemId);
      if (targetFolder) {
        targetFolder.isSelectiveBackup = true;
        targetFolder.cloudSyncedAt = new Date().toISOString();
      }

      await this.saveIndex();
      return { success: true, count: uploadedCount, total: childFiles.length, errors };
    }

    throw new Error('Unsupported item type for cloud sync');
  }

  /**
   * Sync all files in vault to Cloud
   */
  async syncAllToCloud(serverUrl) {
    if (!this.masterKey) throw new Error('Vault is locked');
    const activeServerUrl = (serverUrl || (this.indexData.settings && this.indexData.settings.cloudServerUrl) || 'https://win-locker.vercel.app').replace(/\/+$/, '');

    const itemsToSync = this.indexData.items.filter(i => i.type === 'file');
    let count = 0;
    const errors = [];

    for (const item of itemsToSync) {
      try {
        const fileBuf = await this.getFileBuffer(item.id);
        const cloudFile = await this.uploadBufferToCloud(fileBuf, item.name, activeServerUrl);
        item.isSelectiveBackup = true;
        item.cloudUrl = cloudFile.url;
        item.cloudDownloadUrl = cloudFile.downloadUrl || cloudFile.url;
        item.cloudSyncedAt = new Date().toISOString();
        count++;
      } catch (err) {
        console.error(`Failed to sync ${item.name}:`, err);
        errors.push({ name: item.name, error: err.message });
      }
    }

    // Mark all folders as synced
    if (this.indexData.folders) {
      for (const folder of this.indexData.folders) {
        folder.isSelectiveBackup = true;
        folder.cloudSyncedAt = new Date().toISOString();
      }
    }

    await this.saveIndex();

    if (itemsToSync.length > 0 && count === 0 && errors.length > 0) {
      throw new Error(`Sync failed: ${errors[0].error}`);
    }

    return { success: true, count, total: itemsToSync.length, errors };
  }

  getCloudSettings() {
    return {
      serverUrl: (this.indexData && this.indexData.settings && this.indexData.settings.cloudServerUrl) || 'https://win-locker.vercel.app'
    };
  }

  async setCloudSettings(settings) {
    if (!this.indexData) return false;
    if (!this.indexData.settings) this.indexData.settings = {};
    if (settings.serverUrl) {
      this.indexData.settings.cloudServerUrl = settings.serverUrl.trim();
    }
    await this.saveIndex();
    return true;
  }
}

module.exports = VaultManager;
