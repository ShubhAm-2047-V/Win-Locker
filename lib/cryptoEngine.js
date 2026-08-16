const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32; // 256 bits
const IV_LEN = 12;  // 96 bits standard for GCM
const AUTH_TAG_LEN = 16;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';

/**
 * Derive 256-bit encryption key from master password and salt using PBKDF2
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, PBKDF2_DIGEST);
}

/**
 * Generate a random salt
 */
function generateSalt() {
  return crypto.randomBytes(16);
}

/**
 * Generate a secure 24-character Recovery Key
 */
function generateRecoveryKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    result += chars[bytes[i] % chars.length];
  }
  // Format into WINK-XXXX-XXXX-XXXX-XXXX
  return `WINK-${result.slice(0, 4)}-${result.slice(4, 8)}-${result.slice(8, 12)}-${result.slice(12, 16)}`;
}

/**
 * Hash password with salt for stored verification token
 */
function hashPassword(password, salt) {
  const key = deriveKey(password, salt);
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Encrypt a buffer in memory
 */
function encryptBuffer(buffer, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: IV (12 bytes) + AuthTag (16 bytes) + EncryptedData
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt a packed buffer in memory
 */
function decryptBuffer(packedBuffer, key) {
  if (packedBuffer.length < IV_LEN + AUTH_TAG_LEN) {
    throw new Error('Invalid encrypted payload size');
  }
  const iv = packedBuffer.subarray(0, IV_LEN);
  const authTag = packedBuffer.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encryptedText = packedBuffer.subarray(IV_LEN + AUTH_TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedText), decipher.final()]);
}

/**
 * Stream encrypt a file to destination path
 */
function encryptFileStream(sourceFilePath, destFilePath, key) {
  return new Promise((resolve, reject) => {
    try {
      const iv = crypto.randomBytes(IV_LEN);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      const input = fs.createReadStream(sourceFilePath);
      const output = fs.createWriteStream(destFilePath);

      // Write IV first
      output.write(iv);
      // Leave space for AuthTag placeholder at bytes 12..27, or write tag at end
      // For simplicity & robustness, we write IV at start, stream cipher output, then append 16-byte AuthTag at end.
      
      input.on('error', (err) => reject(err));
      output.on('error', (err) => reject(err));

      input.pipe(cipher).pipe(output, { end: false });

      cipher.on('end', () => {
        const authTag = cipher.getAuthTag();
        output.write(authTag, () => {
          output.end();
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Stream decrypt a file to destination path or buffer
 */
function decryptFileStream(encryptedFilePath, destFilePath, key) {
  return new Promise((resolve, reject) => {
    try {
      const stat = fs.statSync(encryptedFilePath);
      if (stat.size < IV_LEN + AUTH_TAG_LEN) {
        return reject(new Error('Encrypted file corrupted or truncated'));
      }

      // Read IV (first 12 bytes) and AuthTag (last 16 bytes)
      const fd = fs.openSync(encryptedFilePath, 'r');
      const iv = Buffer.alloc(IV_LEN);
      fs.readSync(fd, iv, 0, IV_LEN, 0);

      const authTag = Buffer.alloc(AUTH_TAG_LEN);
      fs.readSync(fd, authTag, 0, AUTH_TAG_LEN, stat.size - AUTH_TAG_LEN);
      fs.closeSync(fd);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const encryptedDataStream = fs.createReadStream(encryptedFilePath, {
        start: IV_LEN,
        end: stat.size - AUTH_TAG_LEN - 1
      });

      const output = fs.createWriteStream(destFilePath);

      encryptedDataStream.on('error', (err) => reject(err));
      output.on('error', (err) => reject(err));

      encryptedDataStream.pipe(decipher).pipe(output);

      output.on('finish', () => resolve());
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Decrypt file into memory Buffer (for previewing images/video/documents in app)
 */
function decryptFileToBuffer(encryptedFilePath, key) {
  return new Promise((resolve, reject) => {
    try {
      const stat = fs.statSync(encryptedFilePath);
      if (stat.size < IV_LEN + AUTH_TAG_LEN) {
        return reject(new Error('Encrypted file corrupted'));
      }

      const fd = fs.openSync(encryptedFilePath, 'r');
      const iv = Buffer.alloc(IV_LEN);
      fs.readSync(fd, iv, 0, IV_LEN, 0);

      const authTag = Buffer.alloc(AUTH_TAG_LEN);
      fs.readSync(fd, authTag, 0, AUTH_TAG_LEN, stat.size - AUTH_TAG_LEN);
      fs.closeSync(fd);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const chunks = [];
      const encryptedDataStream = fs.createReadStream(encryptedFilePath, {
        start: IV_LEN,
        end: stat.size - AUTH_TAG_LEN - 1
      });

      encryptedDataStream.on('data', (chunk) => {
        const decryptedChunk = decipher.update(chunk);
        if (decryptedChunk.length > 0) chunks.push(decryptedChunk);
      });

      encryptedDataStream.on('end', () => {
        try {
          const finalChunk = decipher.final();
          if (finalChunk.length > 0) chunks.push(finalChunk);
          resolve(Buffer.concat(chunks));
        } catch (err) {
          reject(new Error('Decryption authentication failed. Incorrect key or tampered file.'));
        }
      });

      encryptedDataStream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  deriveKey,
  generateSalt,
  generateRecoveryKey,
  hashPassword,
  encryptBuffer,
  decryptBuffer,
  encryptFileStream,
  decryptFileStream,
  decryptFileToBuffer
};
