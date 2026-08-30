# 14. The controls come from shadcn/ui, copied into libs/web/ui

Date: 2026-07-21

## Status

Accepted.

## Context

ADR-0013 selected Tailwind and left an option: "Tailwind operates correctly with
a headless set, such as Radix or shadcn, at that time."

Issue #23 is that time. The application had more than 40 `<button>` elements and
approximately 12 `<input>` elements. Each call site styled them separately.

The next work needs overlays, such as dialogs and dropdown lists. In an overlay,
the focus trap and the keyboard navigation are the expensive parts to make
correctly.

shadcn/ui is not an npm dependency. Its CLI copies the source of a component into
the repository. That source is Radix primitives and Tailwind classes. We then own
the code fully.

But the CLI finds its target directories through the path aliases in `tsconfig`.
This workspace intentionally uses pnpm workspace packages with `nodenext`
resolution. Refer to ADR-0009. Thus there is no path alias for the CLI to use.

## Decision

- **Copy the shadcn/ui components manually** into `libs/web/ui/src/lib/ui/`.
  Export them from the barrel file of the library, the same as each other
  primitive.

  To add a component:

  1. Get `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json`.
  2. Write the `.files[0].content` value into the directory.
  3. Change the imports only. Change `@/lib/utils` to `./utils`. Change each
     registry path to the adjacent file.

  Keep each other line as the upstream project supplies it. A comparison against
  the registry then stays a simple operation.
- **The runtime dependencies are at the root of the workspace.** These are
  `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, and
  `lucide-react`. This agrees with the method that the library already uses for
  `react`. The `tw-animate-css` dependency is in `apps/web`, with the Tailwind
  build that uses it.
- **The bridge to the semantic tokens.** The shadcn components use the names
  `background`, `primary`, `border`, and other similar names.

  `global.css` declares each of those custom properties as a function of the
  seven camping tokens. Refer to ADR-0013 and issue #22. The dark mode changes
  with the same `prefers-color-scheme` query that the application already uses.
  There is no `.dark` class.

  On the Tailwind side, the declaration is an `@theme inline` block. Thus
  `bg-primary` emits `var(--primary)`, and that value resolves again below an
  override for a theme.
- **The variables need two rules that capture them.** A custom property
  substitutes a `var()` value at the location where a rule *declares* it.

  Thus the bridge rule is declared on `:root` and also on `[data-theme-surface]`.
  The themed div then captures its inline overrides again.

  Also, `ThemeSurface` copies the selected palette onto `:root` in an effect. The
  Radix portals mount on `document.body`, which is outside the surface div, and
  they then inherit the theme.

## Alternatives that we compared

- **The shadcn CLI, with the addition of paths in `tsconfig`.** The paths would
  hide the workspace-package resolution. We selected `nodenext` for that
  resolution. This alternative would save the copy of one file only. We rejected
  it, because the small benefit does not justify the change to the resolution.
- **Radix primitives, with styles that we write.** This alternative gives the same
  accessibility. But it makes again the styling layer that shadcn already
  supplies. Our result would be a worse copy of that layer.
- **A full component framework, such as MUI, Mantine, or Chakra.** We rejected
  these alternatives again, for the reason in ADR-0013. Their theme systems do
  not agree with the model of the camping tokens.

## Consequences

- A new control comes from the registry. Do not write a new control. Move an
  existing screen to the registry components when there is an opportunity. Issue
  #23 converted the rig form as a proof.
- The copied files use the idiom of the upstream project, not the style of this
  repository. Prettier then makes the quotation marks double, and the files have
  no explicit return types. The lint passes on these files. We accept this
  difference in style, because it makes an update from the upstream project
  inexpensive.
- The buttons get a fixed scale of heights, such as `h-9`, and the focus ring of
  shadcn. Expect a small change in appearance from the old separate padding
  values as each screen moves.
- The five themes and the dark mode drive each copied control through the bridge
  of tokens, at no cost. A new theme still defines the seven camping tokens only.
