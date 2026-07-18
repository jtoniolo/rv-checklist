import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * The React layer, shared by every `scope:web` project that renders UI
 * (`apps/web`, `libs/web/ui`).
 *
 * We own this explicitly rather than using Nx's `flat/react` preset because
 * that preset also registers `eslint-plugin-import`, which collides with the
 * workspace-level `import` registration in the root config ("Cannot redefine
 * plugin import"). Assembling the React plugins here keeps `import` owned in
 * exactly one place while still enabling the full React / hooks / a11y rule
 * sets — including the hooks rules the bare `flat/react-typescript` preset
 * leaves out.
 */
export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ...react.configs.flat.recommended,
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ...react.configs.flat['jsx-runtime'],
  },
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Zero-warnings posture: a missing/incorrect dependency array is a real
      // bug, not a hint.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    settings: { react: { version: 'detect' } },
  },
];
