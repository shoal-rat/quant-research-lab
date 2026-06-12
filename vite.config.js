import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    // Relative base so the built bundle also works from file:// and the
    // virtual hosts used by Lively Wallpaper / Wallpaper Engine.
    base: "./",
    test: {
        globals: true,
        environment: "jsdom"
    }
});
