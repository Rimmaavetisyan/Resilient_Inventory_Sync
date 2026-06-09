import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // The acceptance criteria: at least 80% coverage. The run fails if we dip below.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ['src/**/*.js'],
      // index.js is pure wiring / process bootstrap (env, signal handlers) — excluded.
      exclude: ['src/index.js'],
    },
  },
});
