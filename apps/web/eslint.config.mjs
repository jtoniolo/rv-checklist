import nextEslintPluginNext from '@next/eslint-plugin-next';
import baseConfig from '../../eslint.config.mjs';
import reactConfig from '../../eslint.react.mjs';

/**
 * Web app — layers the shared React rule set and the Next.js rule set on top
 * of the workspace baseline.
 */
export default [
  ...baseConfig,
  ...reactConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: { '@next/next': nextEslintPluginNext },
    rules: {
      ...nextEslintPluginNext.configs.recommended.rules,
      ...nextEslintPluginNext.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: [
      '.next/**/*',
      '.open-next/**/*',
      '.wrangler/**/*',
      // The SDK's prebuilt worker and wasm, copied in by the
      // copy-powersync-assets target (ADR-0029) — not ours to lint.
      'public/@powersync/**/*',
      '**/out-tsc',
      'open-next.config.ts',
    ],
  },
];
