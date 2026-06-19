import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built bundle also works from file:// and the
  // virtual hosts used by Lively Wallpaper / Wallpaper Engine.
  base: "./",
  build: {
    // the single-page game ships as one chunk by design; raise the limit so the
    // build is warning-free for size. (A few informational node-externalization
    // notices remain from the OPTIONAL in-browser Anthropic SDK dialogue backend.)
    chunkSizeWarningLimit: 2000
  },
  test: {
    globals: true,
    environment: "jsdom"
  }
});
