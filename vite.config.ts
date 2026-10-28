import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gitProxyPlugin } from './scripts/git-proxy';
import { APP_NAME, APP_ID, STARTUP_THEME_KEY } from './src/app-identity';

const renderIdentity = (template: string) =>
  template
    .replaceAll('__APP_NAME__', APP_NAME)
    .replaceAll('__APP_ID__', APP_ID)
    .replaceAll('__APP_STARTUP_THEME_KEY__', STARTUP_THEME_KEY);
const appManifest = () =>
  renderIdentity(
    readFileSync(new URL('./pwa-assets/manifest.webmanifest', import.meta.url), 'utf8'),
  );

export default defineConfig({
  publicDir: 'pwa-assets',
  base: '/laplace/',
  plugins: [
    preact(),
    gitProxyPlugin(),
    {
      name: `${APP_ID}-startup-skeleton`,
      configureServer(server) {
        server.middlewares.use(
          `${server.config.base}manifest.webmanifest`,
          (_request, response) => {
            response.setHeader('Content-Type', 'application/manifest+json');
            response.end(appManifest());
          },
        );
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const startupFile = (name: string) =>
            readFileSync(
              new URL(`./src/app/components/StartupSkeleton.${name}`, import.meta.url),
              'utf8',
            );
          return renderIdentity(html)
            .replace('<!-- startup-styles -->', `<style>${startupFile('css')}</style>`)
            .replace('<!-- startup-skeleton -->', startupFile('html'));
        },
      },
    },
    {
      name: `${APP_ID}-versioned-service-worker`,
      apply: 'build',
      closeBundle() {
        const output = fileURLToPath(new URL('./public/', import.meta.url));
        const manifest = readFileSync(`${output}.vite/manifest.json`, 'utf8');
        const template = renderIdentity(
          readFileSync(new URL('./pwa-assets/sw.js', import.meta.url), 'utf8'),
        );
        const version = createHash('sha256')
          .update(manifest)
          .update(readFileSync(`${output}index.html`, 'utf8'))
          .update(template)
          .digest('hex')
          .slice(0, 16);
        writeFileSync(`${output}manifest.webmanifest`, appManifest());
        writeFileSync(`${output}sw.js`, template.replace('__BUILD_ID__', version));
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  css: { modules: { generateScopedName: 'nv_[hash:base64:6]' } },
  build: {
    outDir: 'public',
    manifest: true,
  },
});
