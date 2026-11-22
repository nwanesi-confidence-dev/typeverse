import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function normaliseWebBase(raw?: string): string {
  const trimmed = (raw || '/').trim();
  if (!trimmed || trimmed === '/') return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export default defineConfig(({command}) => {
  const isElectron = process.env.ELECTRON === '1';
  const webBase = normaliseWebBase(process.env.VITE_BASE);

  return {
    base: isElectron && command === 'build' ? './' : webBase,
    build: {
      sourcemap: false,
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'typeverse-static-packs',
        configureServer(server) {
          const packsDir = path.resolve(import.meta.dirname, 'packs');
          server.middlewares.use(`${webBase}manifest.webmanifest`, (_req, res) => {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.end(
              JSON.stringify({
                id: webBase,
                name: 'TypeVerse — Touch-Typing Mastery',
                short_name: 'TypeVerse',
                description:
                  'Offline-first touch-typing tutor and arcade mastery game with live WPM telemetry, structured lessons, and adaptive drills.',
                theme_color: '#080B14',
                background_color: '#080B14',
                display: 'standalone',
                start_url: webBase,
                scope: webBase,
                icons: [
                  {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                  },
                ],
              }),
            );
          });
          server.middlewares.use(`${webBase}packs`, (req, res, next) => {
            if (!req.url) return next();
            const rel = req.url.split('?')[0].replace(/^\/+/, '');
            if (!rel || rel.includes('..')) return next();
            const filePath = path.join(packsDir, rel);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
            next();
          });
        },
        writeBundle() {
          const baseDir = import.meta.dirname;
          const srcPacks = path.resolve(baseDir, 'packs');
          const distPacks = path.resolve(baseDir, 'dist', 'packs');
          if (fs.existsSync(srcPacks)) {
            fs.mkdirSync(distPacks, {recursive: true});
            for (const entry of fs.readdirSync(srcPacks)) {
              if (!entry.endsWith('.json') || entry === 'last-run.json') continue;
              fs.copyFileSync(path.join(srcPacks, entry), path.join(distPacks, entry));
            }
          }
        },
      },
      !isElectron &&
        VitePWA({
          registerType: 'prompt',
          injectRegister: false,
          base: webBase,
          scope: webBase,
          includeAssets: [
            'icon.svg',
            'apple-touch-icon.png',
            'pwa-192x192.png',
            'pwa-512x512.png',
            'pwa-maskable-512x512.png',
          ],
          manifest: {
            id: webBase,
            name: 'TypeVerse — Touch-Typing Mastery',
            short_name: 'TypeVerse',
            description:
              'Offline-first touch-typing tutor and arcade mastery game with live WPM telemetry, structured lessons, and adaptive drills.',
            theme_color: '#080B14',
            background_color: '#080B14',
            display: 'standalone',
            start_url: webBase,
            scope: webBase,
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'pwa-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}', 'packs/*.json'],
            cleanupOutdatedCaches: true,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          },
          devOptions: {
            enabled: false,
          },
        }),
      {
        name: 'html-manifest-and-assets',
        apply: 'build' as const,
        transformIndexHtml(html: string): string {
          if (isElectron) {
            return html
              .replace(/\s*<link\s+rel="manifest"[^>]*>\s*/gi, '\n')
              .replace(/href="\/(apple-touch-icon\.png|icon\.svg)"/gi, 'href="./$1"');
          }
          // VitePWA injects the base-aware <link rel="manifest"> on web builds; remove static ./ duplicate
          return html.replace(/\s*<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest"\s*\/?>\s*/gi, '\n');
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const baseDir = import.meta.dirname;
          const distDir = path.resolve(baseDir, 'dist');
          const srcAssets = path.resolve(baseDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        ...(isElectron
          ? {
              'virtual:pwa-register': path.resolve(
                import.meta.dirname,
                'src/pwa/pwa-register.stub.ts',
              ),
            }
          : {}),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
