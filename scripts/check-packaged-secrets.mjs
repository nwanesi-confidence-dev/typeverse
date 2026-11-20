import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(import.meta.dirname, '..');

const FORBIDDEN_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'server.ts',
]);

const TEXT_SCAN_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.html',
  '.css',
  '.json',
  '.yml',
  '.yaml',
  '.txt',
]);

const errors = [];

function checkTextContent(label, text) {
  if (text.includes('GEMINI_API_KEY')) {
    errors.push(`Forbidden reference to "GEMINI_API_KEY" found in ${label}`);
  }

  const aizaMatches = text.match(/AIza[0-9A-Za-z_-]{8,}|AIza/g);
  if (aizaMatches && aizaMatches.length > 0) {
    errors.push(`Forbidden "AIza" key pattern found in ${label} (${aizaMatches[0]})`);
  }
}

function scanAsarFile(asarPath) {
  const buf = fs.readFileSync(asarPath);
  const text = buf.toString('latin1');
  checkTextContent(path.relative(rootDir, asarPath), text);
}

function walkDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      walkDirectory(fullPath);
      continue;
    }

    if (FORBIDDEN_FILENAMES.has(entry.name) || entry.name.startsWith('.env.')) {
      errors.push(`Forbidden file packaged: ${relPath}`);
      continue;
    }

    if (entry.name.endsWith('.map')) {
      errors.push(`Source map should not be in packaged output: ${relPath}`);
      continue;
    }

    if (entry.name === 'app.asar') {
      scanAsarFile(fullPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_SCAN_EXTENSIONS.has(ext)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      checkTextContent(relPath, content);
    }
  }
}

walkDirectory(path.join(rootDir, 'dist'));
walkDirectory(path.join(rootDir, 'electron', 'dist'));

const releaseDir = path.join(rootDir, 'release');
if (fs.existsSync(releaseDir)) {
  walkDirectory(releaseDir);
}

if (errors.length > 0) {
  console.error('SECRET SCAN FAILED! Found prohibited secrets or files in build output:');
  for (const err of errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log('Secret & hygiene scan passed: zero GEMINI_API_KEY, AIza tokens, .env files, or source maps found.');
