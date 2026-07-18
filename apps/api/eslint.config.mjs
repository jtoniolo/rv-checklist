import nestjs from '@darraghor/eslint-plugin-nestjs-typed';
import tseslint from 'typescript-eslint';
import baseConfig from '../../eslint.config.mjs';

/**
 * API app — adds the NestJS-typed rule set (type-aware) on top of the
 * workspace baseline. Scoped to `src` so the type-aware rules never touch the
 * config files (eslint/jest/webpack) that live outside the TS program.
 *
 * `flatNoSwagger` is the recommended set minus the OpenAPI/Swagger-decorator
 * rules — we keep every DI/validation check but don't yet require Swagger docs
 * (no OpenAPI decision has been made for the MVP).
 */
export default tseslint.config(...baseConfig, {
  files: ['src/**/*.ts'],
  extends: [nestjs.configs.flatNoSwagger],
  rules: {
    // NestJS modules are decorated, otherwise-empty classes by design.
    '@typescript-eslint/no-extraneous-class': 'off',
    // The API bundles to CommonJS (no `"type": "module"`), so top-level await
    // isn't available; the conventional `void bootstrap()` entry point stays.
    'unicorn/prefer-top-level-await': 'off',
  },
});
