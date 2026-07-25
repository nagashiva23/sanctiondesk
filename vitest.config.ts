import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/widgets/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
