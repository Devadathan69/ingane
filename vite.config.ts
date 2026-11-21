import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';

const root = normalizePath(fileURLToPath(new URL('.', import.meta.url))).replace(/\/$/, '');

export default defineConfig(({ isSsrBuild }) => ({
  base: './',
  build: { copyPublicDir: !isSsrBuild },
  plugins: [react()],
  server: {
    fs: {
      allow: [root],
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml',
        '**/.git/**', root + '/tmp/**', '**/.ingane-private/**', '**/ingane-family.sqlite*'],
    },
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
}));
