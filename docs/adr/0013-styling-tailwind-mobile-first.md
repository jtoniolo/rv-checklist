# 13. Styling — Tailwind CSS v4, mobile-first by construction

Date: 2026-07-20

## Status

Accepted

## Context

ADR-0010 calls for a mobile-first PWA, and #11's scope described a "mobile-first
empty shell." But "mobile-first" was only prose — never an acceptance criterion —
and the shell shipped as a fixed `max-width: 40rem` centered column with **no
breakpoints**: identical at every viewport, a phone-width column on desktop.
That is mobile-*sized*, not mobile-*first* (which means styling the small screen
first, then progressively enhancing upward). The gap sailed through "done"
because nothing tested it.

Rather than hand-roll responsive CSS per screen — and re-forget the enhancement
each time — we want the tooling to make mobile-first the path of least
resistance, and one shared frame every screen inherits.

## Decision

- **Tailwind CSS v4** is the styling system for `apps/web`. Its responsive model
  is mobile-first by construction: an unprefixed utility is the phone baseline,
  and `sm:` / `md:` / `lg:` prefixes are `min-width` enhancements — you cannot
  write the desktop layout without visibly opting into a breakpoint.
- **Design tokens** (brand palette; default breakpoints kept) live in one
  `@theme` block in `global.css`. Utility class order is **enforced** via
  `prettier-plugin-tailwindcss`, so it fails the (already lint-blocking) Prettier
  check — no new rule surface.
- **Shared responsive primitives live in `libs/web/ui`** (`scope:web`,
  `type:ui`, per ADR-0009). The `Page` frame is the first: phone baseline, then
  `sm`/`lg` widen the measure and padding. Every screen wraps its content in a
  primitive from this lib, so responsiveness is inherited, not re-derived.
- Tailwind scans the lib via an `@source` directive; Next transpiles the
  raw-TSX lib via `transpilePackages`.

## Alternatives considered

- **Roll our own CSS Modules + tokens** — no dependency, but nothing makes
  mobile-first the default; the same omission recurs. Rejected: it is the
  pattern that just failed.
- **Type-safe CSS (Panda / vanilla-extract)** — great fit for the strict-TS
  posture, but smaller ecosystem and still hand-built components.
- **Component library (Mantine / Chakra)** — most batteries, but a heavy,
  opinionated dependency with React 19 / Next 16 SSR-compat risk; premature for
  a personal PWA whose components barely exist yet. Revisit if feature slices
  want a full component kit; Tailwind pairs with headless kits (Radix/shadcn)
  when that day comes.

## Consequences

- A PostCSS/Tailwind build step and utility classes in JSX; the trade for
  mobile-first being automatic and enforced.
- Later slices build UI by composing `libs/web/ui` primitives and Tailwind
  utilities, using breakpoint prefixes for anything beyond the phone baseline.
- Shared classes used only inside `libs/web/ui` require the `@source` entry so
  Tailwind emits them; new UI libs need the same.
