const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@rv-checklist/api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // @powersync/service-sync-rules and its dependencies (@powersync/*, uuid)
  // — used by the sync-rules validation spec — ship ESM-only, so they must go
  // through the swc transform instead of being ignored. The lookahead has to
  // hold for every node_modules segment on a pnpm path (.pnpm/@powersync+x@v
  // and the symlink), hence the leading .*.
  transformIgnorePatterns: ['node_modules/(?!.*(@powersync[+/]|uuid))'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
