const { DSwarmManager, STATUS } = require('./dswarm-manager');

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
jest.mock('../service-registry', () => ({
  MODE: { BUNDLED: 'bundled' },
  DEFAULTS: { dswarm: { dhtPort: 49737, p2pPort: 49738 } },
  updateService: jest.fn(),
  setStatusMessage: jest.fn(),
  setErrorState: jest.fn(),
  clearErrorState: jest.fn(),
  clearService: jest.fn(),
}));

describe('DSwarmManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DSwarmManager();
  });

  afterEach(async () => {
    if (manager) {
      await manager.stop();
    }
  });

  test('initializes with stopped status and generated keypair', () => {
    const status = manager.getStatus();
    expect(status.status).toBe(STATUS.STOPPED);
    expect(status.publicKey).toBeDefined();
    expect(status.publicKey.length).toBe(64);
  });

  test('starts and transitions to RUNNING status', async () => {
    const status = await manager.start();
    expect(status.status).toBe(STATUS.RUNNING);
    expect(status.telemetry.dhtNodes).toBeGreaterThan(0);
  });

  test('asynchronously joins and leaves a topic', async () => {
    await manager.start();

    // Join topic
    const joinRes = await manager.joinTopic('test-community-topic');
    expect(joinRes.active).toBe(true);
    expect(joinRes.topic).toBeDefined();
    expect(manager.getStatus().activeTopics.length).toBe(1);

    // Leave topic
    const leaveRes = await manager.leaveTopic('test-community-topic');
    expect(leaveRes.active).toBe(false);
    expect(manager.getStatus().activeTopics.length).toBe(0);
  });

  test('broadcasts message to topic subscribers', async () => {
    await manager.start();

    const broadcastRes = await manager.broadcast('chat-room-1', {
      text: 'Hello decentralized world',
    });

    expect(broadcastRes.success).toBe(true);
    expect(broadcastRes.messageId).toBeDefined();
    expect(manager.telemetry.bytesSent).toBeGreaterThan(0);
  });

  test('stops and clears all active topics and connections', async () => {
    await manager.start();
    await manager.joinTopic('topic-1');
    await manager.joinTopic('topic-2');
    expect(manager.getStatus().activeTopics.length).toBe(2);

    const stopStatus = await manager.stop();
    expect(stopStatus.status).toBe(STATUS.STOPPED);
    expect(stopStatus.activeTopics.length).toBe(0);
  });
});
