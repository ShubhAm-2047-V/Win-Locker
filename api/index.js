const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Attempt to import @vercel/blob
let vercelBlob = null;
try {
  vercelBlob = require('@vercel/blob');
} catch (err) {
  console.warn('[@vercel/blob] not loaded, using local storage fallback if needed.');
}

const app = express();
const PORT = process.env.PORT || 3000;
const VERCEL_FREE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB free Hobby tier
const AUTH_CONFIG_FILENAME = '_winlocker_auth_config.json';
const JWT_SECRET = process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'magic-cal-stealth-vault-secret-key-2026';

// Enable CORS and JSON parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Local storage fallback directory (uses /tmp on serverless environments)
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const LOCAL_STORAGE_DIR = isServerless ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  try {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create uploads directory:', e.message);
  }
}

// In-memory multer storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per file
  }
});

// In-memory cache for auth config
let memoryAuthConfig = null;

// ============================================================
// CRYPTO & SECURITY UTILITIES
// ============================================================
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}

function generateRecoveryKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'WINK';
  for (let s = 0; s < 3; s++) {
    key += '-';
    for (let i = 0; i < 4; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return key;
}

function generateSessionToken(payload) {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  const dataB64 = Buffer.from(data, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${hmac}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [dataB64, hmac] = parts;
  const expectedHmac = crypto.createHmac('sha256', JWT_SECRET).update(dataB64).digest('base64url');
  try {
    if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp > Date.now()) {
        return payload;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Helper: Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Clean display name (strip timestamp prefix and meta extensions)
function getCleanDisplayName(filename) {
  if (!filename) return '';
  let clean = filename;
  if (clean.endsWith('.folder_meta')) {
    clean = clean.replace('.folder_meta', '');
  }
  // Strip leading timestamp (e.g. 1786896293052-filename.pdf -> filename.pdf)
  clean = clean.replace(/^\d{13}-/, '');
  return clean;
}

// Helper: Determine category by extension
function categorizeFileType(filename) {
  if (!filename) return 'other';
  if (filename.endsWith('.folder_meta') || filename.endsWith('.folder') || filename.endsWith('/')) {
    return 'folder';
  }
  const ext = path.extname(filename).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const docExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.csv', '.xlsx', '.pptx'];
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.enc', '.vault', '.winlocker'];
  const mediaExts = ['.mp3', '.wav', '.ogg', '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4a'];
  const codeExts = ['.js', '.json', '.html', '.css', '.py', '.ts', '.java', '.cpp', '.c', '.sh', '.sql'];

  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  if (archiveExts.includes(ext)) return 'archive';
  if (mediaExts.includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) return 'audio';
  if (codeExts.includes(ext)) return 'code';
  return 'other';
}

// Helper: Get storage mode
function getStorageMode() {
  if ((process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL) && vercelBlob) {
    return 'vercel-blob';
  }
  return 'local-storage';
}

// Helper: Get Auth Config from persistent storage (Vercel Blob or local disk)
async function getAuthConfig() {
  if (memoryAuthConfig) {
    return memoryAuthConfig;
  }

  const mode = getStorageMode();

  // Try Vercel Blob first
  if (mode === 'vercel-blob') {
    try {
      const listOptions = { prefix: AUTH_CONFIG_FILENAME };
      if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '') {
        listOptions.token = process.env.BLOB_READ_WRITE_TOKEN.trim();
      }
      const response = await vercelBlob.list(listOptions);
      const authBlob = (response.blobs || []).find(b => b.pathname.includes(AUTH_CONFIG_FILENAME));
      if (authBlob) {
        const fetchRes = await fetch(authBlob.url);
        if (fetchRes.ok) {
          const config = await fetchRes.json();
          memoryAuthConfig = config;
          return config;
        }
      }
    } catch (err) {
      console.warn('Error reading auth config from Vercel Blob:', err.message);
    }
  }

  // Try local file system
  const localAuthPath = path.join(LOCAL_STORAGE_DIR, AUTH_CONFIG_FILENAME);
  if (fs.existsSync(localAuthPath)) {
    try {
      const content = fs.readFileSync(localAuthPath, 'utf8');
      const config = JSON.parse(content);
      memoryAuthConfig = config;
      return config;
    } catch (e) {
      console.warn('Error reading local auth file:', e.message);
    }
  }

  return {
    isConfigured: false,
    salt: null,
    hashToken: null,
    recoverySalt: null,
    recoveryHashToken: null,
    decoySalt: null,
    decoyHashToken: null,
    defaultCamouflage: true,
    autoLockMinutes: 10,
    createdAt: null
  };
}

// Helper: Save Auth Config
async function saveAuthConfig(config) {
  memoryAuthConfig = config;
  const mode = getStorageMode();
  const configString = JSON.stringify(config, null, 2);

  // Save to Vercel Blob
  if (mode === 'vercel-blob') {
    try {
      const putOptions = {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false
      };
      if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '') {
        putOptions.token = process.env.BLOB_READ_WRITE_TOKEN.trim();
      }
      await vercelBlob.put(AUTH_CONFIG_FILENAME, configString, putOptions);
    } catch (err) {
      console.warn('Failed to save auth config to Vercel Blob:', err.message);
    }
  }

  // Also write locally as backup
  try {
    const localAuthPath = path.join(LOCAL_STORAGE_DIR, AUTH_CONFIG_FILENAME);
    fs.writeFileSync(localAuthPath, configString, 'utf8');
  } catch (err) {
    console.warn('Failed to save local auth file:', err.message);
  }

  return config;
}

// Authentication Middleware
async function requireAuth(req, res, next) {
  const config = await getAuthConfig();

  // If vault is not yet configured, allow setup endpoints but block sensitive file listing
  if (!config.isConfigured) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please enter your Master Password to unlock this vault.'
    });
  }

  req.session = session;
  next();
}

