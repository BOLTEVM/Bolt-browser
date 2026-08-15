import {
  isValidDWebKey,
  isValidDSwarmTopic,
  parseDWebInput,
  parseDSwarmInput,
} from './url-utils.js';

describe('url-utils DWeb and DSwarm integration', () => {
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const validZBase32Key = 'e1xab6ugqy1y7895t7u4r3j45u7k8q21y7895t7u4r3j45u7k8qa';

  test('validates 64-character hex and 52-char z-base32 DWeb keys', () => {
    expect(isValidDWebKey(validHexKey)).toBe(true);
    expect(isValidDWebKey(validZBase32Key)).toBe(true);
    expect(isValidDWebKey('invalid-short-key')).toBe(false);
    expect(isValidDWebKey('')).toBe(false);
    expect(isValidDWebKey(null)).toBe(false);
  });

  test('validates DSwarm topics', () => {
    expect(isValidDSwarmTopic('general-chat')).toBe(true);
    expect(isValidDSwarmTopic(validHexKey)).toBe(true);
    expect(isValidDSwarmTopic('topic_123-node')).toBe(true);
    expect(isValidDSwarmTopic('')).toBe(false);
    expect(isValidDSwarmTopic(null)).toBe(false);
  });

  test('parses dweb:// and hyper:// inputs', () => {
    const parsed1 = parseDWebInput(`dweb://${validHexKey}/index.html`);
    expect(parsed1).toEqual({
      targetUrl: `dweb://${validHexKey}/index.html`,
      displayValue: `dweb://${validHexKey}/index.html`,
      protocol: 'dweb',
    });

    const parsed2 = parseDWebInput(`hyper://${validHexKey}`);
    expect(parsed2).toEqual({
      targetUrl: `dweb://${validHexKey}/`,
      displayValue: `dweb://${validHexKey}/`,
      protocol: 'dweb',
    });

    expect(parseDWebInput('dweb://invalid-key')).toBeNull();
  });

  test('parses dswarm:// inputs', () => {
    const parsed = parseDSwarmInput('dswarm://p2p-trading-room');
    expect(parsed).toEqual({
      targetUrl: 'dswarm://p2p-trading-room',
      displayValue: 'dswarm://p2p-trading-room',
      protocol: 'dswarm',
    });

    expect(parseDSwarmInput('dswarm://')).toBeNull();
  });
});
