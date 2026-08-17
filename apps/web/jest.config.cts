// Plain babel-jest, same recipe as web-ui. `next/jest` is deliberately not
// used: it compiles suites through Next's native SWC binding inside Jest
// workers, which deadlocks under Jest 30 (workers sit idle forever, so the
// task never finishes — locally and in CI). The specs mock next/link and
// next/navigation themselves, so nothing here needs the Next transform.
const config = {
  displayName: '@rv-checklist/web',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/src/test-setup.ts'],
};

module.exports = config;
