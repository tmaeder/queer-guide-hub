import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * `toucan-js` is a runtime-only dependency of src/index.ts (Sentry, constructed
 * only when SENTRY_DSN is set — never in tests). Importing the handler requires
 * the specifier to RESOLVE, so when the package is not installed we point it at
 * a local no-op stub. The alias is conditional: with a normal `npm ci` the real
 * package resolves and this does nothing, so tests never run against the stub
 * in CI.
 */
const toucanAlias: Record<string, string> = {};
try {
	require.resolve("toucan-js");
} catch {
	toucanAlias["toucan-js"] = path.resolve(__dirname, "tests/__stubs__/toucan-js.ts");
}

export default defineConfig({
	resolve: { alias: toucanAlias },
	test: {
		root: __dirname,
		include: ["tests/**/*.{test,spec}.ts"],
		exclude: ["tests/__stubs__/**"],
	},
});
