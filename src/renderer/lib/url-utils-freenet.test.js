import {
  isValidFreenetKey,
  parseFreenetInput,
} from './url-utils.js';

describe('url-utils Freenet and locallitcoins integration', () => {
  const testContractKey = '4J9WCUj47tY9aU5N1M7V3D8P4z8m2Q6k1X7y9Z2W4v8R';

  test('validates Freenet contract keys and aliases', () => {
    expect(isValidFreenetKey(testContractKey)).toBe(true);
    expect(isValidFreenetKey('locallitcoins')).toBe(true);
    expect(isValidFreenetKey('river')).toBe(true);
    expect(isValidFreenetKey('web-container')).toBe(true);
    expect(isValidFreenetKey('ab')).toBe(false); // too short
    expect(isValidFreenetKey('')).toBe(false);
    expect(isValidFreenetKey(null)).toBe(false);
  });

  test('parses freenet://locallitcoins alias directly to local exchange', () => {
    const parsed = parseFreenetInput('freenet://locallitcoins');
    expect(parsed).toEqual({
      targetUrl: 'http://127.0.0.1:3000/',
      displayValue: 'freenet://locallitcoins',
      protocol: 'freenet',
    });
  });

  test('parses arbitrary freenet contract URLs through gateway', () => {
    const parsed = parseFreenetInput(`freenet://${testContractKey}/index.html`);
    expect(parsed).toEqual({
      targetUrl: `http://127.0.0.1:50509/contract/web/${testContractKey}/index.html`,
      displayValue: `freenet://${testContractKey}/index.html`,
      protocol: 'freenet',
    });
  });

  test('returns null on invalid freenet input', () => {
    expect(parseFreenetInput('freenet://')).toBeNull();
    expect(parseFreenetInput('freenet://!invalid-key')).toBeNull();
    expect(parseFreenetInput('https://freenet.org')).toBeNull();
  });
});
