const {
  checkDSwarmPermission,
  grantDSwarmPermission,
  revokeDSwarmPermissions,
  PERMISSION_TYPES,
} = require('./dswarm-permissions');

// Mock settings store
let mockSettings = {};
jest.mock('../settings-store', () => ({
  loadSettings: jest.fn(async () => mockSettings),
  saveSettings: jest.fn(async (s) => {
    mockSettings = s;
  }),
}));

describe('DSwarm Permissions', () => {
  beforeEach(() => {
    mockSettings = { dswarmPermissions: {} };
  });

  test('auto-allows read permission by default', async () => {
    const allowed = await checkDSwarmPermission('https://example-dapp.eth', PERMISSION_TYPES.DWEB_READ);
    expect(allowed).toBe(true);
  });

  test('denies ungranted topic join permission', async () => {
    const allowed = await checkDSwarmPermission('https://untrusted-dapp.com', PERMISSION_TYPES.SWARM_JOIN, 'secret-topic');
    expect(allowed).toBe(false);
  });

  test('grants and checks topic join permission', async () => {
    await grantDSwarmPermission('https://trusted-dapp.eth', PERMISSION_TYPES.SWARM_JOIN, 'my-topic');
    
    const allowed = await checkDSwarmPermission('https://trusted-dapp.eth', PERMISSION_TYPES.SWARM_JOIN, 'my-topic');
    expect(allowed).toBe(true);

    const otherTopicAllowed = await checkDSwarmPermission('https://trusted-dapp.eth', PERMISSION_TYPES.SWARM_JOIN, 'other-topic');
    expect(otherTopicAllowed).toBe(false);
  });

  test('revokes all permissions for an origin', async () => {
    await grantDSwarmPermission('https://temp-dapp.eth', PERMISSION_TYPES.SWARM_JOIN, 'my-topic');
    await revokeDSwarmPermissions('https://temp-dapp.eth');

    const allowed = await checkDSwarmPermission('https://temp-dapp.eth', PERMISSION_TYPES.SWARM_JOIN, 'my-topic');
    expect(allowed).toBe(false);
  });
});