// Helper: Fetch all vault files (excluding internal config)
async function getAllFiles() {
  const mode = getStorageMode();
  let blobFiles = [];

  if (mode === 'vercel-blob') {
    try {
      const listOptions = {};
      if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '') {
        listOptions.token = process.env.BLOB_READ_WRITE_TOKEN.trim();
      }
      const response = await vercelBlob.list(listOptions);
      blobFiles = (response.blobs || [])
        .filter(b => !b.pathname.includes(AUTH_CONFIG_FILENAME) && !b.pathname.startsWith('_winlocker_'))
        .map(blob => {
          const cat = categorizeFileType(blob.pathname);
          return {
            id: blob.url,
            name: getCleanDisplayName(blob.pathname),
            rawName: blob.pathname,
            pathname: blob.pathname,
            url: blob.url,
            downloadUrl: blob.downloadUrl || blob.url,
            size: blob.size,
            sizeFormatted: cat === 'folder' ? 'Folder' : formatBytes(blob.size),
            uploadedAt: blob.uploadedAt,
            contentType: blob.contentType || 'application/octet-stream',
            category: cat,
            isFolder: cat === 'folder',
            source: 'vercel-blob'
          };
        });
    } catch (error) {
      console.warn('Error fetching Vercel blobs:', error.message);
    }
  }

  // Local files
  let localFiles = [];
  try {
    if (fs.existsSync(LOCAL_STORAGE_DIR)) {
      const files = fs.readdirSync(LOCAL_STORAGE_DIR);
      localFiles = files
        .filter(file => !file.includes(AUTH_CONFIG_FILENAME) && !file.startsWith('_winlocker_'))
        .map(file => {
          const filePath = path.join(LOCAL_STORAGE_DIR, file);
          const stats = fs.statSync(filePath);
          const cat = categorizeFileType(file);
          return {
            id: file,
            name: getCleanDisplayName(file),
            rawName: file,
            pathname: file,
            url: `/api/storage/local/${encodeURIComponent(file)}`,
            downloadUrl: `/api/storage/local/${encodeURIComponent(file)}?download=1`,
            size: stats.size,
            sizeFormatted: cat === 'folder' ? 'Folder' : formatBytes(stats.size),
            uploadedAt: stats.mtime,
            contentType: 'application/octet-stream',
            category: cat,
            isFolder: cat === 'folder',
            source: 'local-storage'
          };
        });
    }
  } catch (e) {
    console.warn('Error reading local directory:', e.message);
  }

  return [...blobFiles, ...localFiles];
}

// ============================================================
// AUTHENTICATION & LOCK ENDPOINTS
// ============================================================

