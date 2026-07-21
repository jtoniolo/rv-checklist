# 14. Controls — shadcn/ui, vendored into libs/web/ui

Date: 2026-07-21

## Status

Accepted

## Context

ADR-0013 chose Tailwind and left a hook: "Tailwind pairs with headless kits
(Radix/shadcn) when that day comes." That day came with #23 — controls were
40+ ad-hoc `<button>`s and a dozen `<input>`s styled inline per call site, and
upcoming slices want overlays (dialogs, dropdowns) where hand-rolled focus
trapping and keyboard navigation is the expensive part to get right.

shadcn/ui is not an npm dependency: its CLI copies component sources (Radix
primitives + Tailwind classes) into the repo, which we then own outright. But
the CLI resolves its write targets through `tsconfig` path aliases, and this
workspace deliberately uses pnpm workspace packages with `nodenext` resolution
(ADR-0009) — there are no path aliases for it to hook into.

## Decision

- **shadcn/ui components, vendored by hand** into `libs/web/ui/src/lib/ui/`
  and exported from the lib barrel like every other primitive. To add one:
  fetch `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json`, write
  `.files[0].content` into the directory, and rewrite only the imports
  (`@/lib/utils` → `./utils`, registry paths → sibling files). Keep every
  other line as upstream ships it, so refreshing against the registry stays a
  diffable operation.
- **Runtime deps live at the workspace root** (`radix-ui`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`),
  matching how the lib already resolves `react`; `tw-animate-css` lives in
  `apps/web` beside the Tailwind build it feeds.
- **The semantic-token bridge**: shadcn components speak
  `background` / `primary` / `border` / … . `global.css` declares each of
  those custom properties as a function of the seven camping tokens
  (ADR-0013, #22), with dark mode flipped by the same
  `prefers-color-scheme` query the app already uses — no `.dark` class. The
  Tailwind side is an `@theme inline` block, so `bg-primary` emits
  `var(--primary)` and re-resolves under per-theme overrides.
- **Two capture rules for the vars**, because custom properties substitute
  `var()` where they are *declared*: the bridge rule is declared on both
  `:root` and `[data-theme-surface]` (the themed div re-captures its inline
  overrides), and `ThemeSurface` mirrors the picked palette onto `:root` in an
  effect so Radix portals — which mount on `document.body`, outside the
  surface div — inherit the theme too.

## Alternatives considered

- **shadcn CLI with tsconfig paths bolted on** — paths would shadow the
  workspace-package resolution `nodenext` was chosen for, to save a one-file
  copy step. Rejected as the tail wagging the dog.
- **Radix primitives, styles hand-written** — same accessibility, but
  re-derives the styling layer shadcn already ships; we would converge on a
  worse copy of it.
- **Full component frameworks (MUI / Mantine / Chakra)** — re-rejected per
  ADR-0013: their theming systems fight the camping-token model.

## Consequences

- New controls come from the registry, not from scratch; existing screens
  migrate opportunistically (rig form converted as proof in #23).
- Vendored files follow upstream idiom, not house style (double-quoted by
  Prettier afterwards, no explicit return types); lint runs clean on them and
  we accept the style seam in exchange for cheap upstream refreshes.
- Buttons gain a fixed height scale (`h-9` et al.) and shadcn's focus-ring
  treatment; small visual drift from the old ad-hoc paddings is expected as
  screens migrate.
- The five themes and dark mode drive every vendored control through the
  token bridge for free; a new theme still only defines the seven camping
  tokens.
