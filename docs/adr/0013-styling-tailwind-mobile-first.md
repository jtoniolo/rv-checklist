# 13. Styling with Tailwind CSS v4, mobile-first by construction

Date: 2026-07-20

## Status

Accepted.

## Context

ADR-0010 requires a mobile-first PWA. The scope of issue #11 described a
"mobile-first empty shell".

But "mobile-first" was prose only. It was never an acceptance criterion. The
shell that we released was a centered column with a fixed `max-width: 40rem` and
**no breakpoints**. It was the same at each viewport size, and it made a column of
the width of a telephone on a desktop screen.

That result is the *size* of a telephone. It is not mobile-*first*. Mobile-first
means that you write the styles for the small screen first, and then you improve
the layout for the larger screens.

The fault passed the "done" check because no test examined it.

We do not want to write responsive CSS for each screen manually, because we will
forget the improvement each time. Instead we want two things. The tools must make
mobile-first the easiest path. And one shared frame must give the behavior to
each screen.

## Decision

- **Tailwind CSS v4** is the styling system for `apps/web`. Its responsive model
  is mobile-first by construction. A utility with no prefix is the baseline for a
  telephone. The `sm:`, `md:`, and `lg:` prefixes are improvements at a
  `min-width` value. Thus you cannot write the desktop layout without a visible
  breakpoint.
- **The design tokens are in one `@theme` block in `global.css`.** These tokens
  are the palette of the brand. We keep the default breakpoints.

  The `prettier-plugin-tailwindcss` plugin **applies** the order of the utility
  classes. An incorrect order fails the Prettier check, and that check already
  stops the lint. Thus this rule adds no new configuration.
- **The shared responsive primitives are in `libs/web/ui`.** That library has the
  `scope:web` tag and the `type:ui` tag. Refer to ADR-0009.

  The `Page` frame is the first primitive. It has a baseline for a telephone. The
  `sm` and `lg` breakpoints then increase the width and the padding. Each screen
  puts its content in a primitive from this library. Thus each screen inherits
  the responsive behavior and does not repeat it.
- Tailwind reads the library through an `@source` directive. Next transpiles the
  library, which holds raw TSX, through `transpilePackages`.

## Alternatives that we compared

- **Our own CSS Modules and tokens.** This alternative adds no dependency. But no
  part of it makes mobile-first the default, so the same fault occurs again. We
  rejected it, because it is the pattern that failed.
- **Type-safe CSS, with Panda or vanilla-extract.** This alternative agrees well
  with our strict TypeScript rules. But its ecosystem is smaller, and we must
  still build each component manually.
- **A component library, such as Mantine or Chakra.** This alternative supplies
  the most functions. But it is a large dependency with strong opinions. It also
  has a risk with the SSR compatibility of React 19 and Next 16. It is too early
  for a personal PWA that has very few components.

  Examine this alternative again if a later feature needs a full set of
  components. Tailwind operates correctly with a headless set, such as Radix or
  shadcn, at that time.

## Consequences

- The build gets a PostCSS step and a Tailwind step, and the JSX gets utility
  classes. This is the cost, and in exchange mobile-first is automatic and
  applied.
- Later work builds the user interface from the primitives in `libs/web/ui` and
  the Tailwind utilities. Each change above the baseline of the telephone uses a
  breakpoint prefix.
- A shared class that only `libs/web/ui` uses needs the `@source` entry.
  Otherwise Tailwind does not emit that class. A new UI library needs the same
  entry.
