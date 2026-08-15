/**
 * DWeb Storage & Hyperdrive Stream Engine
 * Handles asynchronous file resolution, chunk caching, range requests, and content verification.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('../logger');

// Common MIME Types map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

class DWebStorage {
  constructor(storageDir = null) {
    this.storageDir =
      storageDir ||
      path.join(
        process.env.APPDATA ||
          (process.platform === 'darwin'
            ? path.join(process.env.HOME || '', 'Library', 'Application Support')
            : path.join(process.env.HOME || '', '.config')),
        'Bolt',
        'dweb-storage'
      );

    this.drives = new Map(); // key -> drive metadata
    this.memoryCache = new Map(); // key:path -> Buffer
    this._ensureStorageDir();
  }

  _ensureStorageDir() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      log.warn('[dweb-storage] failed to create storage dir:', err.message);
    }
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  /**
   * Register or mount a local/remote drive key
   */
  registerDrive(keyHex, metadata = {}) {
    const normalizedKey = keyHex.toLowerCase();
    const driveInfo = {
      key: normalizedKey,
      writable: Boolean(metadata.writable),
      version: metadata.version || 1,
      files: metadata.files || new Map(),
      createdAt: metadata.createdAt || Date.now(),
      lastAccessed: Date.now(),
    };
    this.drives.set(normalizedKey, driveInfo);
    return driveInfo;
  }

  /**
   * Asynchronously store a file into a drive
   */
  async writeFile(keyHex, filePath, contentBuffer) {
    const normalizedKey = keyHex.toLowerCase();
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const cacheKey = `${normalizedKey}:${cleanPath}`;

    let drive = this.drives.get(normalizedKey);
    if (!drive) {
      drive = this.registerDrive(normalizedKey, { writable: true });
    }

    const buffer = Buffer.isBuffer(contentBuffer)
      ? contentBuffer
      : Buffer.from(contentBuffer);

    this.memoryCache.set(cacheKey, buffer);
    drive.files.set(cleanPath, {
      size: buffer.length,
      mimeType: this.getMimeType(cleanPath),
      modified: Date.now(),
      hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    });

    return {
      path: cleanPath,
      size: buffer.length,
      mimeType: this.getMimeType(cleanPath),
    };
  }

  /**
   * Asynchronously read a file from a drive with optional range request
   */
  async readFile(keyHex, filePath, options = {}) {
    const normalizedKey = keyHex.toLowerCase();
    let cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    if (cleanPath.endsWith('/')) {
      cleanPath += 'index.html';
    }

    const cacheKey = `${normalizedKey}:${cleanPath}`;
    let buffer = this.memoryCache.get(cacheKey);

    // If not in cache, check index fallback if root
    if (!buffer && cleanPath === '/') {
      buffer = this.memoryCache.get(`${normalizedKey}:/index.html`);
      cleanPath = '/index.html';
    }

    if (!buffer) {
      // Return 404
      const error = new Error(`File not found: ${cleanPath} in drive ${normalizedKey}`);
      error.code = 'ENOENT';
      throw error;
    }

    const totalSize = buffer.length;
    const mimeType = this.getMimeType(cleanPath);

    // Handle range request (e.g. video/audio streaming)
    if (options.range) {
      const { start = 0, end = totalSize - 1 } = options.range;
      const sliced = buffer.subarray(start, end + 1);
      return {
        data: sliced,
        mimeType,
        totalSize,
        range: { start, end },
        isPartial: true,
      };
    }

    return {
      data: buffer,
      mimeType,
      totalSize,
      isPartial: false,
    };
  }

  /**
   * Get metadata info for a drive
   */
  async getDriveInfo(keyHex) {
    const normalizedKey = keyHex.toLowerCase();
    const drive = this.drives.get(normalizedKey);
    if (!drive) {
      return {
        key: normalizedKey,
        exists: false,
        filesCount: 0,
      };
    }

    return {
      key: normalizedKey,
      exists: true,
      writable: drive.writable,
      version: drive.version,
      filesCount: drive.files.size,
      files: Array.from(drive.files.entries()).map(([p, meta]) => ({
        path: p,
        ...meta,
      })),
    };
  }

  /**
   * Clear in-memory cache
   */
  clearCache() {
    this.memoryCache.clear();
  }
}

// Global Singleton
let defaultStorage = null;

function getDWebStorage() {
  if (!defaultStorage) {
    defaultStorage = new DWebStorage();
  }
  return defaultStorage;
}

module.exports = {
  DWebStorage,
  getDWebStorage,
  MIME_TYPES,
};
