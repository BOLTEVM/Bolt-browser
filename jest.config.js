/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/bee-bin/', '/ipfs-bin/'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/renderer/vendor/**'],
  coverageThreshold: {
    global: {
      statements: 18,
      branches: 16,
      functions: 14,
      lines: 19,
    },
  },
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['/node_modules/'],
};
