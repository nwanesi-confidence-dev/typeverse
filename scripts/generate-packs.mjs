import fs from 'fs';
import path from 'path';
import {
  MIN_ITEMS_BY_KIND,
  PACK_KINDS,
  PACK_SPELLINGS,
  PACK_THEMES,
  validatePackIndex,
  validatePackObject,
} from '../shared/pack-rules.mjs';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'packs.config.json');
const PACKS_DIR = path.join(ROOT_DIR, 'packs');
const INDEX_PATH = path.join(PACKS_DIR, 'index.json');
const LAST_RUN_PATH = path.join(PACKS_DIR, 'last-run.json');

function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    geminiModel: String(raw.geminiModel || DEFAULT_GEMINI_MODEL).trim(),
    themes: Array.isArray(raw.themes) ? raw.themes : PACK_THEMES,
    kinds: Array.isArray(raw.kinds) ? raw.kinds : PACK_KINDS,
    levels: Array.isArray(raw.levels) ? raw.levels.map(Number) : [1, 2, 3, 4, 5],
    spellings: Array.isArray(raw.spellings) ? raw.spellings : PACK_SPELLINGS,
    itemsPerPack: raw.itemsPerPack || {
      words: 40,
      sentences: 12,
      paragraphs: 4,
      numbers: 15,
      code: 12,
    },
    maxCallsPerRun: Math.max(1, Number(raw.maxCallsPerRun) || 12),
    delayBetweenCallsMs: Math.max(0, Number(raw.delayBetweenCallsMs) ?? 15000),
    retentionDays: Math.max(1, Number(raw.retentionDays) || 14),
    maxTotalBytes: Math.max(500_000, Number(raw.maxTotalBytes) || 5_000_000),
  };
}

