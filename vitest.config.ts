import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  test: {
    environment: 'node',

    globals: true,

    /*
     * Vitest owns the resolver/unit-test suite.
     *
     * Playwright owns tests/e2e/** and those files must never be collected
     * by Vitest.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
    ],
  },
});