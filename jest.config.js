module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.build/', '/handlers/', '/lib/', '/shared/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'handlers/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testTimeout: 30000, // 30 seconds for API calls
  modulePathIgnorePatterns: ['<rootDir>/.build/'],
  verbose: true,
  // Show console output even for passing tests
  silent: false,
  // Suppress open handles warnings (TLSWRAP from fetch API is expected and harmless)
  detectOpenHandles: false,
};

