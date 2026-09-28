import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const engine = process.env.QRL_ENGINE ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": engine,
      "/ws": { target: engine.replace(/^http/, "ws"), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
