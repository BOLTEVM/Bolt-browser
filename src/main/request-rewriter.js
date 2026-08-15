const log = require('./logger');
const { activeBzzBases, activeIpfsBases, activeRadBases, activeDwebBases, activeDswarmBases, activeFreenetBases } = require('./state');
const { getBeeApiUrl, getIpfsGatewayUrl, getRadicleApiUrl, getDSwarmApiUrl, getFreenetGatewayUrl } = require('./service-registry');
const { loadSettings } = require('./settings-store');
const { URL } = require('url');

const sanitizeUrlForLog = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return 'unknown';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'file:') {
      return 'file://<redacted>';
    }
    if (
      parsed.protocol === 'bzz:' ||
      parsed.protocol === 'ipfs:' ||
      parsed.protocol === 'ipns:' ||
      parsed.protocol === 'Bolt:' ||
      parsed.protocol === 'dweb:' ||
      parsed.protocol === 'hyper:' ||
      parsed.protocol === 'dswarm:' ||
      parsed.protocol === 'freenet:'
    ) {
      return `${parsed.protocol}//<redacted>`;
    }
    return parsed.origin;
  } catch {
    if (
      rawUrl.startsWith('bzz://') ||
      rawUrl.startsWith('ipfs://') ||
      rawUrl.startsWith('ipns://') ||
      rawUrl.startsWith('Bolt://') ||
      rawUrl.startsWith('dweb://') ||
      rawUrl.startsWith('hyper://') ||
      rawUrl.startsWith('dswarm://') ||
      rawUrl.startsWith('freenet://')
    ) {
      return `${rawUrl.split('://')[0]}://<redacted>`;
    }
    return 'unknown';
  }
};

// Validate IPFS CID format (mirrors src/renderer/lib/url-utils.js)
function isValidCid(str) {
  if (!str) return false;
  // CIDv0: Qm + 44 base58 chars
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(str)) return true;
  // CIDv1 base32: baf + 50+ lowercase base32 chars
  if (/^baf[a-z2-7]{50,}$/i.test(str)) return true;
  // CIDv1 base58btc: z + 40+ base58 chars
  if (/^z[1-9A-HJ-NP-Za-km-z]{40,}$/.test(str)) return true;
  return false;
}

// Validate IPNS name: DNS name (e.g., docs.ipfs.io) or libp2p key (k51..., 12D3...)
function isValidIpnsName(str) {
  if (!str) return false;
  // Only allow alphanumeric, dots, hyphens, underscores (covers DNS names and base36/base58 keys)
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(str);
}

/**
 * Convert a custom protocol URL (bzz://, ipfs://, ipns://) to a gateway URL
 * Uses service registry for dynamic port resolution.
 * Validates that the URL contains a non-empty hash/CID/name before converting,
 * to avoid sending malformed paths to the gateway.
 * @param {string} url - The URL to check/convert
 * @returns {{ converted: boolean, url: string }} Result with converted flag and URL
 */