function getDayOfYearUtc(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000);
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function slugifyTheme(theme) {
  return theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickKindForLevel(level, slotIndex, enabledKinds) {
  const available = new Set(enabledKinds);
  if (level <= 3) {
    return available.has('words') ? 'words' : enabledKinds[0];
  }
  if (level === 4) {
    const l4Options = ['sentences', 'paragraphs', 'words'].filter((k) => available.has(k));
    return l4Options[slotIndex % l4Options.length] || 'sentences';
  }
  const l5Options = ['numbers', 'code', 'sentences', 'paragraphs'].filter((k) =>
    available.has(k),
  );
  return l5Options[slotIndex % l5Options.length] || 'words';
}

/**
 * Builds an ordered rotation schedule covering all (theme x level) pairs across
 * <= 7 days, alternating spellings and content kinds, plus a daily challenge slot.
 */
function buildDailyJobs(config, now) {
  const dayOfYear = getDayOfYearUtc(now);
  const todayStr = formatDateUtc(now);
  const themes = config.themes;
  const levels = config.levels;
  const spellings = config.spellings;

  const fullCycle = [];
  for (let li = 0; li < levels.length; li++) {
    for (let ti = 0; ti < themes.length; ti++) {
      const idx = li * themes.length + ti;
      const level = levels[li];
      const theme = themes[(ti + li) % themes.length];
      const kind = pickKindForLevel(level, idx + dayOfYear, config.kinds);
      const spelling = spellings[(idx + dayOfYear) % spellings.length];
      fullCycle.push({theme, level, kind, spelling});
    }
  }

  const jobs = [];
  // Slot 0: dedicated Daily Challenge pack for today's date (level 4 paragraphs or sentences)
  const dailyTheme = themes[dayOfYear % themes.length];
  const dailySpelling = spellings[dayOfYear % spellings.length];
  const dailyKind = dayOfYear % 2 === 0 ? 'paragraphs' : 'sentences';
  jobs.push({
    theme: dailyTheme,
    level: 4,
    kind: dailyKind,
    spelling: dailySpelling,
    isDailyFeature: true,
  });

  const step = Math.max(1, config.maxCallsPerRun - 1);
  const startOffset = ((dayOfYear - 1) * step) % fullCycle.length;
  for (let i = 0; i < config.maxCallsPerRun - 1; i++) {
    const slot = fullCycle[(startOffset + i) % fullCycle.length];
    jobs.push({...slot, isDailyFeature: false});
  }

  return {jobs, dayOfYear, todayStr};
}

function buildLevelConstraintText(level) {
  switch (level) {
    case 1:
      return 'STRICT KEY CONSTRAINT: Use ONLY lowercase home-row letters: a, s, d, f, g, h, j, k, l. No uppercase letters, no numbers, no punctuation, no top-row or bottom-row letters (e.g. "salad", "falls", "glass", "flask", "flags", "half" is invalid because i/e/t/o/r/u/p/q/w/y/z/x/c/v/b/n/m are forbidden). Wait: carefully verify EVERY SINGLE LETTER of every word is ONLY inside {a,s,d,f,g,h,j,k,l}!';
    case 2:
      return 'STRICT KEY CONSTRAINT: Use ONLY lowercase letters from the home row and top row: a, s, d, f, g, h, j, k, l, q, w, e, r, t, y, u, i, o, p. Do NOT use any bottom-row letters (z, x, c, v, b, n, m), uppercase letters, numbers, or punctuation.';
    case 3:
      return 'STRICT KEY CONSTRAINT: Use ONLY lowercase English letters a-z. Do NOT use uppercase letters, numbers, apostrophes, hyphens, or punctuation.';
    case 4:
      return 'STRICT KEY CONSTRAINT: Use English letters (a-z, A-Z), spaces, and ONLY basic punctuation: . , ! ? ; : - " \' . Do NOT include digits 0-9 or programming symbols like @ # $ % & * ( ) { } [ ] / = +.';
    case 5:
    default:
      return 'STRICT KEY CONSTRAINT: Use printable ASCII characters (0x20-0x7E) including letters, digits 0-9, and standard keyboard symbols.';
  }
}

function buildKindInstruction(kind, count, theme, spelling) {
  const spellingDesc =
    spelling === 'british'
      ? 'British English spelling (e.g. colour, practise, centre, programme, travelled)'
      : 'American English spelling (e.g. color, practice, center, program, traveled)';

  switch (kind) {
    case 'words':
      return `Generate ${count} distinct single English words (2 to 12 letters each, no spaces or hyphens) related to "${theme}" using ${spellingDesc}.`;
    case 'sentences':
      return `Generate ${count} distinct, natural, engaging typing sentences related to "${theme}" using ${spellingDesc}. Each sentence MUST be between 45 and 105 characters long and end with terminal punctuation (. ! or ?).`;
    case 'paragraphs':
      return `Generate ${count} distinct multi-sentence typing paragraphs related to "${theme}" using ${spellingDesc}. Each paragraph MUST be between 220 and 420 characters long and end with terminal punctuation (. ! or ?).`;
    case 'numbers':
      return `Generate ${count} distinct realistic numeric practice strings (dates, times, measurements, prices, scores, serials, percentages) themed around "${theme}". Each item MUST be 10 to 75 characters long and contain at least 2 digits.`;
    case 'code':
    default:
      return `Generate ${count} distinct clean, single-line beginner programming/CLI snippets (JavaScript, Python, HTML, or CSS style) themed around "${theme}". Each item MUST be 18 to 110 characters long, pure printable ASCII, with balanced syntax.`;
  }
}

function buildPrompt(job, targetCount) {
  return [
    'You generate clean, educational touch-typing practice material for school and home learners.',
    buildKindInstruction(job.kind, targetCount, job.theme, job.spelling),
    buildLevelConstraintText(job.level),
    'CONTENT SAFETY & QUALITY RULES:',
    '- Output strictly printable ASCII only (no smart quotes, no em-dashes, no accented characters, no emoji).',
    '- Child-safe for all school ages: strictly NO profanity, violence, weapons, alcohol, tobacco, gambling, or adult topics.',
    '- NO commercial brand names (no Google, Apple, Microsoft, Netflix, Nike, etc.).',
    '- NO personal data, email addresses, URLs, or real phone numbers.',
    '- Return a JSON object with a single key "items" containing an array of strings.',
  ].join('\n');
}

async function callGeminiRest({apiKey, model, prompt}) {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{role: 'user', parts: [{text: prompt}]}],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {type: 'STRING'},
          },
        },
        required: ['items'],
      },
    },
    safetySettings: [
      {category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE'},
      {category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE'},
      {category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE'},
      {category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE'},
    ],
  };

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxAttempts - 1) {
          const waitMs = 5000 * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
          console.warn(
            `Gemini HTTP ${res.status}; backing off ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${maxAttempts - 1})...`,
          );
          await sleep(waitMs);
          continue;
        }
        return {
          ok: false,
          fatalStop: res.status === 429,
          status: res.status,
          error: `Gemini API returned HTTP ${res.status}`,
        };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          ok: false,
          fatalStop: res.status === 401 || res.status === 403,
          status: res.status,
          error: `Gemini API HTTP ${res.status}${errText ? `: ${errText.slice(0, 160)}` : ''}`,
        };
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof rawText !== 'string' || !rawText.trim()) {
        return {ok: false, fatalStop: false, error: 'Empty Gemini candidate response'};
      }

      const parsed = JSON.parse(rawText);
      if (!parsed || !Array.isArray(parsed.items)) {
        return {ok: false, fatalStop: false, error: 'Missing items array in JSON response'};
      }

      return {ok: true, items: parsed.items};
    } catch (err) {
      if (attempt < maxAttempts - 1) {
        const waitMs = 4000 * Math.pow(2, attempt);
        console.warn(
          `Request error (${err instanceof Error ? err.message : 'network'}); retrying in ${Math.round(waitMs / 1000)}s...`,
        );
        await sleep(waitMs);
        continue;
      }
      return {
        ok: false,
        fatalStop: false,
        error: err instanceof Error ? err.message : 'Network failure',
      };
    }
  }

  return {ok: false, fatalStop: false, error: 'Exhausted retries'};
}

function loadExistingIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    return {schemaVersion: 1, generatedAt: new Date().toISOString(), packs: []};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const validated = validatePackIndex(raw);
    if (validated.ok) return validated.index;
  } catch {
    // Fallback empty
  }
  return {schemaVersion: 1, generatedAt: new Date().toISOString(), packs: []};
}

function getPacksFolderBytes() {
  if (!fs.existsSync(PACKS_DIR)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(PACKS_DIR)) {
    const p = path.join(PACKS_DIR, name);
    if (fs.statSync(p).isFile()) {
      total += fs.statSync(p).size;
    }
  }
  return total;
}

function pruneAndEnforceBudget(entries, retentionDays, maxTotalBytes, nowMs) {
  const cutoffMs = nowMs - retentionDays * 86_400_000;
  let prunedCount = 0;

  // Keep valid files that actually exist on disk
  let valid = entries.filter((e) => fs.existsSync(path.join(PACKS_DIR, e.file)));

  const nonExpired = valid.filter((e) => e.createdAt >= cutoffMs);
  const hasRecentGenerated = nonExpired.some((e) => !e.id.startsWith('seed-'));

  if (hasRecentGenerated) {
    // Drop any packs older than retentionDays (including old seed packs once fresh ones exist)
    for (const entry of valid) {
      if (entry.createdAt < cutoffMs) {
        const fp = path.join(PACKS_DIR, entry.file);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        prunedCount += 1;
      }
    }
    valid = nonExpired;
  } else {
    // Keep starter seed-* packs as offline fallback if no recent generated packs exist
    valid = valid.filter((entry) => {
      if (entry.createdAt >= cutoffMs || entry.id.startsWith('seed-')) return true;
      const fp = path.join(PACKS_DIR, entry.file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      prunedCount += 1;
      return false;
    });
  }

  // Sort oldest first for byte-budget eviction
  valid.sort((a, b) => a.createdAt - b.createdAt);
  while (valid.length > 1 && getPacksFolderBytes() > maxTotalBytes) {
    const oldest = valid.shift();
    if (!oldest) break;
    const fp = path.join(PACKS_DIR, oldest.file);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    prunedCount += 1;
  }

  // Clean up orphaned pack files not referenced by the index
  const activeFiles = new Set(['index.json', 'last-run.json', ...valid.map((e) => e.file)]);
  for (const name of fs.readdirSync(PACKS_DIR)) {
    if (!name.endsWith('.json')) continue;
    if (!activeFiles.has(name)) {
      fs.unlinkSync(path.join(PACKS_DIR, name));
      prunedCount += 1;
    }
  }

  // Sort newest first in index.json
  valid.sort((a, b) => b.createdAt - a.createdAt);
  return {entries: valid, prunedCount};
}

async function main() {
  fs.mkdirSync(PACKS_DIR, {recursive: true});
  const config = loadConfig();
  const now = new Date();
  const nowMs = now.getTime();
  const existingIndex = loadExistingIndex();
  const {jobs, dayOfYear, todayStr} = buildDailyJobs(config, now);

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const summary = {
    ranAt: now.toISOString(),
    date: todayStr,
    dayOfYear,
    model: config.geminiModel,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    stoppedEarlyReason: null,
    prunedCount: 0,
    totalPacks: existingIndex.packs.length,
    totalBytes: 0,
  };

  let entries = [...existingIndex.packs];

  if (!apiKey) {
    console.log('GEMINI_API_KEY is not set; skipping generation and keeping existing word packs.');
    summary.stoppedEarlyReason = 'missing-api-key';
  } else {
    const existingIds = new Set(entries.map((e) => e.id));

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const baseId = job.isDailyFeature
        ? `${todayStr}-daily-${job.kind}-${slugifyTheme(job.theme)}-l${job.level}-${job.spelling}`
        : `${todayStr}-${job.kind}-${slugifyTheme(job.theme)}-l${job.level}-${job.spelling}`;

      // Avoid overwriting an identical pack created today unless re-dispatched manually with clean slot
      if (existingIds.has(baseId)) {
        console.log(`Skipping ${baseId} (already exists for today).`);
        continue;
      }

      if (summary.attempted > 0 && config.delayBetweenCallsMs > 0) {
        await sleep(config.delayBetweenCallsMs);
      }

      summary.attempted += 1;
      const targetCount =
        Number(config.itemsPerPack[job.kind]) || (MIN_ITEMS_BY_KIND[job.kind] ?? 12);
      const prompt = buildPrompt(job, targetCount);

      console.log(
        `[${i + 1}/${jobs.length}] Generating ${job.kind} (${job.theme}, L${job.level}, ${job.spelling})...`,
      );

      const res = await callGeminiRest({
        apiKey,
        model: config.geminiModel,
        prompt,
      });

      if (!res.ok) {
        summary.failed += 1;
        console.warn(`Failed ${baseId}: ${res.error}`);
        if (res.fatalStop) {
          summary.stoppedEarlyReason = `api-stop-${res.status || 'rate-limit'}`;
          console.warn('Stopping pack generation gracefully while preserving existing packs.');
          break;
        }
        continue;
      }

      const candidatePack = {
        id: baseId,
        kind: job.kind,
        theme: job.theme,
        level: job.level,
        spelling: job.spelling,
        items: res.items,
      };

      const validated = validatePackObject(candidatePack);
      if (!validated.ok) {
        summary.failed += 1;
        console.warn(`Validation rejected ${baseId}: ${validated.reason}`);
        continue;
      }

      const fileName = `${validated.pack.id}.json`;
      const createdAt = Date.now();
      fs.writeFileSync(
        path.join(PACKS_DIR, fileName),
        JSON.stringify(validated.pack, null, 2) + '\n',
        'utf8',
      );

      entries.unshift({
        id: validated.pack.id,
        kind: validated.pack.kind,
        theme: validated.pack.theme,
        level: validated.pack.level,
        spelling: validated.pack.spelling,
        count: validated.pack.items.length,
        file: fileName,
        createdAt,
        date: todayStr,
      });
      existingIds.add(validated.pack.id);
      summary.succeeded += 1;
      console.log(`Saved ${fileName} (${validated.pack.items.length} items).`);
    }
  }

  const pruned = pruneAndEnforceBudget(
    entries,
    config.retentionDays,
    config.maxTotalBytes,
    nowMs,
  );
  entries = pruned.entries;
  summary.prunedCount = pruned.prunedCount;
  summary.totalPacks = entries.length;

  const nextIndex = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    packs: entries,
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(nextIndex, null, 2) + '\n', 'utf8');

  summary.totalBytes = getPacksFolderBytes();
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  console.log(
    `Pack factory finished: succeeded=${summary.succeeded}, failed=${summary.failed}, totalPacks=${summary.totalPacks}, folderBytes=${summary.totalBytes}.`,
  );
}

main().catch((err) => {
  console.error('Unexpected generator error:', err instanceof Error ? err.message : String(err));
  process.exit(0); // Never fail workflow on transient generator errors
});
