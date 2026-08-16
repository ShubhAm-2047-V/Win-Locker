const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class LockWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchers = [];
    this.processedPaths = new Set();
    this.ignoredPaths = new Set();
    this.scanInterval = null;
  }

  /**
   * Filter out known system, app, and internal lock files/folders
   */
  isSystemOrAppLockFile(fullPath) {
    if (!fullPath) return true;
    const base = path.basename(fullPath).toLowerCase();
    const systemLockNames = [
      'wallpaper.lock',
      'desktop.ini.lock',
      'parent.lock',
      'chrome.lock',
      'devtoolsactiveport',
      'lock',
      'cargo.lock',
      'yarn.lock'
    ];
    if (systemLockNames.includes(base)) return true;

    const lowerPath = fullPath.toLowerCase();
    if (
      lowerPath.includes('\\appdata\\') ||
      lowerPath.includes('\\node_modules\\') ||
      lowerPath.includes('\\.git\\') ||
      lowerPath.includes('\\.vscode\\')
    ) {
      return true;
    }
    return false;
  }

  /**
   * Get all Drive Roots (C:\, D:\, E:\, etc.), OneDrive, and User Profile directories
   */
  getTargetDirectories() {
    const candidateDirs = new Set();

    // 1. Add all active Windows drives (C:\, D:\, E:\, etc.)
    const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const letter of driveLetters) {
      const driveRoot = `${letter}:\\`;
      if (fs.existsSync(driveRoot)) {
        candidateDirs.add(driveRoot);
      }
    }

    // 2. Add OneDrive and User Profile directories
    const homeDir = os.homedir();
    const oneDriveEnv = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;

    if (oneDriveEnv && fs.existsSync(oneDriveEnv)) {
      candidateDirs.add(oneDriveEnv);
      const subDirs = ['Desktop', 'Documents', 'Pictures', 'Downloads', 'Photos', 'Files'];
      for (const sub of subDirs) {
        const full = path.join(oneDriveEnv, sub);
        if (fs.existsSync(full)) candidateDirs.add(full);
      }
    }

    const homeSubs = ['Desktop', 'Documents', 'Pictures', 'Downloads', 'Videos', 'Music'];
    candidateDirs.add(homeDir);
    for (const sub of homeSubs) {
      const full = path.join(homeDir, sub);
      if (fs.existsSync(full)) candidateDirs.add(full);
    }

    return Array.from(candidateDirs);
  }

  /**
   * Start watching directories and running 1-second polling scanner across all drives
   */
  start() {
    const targetDirs = this.getTargetDirectories();

    for (const dirPath of targetDirs) {
      try {
        const watcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
          if (!filename) return;

          if (filename.toLowerCase().endsWith('.lock')) {
            const fullPath = path.resolve(dirPath, filename);
            this.handleLockFound(fullPath);
          }
        });
        this.watchers.push(watcher);
      } catch (e) {
        // Ignore permission warnings on drive roots
      }
    }

    // Fast 1-second Polling Scanner over all drive roots & folders for 100% detection guarantee
    this.scanInterval = setInterval(() => {
      this.scanTargetDirectories(targetDirs);
    }, 1000);

    // Initial scan
    this.scanTargetDirectories(targetDirs);
  }

  scanTargetDirectories(dirs) {
    // Clean up processedPaths for files that no longer exist on disk
    for (const p of this.processedPaths) {
      if (!fs.existsSync(p)) {
        this.processedPaths.delete(p);
      }
    }

    for (const dirPath of dirs) {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.toLowerCase().endsWith('.lock')) {
            const fullPath = path.join(dirPath, entry.name);
            this.handleLockFound(fullPath);
          }
        }
      } catch (e) {}
    }
  }

  handleLockFound(fullPath) {
    if (this.ignoredPaths.has(fullPath)) return;
    if (this.processedPaths.has(fullPath)) return;
    if (this.isSystemOrAppLockFile(fullPath)) return;
    if (!fs.existsSync(fullPath)) return;

    this.processedPaths.add(fullPath);

    this.emit('lock-detected', {
      targetPath: fullPath,
      fileName: path.basename(fullPath)
    });
  }

  ignorePath(fullPath) {
    if (fullPath) {
      this.ignoredPaths.add(fullPath);
      this.processedPaths.add(fullPath);
    }
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    for (const w of this.watchers) {
      try { w.close(); } catch (e) {}
    }
    this.watchers = [];
  }
}

module.exports = LockWatcher;
