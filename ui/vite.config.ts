import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In production Frank serves this build at / and the console calls /mcp
// relatively (ADR-006). In dev, proxy /mcp to a local Frank on :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/mcp": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
    },
  },
  test: {
    environment: "node",
  },
});
