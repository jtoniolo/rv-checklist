import baseConfig from '../../../eslint.config.mjs';
import reactConfig from '../../../eslint.react.mjs';

export default [
  ...baseConfig,
  ...reactConfig,
  {
    ignores: ['**/out-tsc'],
  },
];
