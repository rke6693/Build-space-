import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server/index.ts', 'src/**/types.ts', 'src/db/schema.ts'],
    },
  },
  resolve: {
    alias: {
      '@keel': new URL('./src', import.meta.url).pathname,
    },
  },
});