// 1. Get Vault Auth Status
app.get('/api/auth/status', async (req, res) => {
  try {
    const config = await getAuthConfig();
    res.json({
      success: true,
      isConfigured: !!config.isConfigured,
      hasDecoy: !!(config.decoyHashToken && config.decoySalt),
      defaultCamouflage: config.defaultCamouflage !== false,
      autoLockMinutes: config.autoLockMinutes || 10
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Setup Master Password (First-time initialization)
app.post('/api/auth/setup', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long' });
    }

    const currentConfig = await getAuthConfig();
    if (currentConfig.isConfigured) {
      return res.status(400).json({ success: false, error: 'Vault is already configured with a Master Password' });
    }

    const salt = generateSalt();
    const hashToken = hashPassword(password, salt);
    const recoveryKey = generateRecoveryKey();
    const recoverySalt = generateSalt();
    const recoveryHashToken = hashPassword(recoveryKey, recoverySalt);

    const newConfig = {
      isConfigured: true,
      salt,
      hashToken,
      recoverySalt,
      recoveryHashToken,
      decoySalt: null,
      decoyHashToken: null,
      defaultCamouflage: true,
      autoLockMinutes: 10,
      createdAt: new Date().toISOString()
    };

    await saveAuthConfig(newConfig);

    const token = generateSessionToken({ isMaster: true, isDecoy: false });

    res.json({
      success: true,
      message: 'Master Password configured successfully!',
      recoveryKey,
      token
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ success: false, error: error.message || 'Setup failed' });
  }
});

// 3. Login / Unlock Vault
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Please enter your password' });
    }

    const config = await getAuthConfig();
    if (!config.isConfigured) {
      return res.status(400).json({ success: false, error: 'Vault has not been set up yet. Please set up a Master Password first.' });
    }

    // 1. Check Master Password
    const computedHash = hashPassword(password, config.salt);
    if (computedHash === config.hashToken) {
      const token = generateSessionToken({ isMaster: true, isDecoy: false });
      return res.json({
        success: true,
        isDecoy: false,
        token,
        message: 'Vault unlocked successfully'
      });
    }

    // 2. Check Decoy / Panic Password
    if (config.decoySalt && config.decoyHashToken) {
      const computedDecoyHash = hashPassword(password, config.decoySalt);
      if (computedDecoyHash === config.decoyHashToken) {
        const token = generateSessionToken({ isMaster: false, isDecoy: true });
        return res.json({
          success: true,
          isDecoy: true,
          token,
          message: 'Decoy vault unlocked'
        });
      }
    }

    return res.status(401).json({
      success: false,
      error: 'Incorrect Password. Access Denied.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Reset Master Password via Recovery Key
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { recoveryKey, newPassword } = req.body;
    if (!recoveryKey || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Valid recovery key and new password (min 4 chars) are required' });
    }

    const config = await getAuthConfig();
    if (!config.isConfigured) {
      return res.status(400).json({ success: false, error: 'Vault is not configured' });
    }

    const cleanRecoveryKey = recoveryKey.trim().toUpperCase();
    const computedRecoveryHash = hashPassword(cleanRecoveryKey, config.recoverySalt);

    if (computedRecoveryHash !== config.recoveryHashToken) {
      return res.status(401).json({ success: false, error: 'Invalid Recovery Key' });
    }

    // Update Master Password with new salt
    const newSalt = generateSalt();
    const newHashToken = hashPassword(newPassword, newSalt);

    config.salt = newSalt;
    config.hashToken = newHashToken;
    config.updatedAt = new Date().toISOString();

    await saveAuthConfig(config);

    const token = generateSessionToken({ isMaster: true, isDecoy: false });

    res.json({
      success: true,
      message: 'Master Password has been reset successfully!',
      token
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Change Password (when already authenticated)
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters' });
    }

    const config = await getAuthConfig();
    const computedHash = hashPassword(currentPassword, config.salt);
    if (computedHash !== config.hashToken) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const newSalt = generateSalt();
    config.salt = newSalt;
    config.hashToken = hashPassword(newPassword, newSalt);
    config.updatedAt = new Date().toISOString();

    await saveAuthConfig(config);

    const token = generateSessionToken({ isMaster: true, isDecoy: false });

    res.json({
      success: true,
      message: 'Master Password changed successfully!',
      token
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Set / Update Decoy Panic Password
app.post('/api/auth/decoy-password', requireAuth, async (req, res) => {
  try {
    const { decoyPassword, enable } = req.body;
    const config = await getAuthConfig();

    if (!enable) {
      config.decoySalt = null;
      config.decoyHashToken = null;
    } else {
      if (!decoyPassword || decoyPassword.length < 4) {
        return res.status(400).json({ success: false, error: 'Decoy password must be at least 4 characters' });
      }
      const decoySalt = generateSalt();
      config.decoySalt = decoySalt;
      config.decoyHashToken = hashPassword(decoyPassword, decoySalt);
    }

    config.updatedAt = new Date().toISOString();
    await saveAuthConfig(config);

    res.json({
      success: true,
      message: enable ? 'Panic / Decoy Password configured successfully!' : 'Decoy password disabled'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Update Vault Preferences (Camouflage default, Auto-lock timer)
app.post('/api/auth/update-settings', requireAuth, async (req, res) => {
  try {
    const { defaultCamouflage, autoLockMinutes } = req.body;
    const config = await getAuthConfig();

    if (typeof defaultCamouflage === 'boolean') {
      config.defaultCamouflage = defaultCamouflage;
    }
    if (typeof autoLockMinutes === 'number') {
      config.autoLockMinutes = autoLockMinutes;
    }

    await saveAuthConfig(config);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        defaultCamouflage: config.defaultCamouflage,
        autoLockMinutes: config.autoLockMinutes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// STORAGE & VAULT API ENDPOINTS
// ============================================================

// 1. Health & Server Info
app.get('/api/health', async (req, res) => {
  const mode = getStorageMode();
  const config = await getAuthConfig();
  res.json({
    status: 'online',
    service: 'Magic Cal Stealth Cloud Vault',
    version: '2.0.0',
    storageMode: mode,
    isVercelBlobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
    isVaultProtected: !!config.isConfigured,
    tokenPrefix: process.env.BLOB_READ_WRITE_TOKEN ? process.env.BLOB_READ_WRITE_TOKEN.substring(0, 10) + '...' : 'none',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// 2. Storage Statistics & Quota (Protected)
app.get('/api/storage/stats', requireAuth, async (req, res) => {
  try {
    const isDecoy = req.session && req.session.isDecoy;
    if (isDecoy) {
      // In decoy mode, return mock safe empty stats
      return res.json({
        success: true,
        mode: getStorageMode(),
        isDecoy: true,
        stats: {
          totalFiles: 0,
          totalBytes: 0,
          totalFormatted: '0 B',
          quotaBytes: VERCEL_FREE_QUOTA_BYTES,
          quotaFormatted: formatBytes(VERCEL_FREE_QUOTA_BYTES),
          freeBytes: VERCEL_FREE_QUOTA_BYTES,
          freeFormatted: formatBytes(VERCEL_FREE_QUOTA_BYTES),
          usedPercentage: 0,
          categoryBreakdown: {
            image: { count: 0, bytes: 0 },
            document: { count: 0, bytes: 0 },
            archive: { count: 0, bytes: 0 },
            video: { count: 0, bytes: 0 },
            audio: { count: 0, bytes: 0 },
            code: { count: 0, bytes: 0 },
            other: { count: 0, bytes: 0 }
          }
        }
      });
    }

    const files = await getAllFiles();
    const totalBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const quotaBytes = VERCEL_FREE_QUOTA_BYTES;
    const usedPercentage = Math.min(100, (totalBytes / quotaBytes) * 100);
    const freeBytes = Math.max(0, quotaBytes - totalBytes);

    const categoryBreakdown = {
      image: { count: 0, bytes: 0 },
      document: { count: 0, bytes: 0 },
      archive: { count: 0, bytes: 0 },
      video: { count: 0, bytes: 0 },
      audio: { count: 0, bytes: 0 },
      code: { count: 0, bytes: 0 },
      other: { count: 0, bytes: 0 }
    };

    files.forEach(f => {
      const cat = f.category || 'other';
      if (categoryBreakdown[cat]) {
        categoryBreakdown[cat].count++;
        categoryBreakdown[cat].bytes += f.size || 0;
      }
    });

    res.json({
      success: true,
      mode: getStorageMode(),
      stats: {
        totalFiles: files.length,
        totalBytes,
        totalFormatted: formatBytes(totalBytes),
        quotaBytes,
        quotaFormatted: formatBytes(quotaBytes),
        freeBytes,
        freeFormatted: formatBytes(freeBytes),
        usedPercentage: parseFloat(usedPercentage.toFixed(2)),
        categoryBreakdown
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate storage statistics'
    });
  }
});

// 3. List all files (Protected)
app.get('/api/storage/files', requireAuth, async (req, res) => {
  try {
    const isDecoy = req.session && req.session.isDecoy;
    if (isDecoy) {
      // In decoy mode, return empty or safe sample files
      return res.json({
        success: true,
        count: 0,
        total: 0,
        mode: getStorageMode(),
        isDecoy: true,
        files: []
      });
    }

    const { search, category, limit, offset } = req.query;
    let files = await getAllFiles();

    // Sort newest first
    files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    // Filter by search query
    if (search) {
      const q = search.toLowerCase();
      files = files.filter(f => f.name.toLowerCase().includes(q));
    }

    // Filter by category
    if (category && category !== 'all') {
      files = files.filter(f => f.category === category);
    }

    const total = files.length;
    if (offset) files = files.slice(parseInt(offset, 10));
    if (limit) files = files.slice(0, parseInt(limit, 10));

    res.json({
      success: true,
      count: files.length,
      total,
      mode: getStorageMode(),
      files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list storage files'
    });
  }
});

// 4. File Upload (Protected)
app.post('/api/storage/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided in request' });
    }

    const mode = getStorageMode();
    const uploadedResults = [];

    for (const file of req.files) {
      const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}-${cleanFileName}`;
      let uploadedToBlob = false;

      if (mode === 'vercel-blob') {
        let blob = null;
        let blobError = null;

        // Try private access first
        try {
          const putOptions = {
            access: 'private',
            contentType: file.mimetype || 'application/octet-stream'
          };
          if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '') {
            putOptions.token = process.env.BLOB_READ_WRITE_TOKEN.trim();
          }
          blob = await vercelBlob.put(uniqueFileName, file.buffer, putOptions);
        } catch (privErr) {
          blobError = privErr;
          // Fallback to public access
          try {
            const pubOptions = {
              access: 'public',
              contentType: file.mimetype || 'application/octet-stream'
            };
            if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '') {
              pubOptions.token = process.env.BLOB_READ_WRITE_TOKEN.trim();
            }
            blob = await vercelBlob.put(uniqueFileName, file.buffer, pubOptions);
            blobError = null;
          } catch (pubErr) {
            blobError = pubErr;
          }
        }

        if (blob) {
          uploadedResults.push({
            name: uniqueFileName,
            originalName: file.originalname,
            url: blob.url,
            downloadUrl: blob.downloadUrl || blob.url,
            pathname: blob.pathname,
            size: file.size,
            sizeFormatted: formatBytes(file.size),
            contentType: blob.contentType,
            uploadedAt: new Date().toISOString(),
            source: 'vercel-blob'
          });
          uploadedToBlob = true;
        } else if (isServerless && blobError) {
          return res.status(500).json({
            success: false,
            error: `Vercel Blob upload failed: ${blobError.message}`
          });
        }
      }

      if (!uploadedToBlob) {
        // Fallback local storage upload
        const targetPath = path.join(LOCAL_STORAGE_DIR, uniqueFileName);
        try {
          fs.writeFileSync(targetPath, file.buffer);
        } catch (fsErr) {
          console.warn('Local file write fallback:', fsErr.message);
        }

        uploadedResults.push({
          name: uniqueFileName,
          originalName: file.originalname,
          url: `/api/storage/local/${encodeURIComponent(uniqueFileName)}`,
          downloadUrl: `/api/storage/local/${encodeURIComponent(uniqueFileName)}?download=1`,
          pathname: uniqueFileName,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          contentType: file.mimetype || 'application/octet-stream',
          uploadedAt: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadedResults.length} file(s)`,
      mode,
      files: uploadedResults
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'File upload failed'
    });
  }
});

// 5. Delete file (Protected)
app.delete('/api/storage/delete', requireAuth, async (req, res) => {
  try {
    const target = req.query.url || req.query.pathname || (req.body && (req.body.url || req.body.pathname));
    if (!target) {
      return res.status(400).json({ success: false, error: 'Must provide url or pathname to delete' });
    }

    const mode = getStorageMode();

    if (mode === 'vercel-blob') {
      const delOptions = {};
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        delOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
      }
      await vercelBlob.del(target, delOptions);
    } else {
      const fileName = path.basename(target);
      const filePath = path.join(LOCAL_STORAGE_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({
      success: true,
      message: 'File deleted successfully',
      target
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file'
    });
  }
});

// 6. Local file serve (for dev mode, protected)
app.get('/api/storage/local/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(LOCAL_STORAGE_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  if (req.query.download) {
    res.download(filePath, safeName);
  } else {
    res.sendFile(filePath);
  }
});

// Static UI files (for local testing & standalone execution)
const PUBLIC_DIR = path.join(process.cwd(), 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// Start standalone server when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Magic Cal Stealth Cloud Vault running!`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`📦 Storage Mode: ${getStorageMode().toUpperCase()}`);
    console.log(`=========================================`);
  });
}

// Export for Vercel Serverless Function
module.exports = app;
