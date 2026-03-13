export const resolveProtocolIconType = ({
  value = '',
  ensProtocols = new Map(),
  enableRadicleIntegration = false,
  currentPageSecure = false,
} = {}) => {
  const normalizedValue = value.toLowerCase();
  let protocol = 'http';

  if (normalizedValue.startsWith('ens://') || normalizedValue.endsWith('.eth') || normalizedValue.endsWith('.box')) {
    const ensName = normalizedValue.startsWith('ens://')
      ? normalizedValue.slice(6).split('/')[0]
      : normalizedValue.split('/')[0];
    protocol = ensProtocols.get(ensName) || 'http';
  } else if (normalizedValue.startsWith('bzz://')) {
    protocol = 'swarm';
  } else if (normalizedValue.startsWith('ipfs://')) {
    protocol = 'ipfs';
  } else if (normalizedValue.startsWith('ipns://')) {
    protocol = 'ipns';
  } else if (normalizedValue.startsWith('rad://') && enableRadicleIntegration) {
    protocol = 'radicle';
  } else if (normalizedValue.startsWith('freedom://')) {
    protocol = null;
  } else if (normalizedValue.startsWith('https://') || currentPageSecure) {
    protocol = 'https';
  }

  return protocol;
};

export const buildRadicleDisabledUrl = (baseHref, inputValue = '') => {
  const errorUrl = new URL('pages/rad-browser.html', baseHref);
  errorUrl.searchParams.set('error', 'disabled');
  if (inputValue) {
    errorUrl.searchParams.set('input', inputValue);
  }
  return errorUrl.toString();
};

export const getRadicleDisplayUrl = (url) => {
  if (!url || !url.includes('rad-browser.html')) return null;
  try {
    const parsed = new URL(url);
    const rid = parsed.searchParams.get('rid');
    const path = parsed.searchParams.get('path') || '';
    if (rid) {
      return `rad://${rid}${path}`;
    }
  } catch {
    // Ignore parse errors.
  }
  return null;
};
