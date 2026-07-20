import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    // `void` is RTK Query's idiom for a no-argument endpoint (`query<Result, void>`)
    // and a no-body response (`mutation<void, Arg>`). `no-invalid-void-type` treats
    // call-expression type arguments as a disallowed position — a known false
    // positive against this documented pattern — so it is disabled for the slice.
    files: ['**/api.ts'],
    rules: {
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },
  {
    // Redux selectors carry the `select…` prefix by convention (ADR-0011),
    // which reads better than an `is…`-prefixed boolean-getter name for a
    // predicate selector like `selectIsAuthenticated`.
    files: ['**/*.slice.ts'],
    rules: {
      'unicorn/consistent-boolean-name': 'off',
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
