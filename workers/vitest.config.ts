import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Mock Wasm modules for testing — forces TS fallback implementations
      '../../wasm/pkg/csv_parser/csv_parser': new URL(
        'src/lib/__tests__/__mocks__/wasm-noop.ts',
        import.meta.url,
      ).pathname,
      '../../wasm/pkg/geo_wasm/geo_wasm': new URL(
        'src/lib/__tests__/__mocks__/wasm-noop.ts',
        import.meta.url,
      ).pathname,
      '../../wasm/pkg/text_utils_wasm/text_utils_wasm': new URL(
        'src/lib/__tests__/__mocks__/wasm-noop.ts',
        import.meta.url,
      ).pathname,
    },
  },
});
