import { defineConfig } from 'vitest/config';

// Server-only modules use Deno and must not enter the browser TypeScript graph.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/merchant-sync/*.test.ts'],
  },
});
