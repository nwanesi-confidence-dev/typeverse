import path from 'path';
import {build} from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const rawPacksUrl = (process.env.VITE_PACKS_URL || '').trim();
const normalisedPacksUrl = rawPacksUrl
  ? rawPacksUrl.endsWith('/')
    ? rawPacksUrl
    : `${rawPacksUrl}/`
  : '';

async function run() {
  await Promise.all([
    build({
      entryPoints: [path.join(rootDir, 'electron', 'main.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      sourcemap: false,
      external: ['electron', 'electron-updater'],
      outfile: path.join(rootDir, 'electron', 'dist', 'main.cjs'),
      define: {
        __BUILD_PACKS_URL__: JSON.stringify(normalisedPacksUrl),
      },
    }),
    build({
      entryPoints: [path.join(rootDir, 'electron', 'preload.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      sourcemap: false,
      external: ['electron'],
      outfile: path.join(rootDir, 'electron', 'dist', 'preload.cjs'),
    }),
  ]);

  console.log(
    `Built Electron main & preload bundles (VITE_PACKS_URL=${normalisedPacksUrl || '<unset>'}).`,
  );
}

run().catch((err) => {
  console.error('Failed to build Electron bundles:', err);
  process.exit(1);
});
