import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'application-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\/(components|app)\/.*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}'],
  },
});