function convertProtocolUrl(url) {
  if (!url) {
    return { converted: false, url };
  }

  // Handle bzz:// protocol
  if (url.startsWith('bzz://')) {
    const afterScheme = url.slice(6).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }
    const hash = afterScheme.split(/[/?#]/)[0];
    if (!hash || !/^[a-fA-F0-9]{64}([a-fA-F0-9]{64})?$/.test(hash)) {
      return { converted: false, url };
    }
    const beeApiUrl = getBeeApiUrl();
    const gatewayUrl = `${beeApiUrl}/bzz/${afterScheme}`;
    return { converted: true, url: gatewayUrl };
  }

  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    const afterScheme = url.slice(7).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }
    const cid = afterScheme.split(/[/?#]/)[0];
    if (!cid || !isValidCid(cid)) {
      return { converted: false, url };
    }
    const ipfsGatewayUrl = getIpfsGatewayUrl();
    const gatewayUrl = `${ipfsGatewayUrl}/ipfs/${afterScheme}`;
    return { converted: true, url: gatewayUrl };
  }

  // Handle ipns:// protocol
  if (url.startsWith('ipns://')) {
    const afterScheme = url.slice(7).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }
    const name = afterScheme.split(/[/?#]/)[0];
    if (!name || !isValidIpnsName(name)) {
      return { converted: false, url };
    }
    const ipfsGatewayUrl = getIpfsGatewayUrl();
    const gatewayUrl = `${ipfsGatewayUrl}/ipns/${afterScheme}`;
    return { converted: true, url: gatewayUrl };
  }

  // Handle rad: and rad:// protocols
  // rad:RID or rad://RID -> http://127.0.0.1:8780/api/v1/repos/RID
  // rad:RID/tree/branch/path -> http://127.0.0.1:8780/api/v1/repos/RID/tree/branch/path
  if (url.startsWith('rad:')) {
    if (loadSettings().enableRadicleIntegration !== true) {
      return { converted: false, url };
    }
    // Handle both rad:RID and rad://RID formats
    const remainder = url.startsWith('rad://') ? url.slice(6) : url.slice(4);
    const radicleApiUrl = getRadicleApiUrl();
    // Parse the remainder to extract RID and optional path
    const slashIndex = remainder.indexOf('/');
    const rid = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
    const pathPart = slashIndex === -1 ? '' : remainder.slice(slashIndex);

    // Validate RID: must start with z followed by base58 characters
    if (!/^z[1-9A-HJ-NP-Za-km-z]{20,60}$/.test(rid)) {
      log.warn(`[rewrite] Blocked invalid Radicle RID: ${rid}`);
      return { converted: false, url };
    }

    const gatewayUrl = `${radicleApiUrl}/api/v1/repos/${rid}${pathPart}`;
    return { converted: true, url: gatewayUrl };
  }

  // Handle dweb:// and hyper:// protocols
  if (url.startsWith('dweb://') || url.startsWith('hyper://')) {
    const scheme = url.startsWith('dweb://') ? 'dweb://' : 'hyper://';
    const afterScheme = url.slice(scheme.length).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }
    const key = afterScheme.split(/[/?#]/)[0];
    const pathPart = afterScheme.slice(key.length);
    // Validate 64-char hex or 52-char z-base32
    if (!/^[a-fA-F0-9]{64}$/.test(key) && !/^[a-z0-9]{52}$/i.test(key)) {
      log.warn(`[rewrite] Blocked invalid DWeb/Hyper key: ${key}`);
      return { converted: false, url };
    }
    // Return formatted dweb gateway target
    return { converted: true, url: `dweb://${key}${pathPart || '/'}` };
  }

  // Handle dswarm:// protocol
  if (url.startsWith('dswarm://')) {
    const afterScheme = url.slice(9).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }
    const topic = afterScheme.split(/[/?#]/)[0];
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(topic)) {
      log.warn(`[rewrite] Blocked invalid DSwarm topic: ${topic}`);
      return { converted: false, url };
    }
    return { converted: true, url: `dswarm://${afterScheme}` };
  }

  // Handle freenet:// protocol
  if (url.startsWith('freenet://')) {
    const afterScheme = url.slice(10).replace(/^\/+/, '');
    if (!afterScheme) {
      return { converted: false, url };
    }

    // Check for locallitcoins shortcut alias
    if (afterScheme === 'locallitcoins' || afterScheme.startsWith('locallitcoins/')) {
      const subPath = afterScheme.slice('locallitcoins'.length);
      return { converted: true, url: `http://127.0.0.1:3000${subPath || '/'}` };
    }

    const key = afterScheme.split(/[/?#]/)[0];
    const pathPart = afterScheme.slice(key.length);

    // Validate key: Base58 or valid contract alias
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(key)) {
      log.warn(`[rewrite] Blocked invalid Freenet key: ${key}`);
      return { converted: false, url };
    }

    const freenetGatewayUrl = getFreenetGatewayUrl();
    const gatewayUrl = `${freenetGatewayUrl}/contract/web/${key}${pathPart || '/'}`;
    return { converted: true, url: gatewayUrl };
  }

  return { converted: false, url };
}

/**
 * Determines if a request should be rewritten to stay within a content-addressed context.
 * @param {string} requestUrl - The URL being requested
 * @param {string} baseUrl - The current base URL (bzz or ipfs)
 * @param {string} type - 'bzz' or 'ipfs'
 * @returns {{ shouldRewrite: boolean, reason?: string }} Result with reason if not rewriting
 */
function shouldRewriteRequest(requestUrl, baseUrl) {
  if (!baseUrl) {
    return { shouldRewrite: false, reason: 'no_base_url' };
  }

  let requested;
  let base;
  try {
    requested = new URL(requestUrl);
    base = new URL(baseUrl);
  } catch {
    return { shouldRewrite: false, reason: 'invalid_url' };
  }

  const normalizedPath = requested.pathname.toLowerCase();

  // Don't rewrite requests that are already content-addressed paths
  if (normalizedPath.startsWith('/bzz/')) {
    return { shouldRewrite: false, reason: 'already_bzz_path' };
  }
  if (normalizedPath.startsWith('/ipfs/') || normalizedPath.startsWith('/ipns/')) {
    return { shouldRewrite: false, reason: 'already_ipfs_path' };
  }
  if (normalizedPath.startsWith('/api/v1/repos/')) {
    return { shouldRewrite: false, reason: 'already_rad_path' };
  }
  if (normalizedPath.startsWith('/contract/web/')) {
    return { shouldRewrite: false, reason: 'already_freenet_path' };
  }

  // Don't rewrite cross-origin requests
  if (requested.origin !== base.origin) {
    return { shouldRewrite: false, reason: 'cross_origin' };
  }

  return { shouldRewrite: true };
}

/**
 * Builds the rewritten URL for a request that should stay within the Swarm hash context.
 * @param {string} requestUrl - The URL being requested
 * @param {string} baseUrl - The current bzz base URL (e.g., http://127.0.0.1:1633/bzz/hash/)
 * @returns {string|null} The rewritten URL, or null if URLs are invalid
 */
function buildRewriteTarget(requestUrl, baseUrl) {
  let requested;
  let base;
  try {
    requested = new URL(requestUrl);
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  const relativePath = requested.pathname.replace(/^\//, '');
  return `${base.href}${relativePath}${requested.search}${requested.hash}`;
}

/**
 * Check if a URL targets the Bee API's /bzz/ endpoint with an invalid hash.
 * Blocks requests that would cause "bzz download: invalid path" errors on the Bee node.
 * @param {string} url - The final URL about to be sent
 * @returns {boolean} True if the request should be blocked
 */
function shouldBlockInvalidBzzRequest(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 1 && pathParts[0] === 'bzz') {
      // /bzz/ with no hash or an invalid hash
      const hash = pathParts[1] || '';
      if (!hash || !/^[a-fA-F0-9]{64}([a-fA-F0-9]{64})?$/.test(hash)) {
        return true;
      }
    }
  } catch {
    // Not a valid URL, let it through (will fail naturally)
  }
  return false;
}

function registerRequestRewriter(targetSession) {
  if (!targetSession) {
    return;
  }

  targetSession.webRequest.onBeforeRequest((details, callback) => {
    const webContentsId = details.webContentsId;

    // First, check for custom protocol URLs (bzz://, ipfs://, ipns://)
    const { converted, url: convertedUrl } = convertProtocolUrl(details.url);
    if (converted) {
      log.info(
        `[rewrite:protocol] ${sanitizeUrlForLog(details.url)} -> ${sanitizeUrlForLog(convertedUrl)}`
      );
      callback({ redirectURL: convertedUrl });
      return;
    }

    // Check for Swarm (bzz) base first
    const bzzBaseUrl = activeBzzBases.get(webContentsId);
    if (bzzBaseUrl) {
      const { shouldRewrite } = shouldRewriteRequest(details.url, bzzBaseUrl);
      if (shouldRewrite) {
        const redirectTarget = buildRewriteTarget(details.url, bzzBaseUrl);
        if (redirectTarget) {
          log.info(
            `[rewrite:bzz] ${sanitizeUrlForLog(details.url)} -> ${sanitizeUrlForLog(redirectTarget)}`
          );
          callback({ redirectURL: redirectTarget });
          return;
        }
      }
    }

    // Check for IPFS base
    const ipfsBaseUrl = activeIpfsBases.get(webContentsId);
    if (ipfsBaseUrl) {
      const { shouldRewrite } = shouldRewriteRequest(details.url, ipfsBaseUrl);
      if (shouldRewrite) {
        const redirectTarget = buildRewriteTarget(details.url, ipfsBaseUrl);
        if (redirectTarget) {
          log.info(
            `[rewrite:ipfs] ${sanitizeUrlForLog(details.url)} -> ${sanitizeUrlForLog(redirectTarget)}`
          );
          callback({ redirectURL: redirectTarget });
          return;
        }
      }
    }

    // Check for Radicle base
    const radBaseUrl = activeRadBases.get(webContentsId);
    if (radBaseUrl && loadSettings().enableRadicleIntegration === true) {
      const { shouldRewrite } = shouldRewriteRequest(details.url, radBaseUrl);
      if (shouldRewrite) {
        const redirectTarget = buildRewriteTarget(details.url, radBaseUrl);
        if (redirectTarget) {
          log.info(
            `[rewrite:rad] ${sanitizeUrlForLog(details.url)} -> ${sanitizeUrlForLog(redirectTarget)}`
          );
          callback({ redirectURL: redirectTarget });
          return;
        }
      }
    }

    // Final guard: block requests to /bzz/ with missing or invalid hash
    // to prevent "bzz download: invalid path" errors on the Bee node
    if (shouldBlockInvalidBzzRequest(details.url)) {
      callback({ cancel: true });
      return;
    }

    // No rewrite needed
    callback({});
  });

  if (targetSession.webRequest.onHeadersReceived) {
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      const settings = loadSettings();
      if (settings.enableBoltowsExtension && details.responseHeaders) {
        const cspKey = Object.keys(details.responseHeaders).find(
          (k) => k.toLowerCase() === 'content-security-policy'
        );
        if (cspKey) {
          let csp = details.responseHeaders[cspKey][0];
          // Append chrome-extension to script-src and connect-src
          if (csp.includes('script-src')) {
            csp = csp.replace('script-src', "script-src chrome-extension://*");
          }
          if (csp.includes('connect-src')) {
            csp = csp.replace('connect-src', "connect-src chrome-extension://*");
          }
          details.responseHeaders[cspKey] = [csp];
        }
      }
      callback({ responseHeaders: details.responseHeaders });
    });
  }
}

module.exports = {
  registerRequestRewriter,
  shouldRewriteRequest,
  buildRewriteTarget,
  convertProtocolUrl,
  shouldBlockInvalidBzzRequest,
};
