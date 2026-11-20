import fs from 'fs';
import path from 'path';
import {
  validatePackIndex,
  validatePackObject,
} from '../shared/pack-rules.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const PACKS_DIR = path.join(ROOT_DIR, 'packs');
const INDEX_PATH = path.join(PACKS_DIR, 'index.json');
const CONFIG_PATH = path.join(ROOT_DIR, 'packs.config.json');

function getMaxTotalBytes() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (typeof cfg.maxTotalBytes === 'number' && cfg.maxTotalBytes > 0) {
      return cfg.maxTotalBytes;
    }
  } catch {
    // Use default 5 MB
  }
  return 5_000_000;
}

function main() {
  const errors = [];

  if (!fs.existsSync(INDEX_PATH)) {
    console.error('ERROR: Missing packs/index.json');
    process.exit(1);
  }

  let rawIndex;
  try {
    rawIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (err) {
    console.error(
      `ERROR: Invalid JSON in packs/index.json (${err instanceof Error ? err.message : 'parse error'})`,
    );
    process.exit(1);
  }

  const indexResult = validatePackIndex(rawIndex);
  if (!indexResult.ok) {
    console.error(`ERROR: packs/index.json failed validation: ${indexResult.reason}`);
    process.exit(1);
  }

  const entries = indexResult.index.packs;
  if (entries.length === 0) {
    errors.push('packs/index.json contains 0 packs.');
  }

  const referencedFiles = new Set(['index.json', 'last-run.json']);
  let totalItems = 0;

  for (const entry of entries) {
    referencedFiles.add(entry.file);
    const packPath = path.join(PACKS_DIR, entry.file);

    if (!fs.existsSync(packPath)) {
      errors.push(`Missing pack file referenced by index: packs/${entry.file}`);
      continue;
    }

    let rawPack;
    try {
      rawPack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
    } catch (err) {
      errors.push(
        `Invalid JSON in packs/${entry.file}: ${err instanceof Error ? err.message : 'parse error'}`,
      );
      continue;
    }

    const packResult = validatePackObject(rawPack);
    if (!packResult.ok) {
      errors.push(`Pack validation failed for packs/${entry.file}: ${packResult.reason}`);
      continue;
    }

    const p = packResult.pack;
    if (
      p.id !== entry.id ||
      p.kind !== entry.kind ||
      p.theme !== entry.theme ||
      p.level !== entry.level ||
      p.spelling !== entry.spelling
    ) {
      errors.push(`Metadata mismatch between index entry and packs/${entry.file}`);
    }

    if (p.items.length !== entry.count) {
      errors.push(
        `Count mismatch for packs/${entry.file}: index=${entry.count}, actual=${p.items.length}`,
      );
    }

    totalItems += p.items.length;
  }

  // Check folder size budget and orphan pack JSON files
  let totalBytes = 0;
  for (const name of fs.readdirSync(PACKS_DIR)) {
    const full = path.join(PACKS_DIR, name);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      totalBytes += stat.size;
      if (name.endsWith('.json') && !referencedFiles.has(name)) {
        errors.push(`Orphaned pack file not listed in index.json: packs/${name}`);
      }
    }
  }

  const maxBytes = getMaxTotalBytes();
  if (totalBytes > maxBytes) {
    errors.push(
      `packs/ folder exceeds size budget (${totalBytes} bytes > ${maxBytes} bytes).`,
    );
  }

  if (errors.length > 0) {
    console.error('Pack validation FAILED:');
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  console.log(
    `Pack validation passed: ${entries.length} packs, ${totalItems} total items, ${(totalBytes / 1024).toFixed(1)} KB total.`,
  );
}

main();
