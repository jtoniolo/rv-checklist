import { THEME_KEYS, type ThemeKey } from '@rv-checklist/web-data-access';

/**
 * The camping colour palettes (issue #22, from the UI prototype bake-off —
 * nostalgic "Ontario Parks, 1978"). A theme is purely a set of overrides for
 * the seven `global.css` tokens, applied as inline custom properties on the
 * app's theme surface — every `bg-brand` / `text-brand-muted` /
 * `border-hairline` inside re-resolves, dark mode included (surface-dark /
 * ink-inverted are themed too). The *preference* (which key is picked) is
 * client-local state in the data-access lib; only the colours live here.
 *
 * Grounding: parksign is the routed chocolate-brown MNR entrance sign on
 * canvas cream; campfire is 70s burnt-orange Coleman gear on harvest gold;
 * algonquin (the default) puts spruce-green actions on the park sign's canvas
 * and brown — a routed sign standing in a pine forest.
 */
export interface Theme {
  readonly name: string;
  /** Dot in the picker — any CSS background (colour or gradient). */
  readonly swatch: string;
  /** CSS custom-property overrides; empty = the `global.css` defaults. */
  readonly vars: Readonly<Record<string, string>>;
}

/**
 * Keyed by {@link ThemeKey}, so adding a key to the preference slice without a
 * palette here (or vice versa) fails to compile.
 */
const THEME_BY_KEY: Readonly<Record<ThemeKey, Theme>> = {
  // The base `global.css` tokens, untouched.
  navy: { name: 'Navy', swatch: '#1f3a5f', vars: {} },
  parksign: {
    name: 'Park sign',
    swatch: '#5d4324',
    vars: {
      '--color-brand': '#5d4324',
      '--color-brand-muted': '#7c6a4e',
      '--color-ink': '#2b2013',
      '--color-ink-inverted': '#f0e6cf',
      '--color-surface': '#f4ebd9',
      '--color-surface-dark': '#1b140c',
      '--color-hairline': '#d7c8ab',
    },
  },
  campfire: {
    name: 'Campfire',
    swatch: '#b0491c',
    vars: {
      '--color-brand': '#b0491c',
      '--color-brand-muted': '#8c6f52',
      '--color-ink': '#34251a',
      '--color-ink-inverted': '#f4e7d3',
      '--color-surface': '#f9efd8',
      '--color-surface-dark': '#20130b',
      '--color-hairline': '#e3cda9',
    },
  },
  forest: {
    name: 'Forest',
    swatch: '#2e5944',
    vars: {
      '--color-brand': '#2e5944',
      '--color-brand-muted': '#687866',
      '--color-ink': '#1d241d',
      '--color-ink-inverted': '#e6ecdd',
      '--color-surface': '#f1f0e2',
      '--color-surface-dark': '#121812',
      '--color-hairline': '#c9ccb4',
    },
  },
  algonquin: {
    name: 'Algonquin',
    swatch: 'linear-gradient(135deg, #2e5944 50%, #5d4324 50%)',
    vars: {
      '--color-brand': '#2e5944',
      '--color-brand-muted': '#7c6a4e',
      '--color-ink': '#2b2013',
      '--color-ink-inverted': '#ece7d0',
      '--color-surface': '#f4ebd9',
      '--color-surface-dark': '#171a10',
      '--color-hairline': '#d5c9ab',
    },
  },
};

/** The pickable themes, in picker order, each carrying its key. */
export const THEMES: readonly (Theme & { readonly key: ThemeKey })[] =
  THEME_KEYS.map((key) => ({ key, ...THEME_BY_KEY[key] }));

/** The palette for a picked key. */
export function themeFor(key: ThemeKey): Theme {
  return THEME_BY_KEY[key];
}
