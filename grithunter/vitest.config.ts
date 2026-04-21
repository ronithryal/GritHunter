import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * GritHunter v1 Testing Configuration
 * 
 * DESIGN CHOICE: Vitest is being used as the test runner instead of Jest.
 * Rationale: Significantly faster feedback loop, native TypeScript support 
 * without complex transpilation layers, and excellent compatibility with 
 * MSW (Mock Service Worker) for our integration tests.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
