/**
 * Tailwind CSS v4 is wired as a PostCSS plugin (issue #11 follow-up). Next runs
 * PostCSS over the app's CSS; `@tailwindcss/postcss` compiles the utilities
 * pulled in by `@import "tailwindcss"` in global.css.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
