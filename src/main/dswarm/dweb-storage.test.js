const { DWebStorage } = require('./dweb-storage');
const path = require('path');
const os = require('os');

describe('DWebStorage', () => {
  let storage;
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), `dweb-test-${Date.now()}`);
    storage = new DWebStorage(tmpDir);
  });

  afterEach(() => {
    if (storage) {
      storage.clearCache();
    }
  });

  test('asynchronously writes and reads a file from a drive', async () => {
    const htmlContent = '<html><body><h1>Welcome to DWeb</h1></body></html>';
    await storage.writeFile(testKey, '/index.html', htmlContent);

    const file = await storage.readFile(testKey, '/index.html');
    expect(file.data.toString()).toBe(htmlContent);
    expect(file.mimeType).toBe('text/html; charset=utf-8');
    expect(file.totalSize).toBe(htmlContent.length);
    expect(file.isPartial).toBe(false);
  });

  test('reads file with byte range for media streaming', async () => {
    const largeContent = Buffer.alloc(1000, 'A');
    await storage.writeFile(testKey, '/video.mp4', largeContent);

    const partial = await storage.readFile(testKey, '/video.mp4', {
      range: { start: 100, end: 199 },
    });

    expect(partial.isPartial).toBe(true);
    expect(partial.data.length).toBe(100);
    expect(partial.totalSize).toBe(1000);
    expect(partial.mimeType).toBe('video/mp4');
  });

  test('throws ENOENT when reading non-existent file', async () => {
    await expect(storage.readFile(testKey, '/nonexistent.txt')).rejects.toThrow(
      'File not found'
    );
  });

  test('returns drive metadata info', async () => {
    await storage.writeFile(testKey, '/style.css', 'body { color: white; }');
    await storage.writeFile(testKey, '/app.js', 'console.log("ready");');

    const info = await storage.getDriveInfo(testKey);
    expect(info.exists).toBe(true);
    expect(info.filesCount).toBe(2);
    expect(info.files.some((f) => f.path === '/style.css')).toBe(true);
  });
});
