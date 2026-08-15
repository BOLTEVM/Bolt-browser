/**
 * DSwarm Permissions Service
 * Manages origin-based permissions for dApps accessing dswarm topics and dweb drives.
 */

const { loadSettings, saveSettings } = require('../settings-store');
const log = require('../logger');

const PERMISSION_TYPES = {
  SWARM_JOIN: 'dswarm:join',
  SWARM_BROADCAST: 'dswarm:broadcast',
  DWEB_READ: 'dweb:read',
  DWEB_WRITE: 'dweb:write',
};

const DEFAULT_POLICY = {
  ALLOW_READ: true,
  ALLOW_JOIN_PROMPT: true,
  ALLOW_WRITE_PROMPT: true,
};

/**
 * Check if an origin is permitted for a specific dswarm action
 */
async function checkDSwarmPermission(origin, permissionType, target = '*') {
  if (!origin) return false;

  const settings = await loadSettings();
  const dswarmPerms = settings?.dswarmPermissions || {};
  const originPerms = dswarmPerms[origin] || {};

  // Check explicit permission for this target or wildcard
  if (originPerms[permissionType]) {
    const allowed = originPerms[permissionType];
    if (Array.isArray(allowed)) {
      return allowed.includes(target) || allowed.includes('*');
    }
    return Boolean(allowed);
  }

  // Default read-only policies are auto-allowed
  if (permissionType === PERMISSION_TYPES.DWEB_READ && DEFAULT_POLICY.ALLOW_READ) {
    return true;
  }

  return false;
}

/**
 * Grant permission to an origin for a dswarm action
 */
async function grantDSwarmPermission(origin, permissionType, target = '*') {
  if (!origin) return;

  const settings = await loadSettings();
  const dswarmPerms = { ...(settings?.dswarmPermissions || {}) };
  const originPerms = { ...(dswarmPerms[origin] || {}) };

  const existing = Array.isArray(originPerms[permissionType])
    ? originPerms[permissionType]
    : [];

  if (!existing.includes(target)) {
    existing.push(target);
  }

  originPerms[permissionType] = existing;
  dswarmPerms[origin] = originPerms;

  await saveSettings({ ...settings, dswarmPermissions: dswarmPerms });
  log.info(`[dswarm-permissions] granted ${permissionType} for ${origin} on target ${target}`);
}

/**
 * Revoke all permissions for an origin
 */
async function revokeDSwarmPermissions(origin) {
  if (!origin) return;

  const settings = await loadSettings();
  const dswarmPerms = { ...(settings?.dswarmPermissions || {}) };
  delete dswarmPerms[origin];

  await saveSettings({ ...settings, dswarmPermissions: dswarmPerms });
  log.info(`[dswarm-permissions] revoked all permissions for ${origin}`);
}

module.exports = {
  PERMISSION_TYPES,
  checkDSwarmPermission,
  grantDSwarmPermission,
  revokeDSwarmPermissions,
};
