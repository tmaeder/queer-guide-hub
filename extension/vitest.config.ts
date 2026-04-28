import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  // Don't inherit the hub root's tailwind PostCSS config — extension tests
  // don't process CSS, and Vite walks up from cwd looking for postcss.config.
  css: { postcss: { plugins: [] } },
});
