import { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ isSsrBuild }) => ({
  base: './',
  build: { copyPublicDir: !isSsrBuild },
  plugins: [react()],
  server: {
    fs: { deny: [normalizePath(resolve('tmp')) + '/**', '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.ingane-private/**', '**/ingane-family.sqlite*'] },
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
}));
