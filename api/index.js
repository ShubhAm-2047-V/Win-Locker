const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Helper: Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Determine category by extension
function categorizeFileType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const docExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.csv', '.xlsx', '.pptx'];
  const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.enc', '.vault'];
  const mediaExts = ['.mp3', '.wav', '.ogg', '.mp4', '.mkv', '.avi', '.mov'];
  const codeExts = ['.js', '.json', '.html', '.css', '.py', '.ts', '.java', '.cpp', '.c', '.sh'];

  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  if (archiveExts.includes(ext)) return 'archive';
  if (mediaExts.includes(ext)) return 'media';
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

// Helper: Fetch all items
async function getAllFiles() {
  const mode = getStorageMode();

  if (mode === 'vercel-blob') {
    try {
      const listOptions = {};
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        listOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
      }
      const response = await vercelBlob.list(listOptions);
      return (response.blobs || []).map(blob => ({
        id: blob.url,
        name: blob.pathname,
        pathname: blob.pathname,
        url: blob.url,
        downloadUrl: blob.downloadUrl || blob.url,
        size: blob.size,
        sizeFormatted: formatBytes(blob.size),
        uploadedAt: blob.uploadedAt,
        contentType: blob.contentType || 'application/octet-stream',
        category: categorizeFileType(blob.pathname),
        source: 'vercel-blob'
      }));
    } catch (error) {
      console.error('Error fetching Vercel blobs:', error.message);
      // Fallback to local if vercelBlob fails due to unlinked store
      if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
        return [];
      }
      throw error;
    }
  } else {
    // Local storage listing
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) return [];
    const files = fs.readdirSync(LOCAL_STORAGE_DIR);
    return files.map(file => {
      const filePath = path.join(LOCAL_STORAGE_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        id: file,
        name: file,
        pathname: file,
        url: `/api/storage/local/${encodeURIComponent(file)}`,
        downloadUrl: `/api/storage/local/${encodeURIComponent(file)}?download=1`,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        uploadedAt: stats.mtime,
        contentType: 'application/octet-stream',
        category: categorizeFileType(file),
        source: 'local-storage'
      };
    });
  }
}

// --- API Endpoints ---

// 1. Health & Server Info
app.get('/api/health', (req, res) => {
  const mode = getStorageMode();
  res.json({
    status: 'online',
    service: 'Vercel Cloud Storage Server',
    version: '1.0.0',
    storageMode: mode,
    isVercelBlobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// 2. Storage Statistics & Quota
app.get('/api/storage/stats', async (req, res) => {
  try {
    const files = await getAllFiles();
    const totalBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const quotaBytes = VERCEL_FREE_QUOTA_BYTES;
    const usedPercentage = Math.min(100, (totalBytes / quotaBytes) * 100);
    const freeBytes = Math.max(0, quotaBytes - totalBytes);

    // Grouping by category
    const categoryBreakdown = {
      image: { count: 0, bytes: 0 },
      document: { count: 0, bytes: 0 },
      archive: { count: 0, bytes: 0 },
      media: { count: 0, bytes: 0 },
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

// 3. List all files
app.get('/api/storage/files', async (req, res) => {
  try {
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

// 4. File Upload (single or multiple)
app.post('/api/storage/upload', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided in request' });
    }

    const mode = getStorageMode();
    const uploadedResults = [];

    for (const file of req.files) {
      const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}-${cleanFileName}`;

      if (mode === 'vercel-blob') {
        const putOptions = {
          access: 'public',
          contentType: file.mimetype || 'application/octet-stream'
        };
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          putOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
        }

        const blob = await vercelBlob.put(uniqueFileName, file.buffer, putOptions);

        uploadedResults.push({
          name: uniqueFileName,
          originalName: file.originalname,
          url: blob.url,
          downloadUrl: blob.downloadUrl || blob.url,
          pathname: blob.pathname,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          contentType: blob.contentType,
          uploadedAt: new Date().toISOString()
        });
      } else {
        // Local upload
        const targetPath = path.join(LOCAL_STORAGE_DIR, uniqueFileName);
        fs.writeFileSync(targetPath, file.buffer);

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

// 5. Delete file
app.delete('/api/storage/delete', async (req, res) => {
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

// 6. Local file serve (for dev mode)
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
    console.log(`🚀 Vercel Storage Server running!`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`📦 Storage Mode: ${getStorageMode().toUpperCase()}`);
    console.log(`=========================================`);
  });
}

// Export for Vercel Serverless Function
module.exports = app;
