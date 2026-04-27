import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  // Don't inherit the hub root's tailwind PostCSS config — submit worker has
  // no CSS, and Vite walks up from cwd looking for postcss.config.
  css: { postcss: { plugins: [] } },
});
