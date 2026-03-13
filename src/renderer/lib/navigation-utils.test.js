import {
  buildRadicleDisabledUrl,
  getRadicleDisplayUrl,
  resolveProtocolIconType,
} from './navigation-utils.js';

describe('navigation-utils', () => {
  describe('resolveProtocolIconType', () => {
    test('defaults to http and handles dweb protocols', () => {
      expect(resolveProtocolIconType({ value: '' })).toBe('http');
      expect(resolveProtocolIconType({ value: 'bzz://hash' })).toBe('swarm');
      expect(resolveProtocolIconType({ value: 'ipfs://cid' })).toBe('ipfs');
      expect(resolveProtocolIconType({ value: 'ipns://name' })).toBe('ipns');
      expect(resolveProtocolIconType({ value: 'https://example.com' })).toBe('https');
    });

    test('maps ens names through resolved protocols', () => {
      expect(
        resolveProtocolIconType({
          value: 'ens://vitalik.eth',
          ensProtocols: new Map([['vitalik.eth', 'ipfs']]),
        })
      ).toBe('ipfs');
      expect(
        resolveProtocolIconType({
          value: 'vitalik.eth/docs',
          ensProtocols: new Map(),
        })
      ).toBe('http');
    });

    test('hides icons for internal pages and gates radicle on settings', () => {
      expect(resolveProtocolIconType({ value: 'freedom://history' })).toBeNull();
      expect(resolveProtocolIconType({ value: 'rad://rid' })).toBe('http');
      expect(
        resolveProtocolIconType({
          value: 'rad://rid',
          enableRadicleIntegration: true,
        })
      ).toBe('radicle');
    });

    test('prefers secure icon when the page is marked secure', () => {
      expect(
        resolveProtocolIconType({
          value: 'example.com',
          currentPageSecure: true,
        })
      ).toBe('https');
    });
  });

  describe('buildRadicleDisabledUrl', () => {
    test('creates a rad-browser disabled url and preserves input', () => {
      expect(buildRadicleDisabledUrl('file:///app/index.html')).toBe(
        'file:///app/pages/rad-browser.html?error=disabled'
      );
      expect(buildRadicleDisabledUrl('file:///app/index.html', 'rad://zabc')).toBe(
        'file:///app/pages/rad-browser.html?error=disabled&input=rad%3A%2F%2Fzabc'
      );
    });
  });

  describe('getRadicleDisplayUrl', () => {
    test('reconstructs rad urls from rad-browser pages', () => {
      expect(
        getRadicleDisplayUrl('file:///app/pages/rad-browser.html?rid=zabc123&path=/tree/main')
      ).toBe('rad://zabc123/tree/main');
      expect(getRadicleDisplayUrl('file:///app/pages/rad-browser.html?path=/tree/main')).toBeNull();
      expect(getRadicleDisplayUrl('https://example.com')).toBeNull();
      expect(getRadicleDisplayUrl('not-a-url')).toBeNull();
    });
  });
});
