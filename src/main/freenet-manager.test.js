const { FreenetManager, STATUS } = require('./freenet-manager');

// Mock Electron BrowserWindow
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Mock Service Registry
jest.mock('./service-registry', () => ({
  MODE: { BUNDLED: 'bundled', REUSED: 'reused' },
  DEFAULTS: { freenet: { httpPort: 50509, wsPort: 50509 } },
  updateService: jest.fn(),
  setStatusMessage: jest.fn(),
  setErrorState: jest.fn(),
  clearErrorState: jest.fn(),
  clearService: jest.fn(),
}));

describe('FreenetManager', () => {
  let manager;

  beforeEach(() => {
    manager = new FreenetManager();
  });

  afterEach(async () => {
    if (manager) {
      await manager.stop();
    }
  });

  test('initializes with stopped status', () => {
    const status = manager.getStatus();
    expect(status.status).toBe(STATUS.STOPPED);
    expect(status.httpPort).toBe(50509);
    expect(status.wsPort).toBe(50509);
    expect(status.gatewayUrl).toBe('http://127.0.0.1:50509');
    expect(status.wsUrl).toBe('ws://127.0.0.1:50509/ws');
  });

  test('starts and transitions to RUNNING status with healthy check', async () => {
    // Mock health check returning true
    jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);

    const status = await manager.start();
    expect(status.status).toBe(STATUS.RUNNING);
    expect(status.peerCount).toBeGreaterThan(0);
  });

  test('stops and clears service registration', async () => {
    jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
    await manager.start();
    expect(manager.getStatus().status).toBe(STATUS.RUNNING);

    const stopStatus = await manager.stop();
    expect(stopStatus.status).toBe(STATUS.STOPPED);
    expect(stopStatus.peerCount).toBe(0);
  });
});
