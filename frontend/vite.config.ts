import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {outDir:"build"},
  server: {proxy:{"/api":process.env.API_PROXY_TARGET || "http://127.0.0.1:8080"}},
  preview: {proxy:{"/api":process.env.API_PROXY_TARGET || "http://127.0.0.1:8080"}},
  envPrefix: ["VITE_", "REACT_APP_"],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    css: false,
  },
});
