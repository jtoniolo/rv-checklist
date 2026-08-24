import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  // The service worker is compiled from `sw/index.ts` after the Next build,
  // because its precache manifest describes that build's output (ADR-0028).
  // This is the deploy's only route to it: `opennextjs-cloudflare build` never
  // goes through Nx, so it cannot inherit the `build-sw` target.
  buildCommand: "npx next build && node sw/build.mjs",
};
