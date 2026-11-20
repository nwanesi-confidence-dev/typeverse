export const PACK_THEMES = [
  'School life',
  'Technology',
  'Nature',
  'Business',
  'Sports',
  'Stories',
  'Science',
  'Everyday life',
];

export const PACK_KINDS = ['words', 'sentences', 'paragraphs', 'numbers', 'code'];
export const PACK_SPELLINGS = ['british', 'american'];

export const MIN_ITEMS_BY_KIND = {
  words: 20,
  sentences: 8,
  paragraphs: 3,
  numbers: 10,
  code: 8,
};

const HOME_ROW = 'asdfghjkl';
const TOP_ROW = 'qwertyuiop';
const BOTTOM_ROW = 'zxcvbnm';

const LEVEL_1_SET = new Set((HOME_ROW + ' ').split(''));
const LEVEL_2_SET = new Set((HOME_ROW + TOP_ROW + ' ').split(''));
const LEVEL_3_SET = new Set((HOME_ROW + TOP_ROW + BOTTOM_ROW + ' ').split(''));
const LEVEL_4_LOWER = new Set((HOME_ROW + TOP_ROW + BOTTOM_ROW + " .,!?;:-\"'").split(''));

const PRINTABLE_ASCII_RE = /^[\x20-\x7E]+$/;
const ALPHA_WORD_RE = /^[A-Za-z]{2,12}$/;
const ENDS_IN_PUNCTUATION_RE = /[.!?]["']?$/;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const PHONE_OR_ID_RE = /(?:\+?\d[\d\s().-]{7,}\d|\b\d{3}-\d{2}-\d{4}\b)/;

const BLOCKED_TERMS = new Set([
  // Profanity & slurs
  'damn',
  'hell',
  'crap',
  'shit',
  'fuck',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'cock',
  'pussy',
  'whore',
  'slut',
  'cunt',
  'nigger',
  'faggot',
  'retard',
  // Unsuitable for school children
  'alcohol',
  'beer',
  'wine',
  'vodka',
  'whiskey',
  'whisky',
  'tequila',
  'cigarette',
  'cigarettes',
  'vape',
  'vaping',
  'tobacco',
  'nicotine',
  'casino',
  'gamble',
  'gambling',
  'betting',
  'weapon',
  'weapons',
  'murder',
  'suicide',
  'cocaine',
  'heroin',
  'marijuana',
  'cannabis',
  'porn',
  'pornography',
  'nude',
  'nudity',
  'sex',
  'sexual',
  // Commercial brand names
  'google',
  'apple',
  'microsoft',
  'amazon',
  'facebook',
  'instagram',
  'tiktok',
  'snapchat',
  'twitter',
  'netflix',
  'spotify',
  'nike',
  'adidas',
  'samsung',
  'tesla',
  'disney',
  'youtube',
  'openai',
  'chatgpt',
  'gemini',
  'playstation',
  'xbox',
  'nintendo',
  'starbucks',
  'mcdonalds',
  'walmart',
]);

export function sanitiseAscii(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || !PRINTABLE_ASCII_RE.test(cleaned)) return null;
  return cleaned;
}

export function hasBlockedContent(text) {
  if (EMAIL_RE.test(text) || URL_RE.test(text) || PHONE_OR_ID_RE.test(text)) {
    return true;
  }
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/);
  for (const tok of tokens) {
    if (tok && BLOCKED_TERMS.has(tok)) {
      return true;
    }
  }
  return false;
}

export function isAllowedForLevel(text, level) {
  if (!PRINTABLE_ASCII_RE.test(text)) return false;

  if (level === 1) {
    for (let i = 0; i < text.length; i++) {
      if (!LEVEL_1_SET.has(text[i])) return false;
    }
    return true;
  }

  if (level === 2) {
    for (let i = 0; i < text.length; i++) {
      if (!LEVEL_2_SET.has(text[i])) return false;
    }
    return true;
  }

  if (level === 3) {
    for (let i = 0; i < text.length; i++) {
      if (!LEVEL_3_SET.has(text[i])) return false;
    }
    return true;
  }

  if (level === 4) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch >= 'A' && ch <= 'Z') continue;
      if (LEVEL_4_LOWER.has(ch)) continue;
      return false;
    }
    return true;
  }

  if (level === 5) {
    return PRINTABLE_ASCII_RE.test(text);
  }

  return false;
}

export function validatePackItem(rawItem, kind, level) {
  const clean = sanitiseAscii(rawItem);
  if (!clean) return null;
  if (hasBlockedContent(clean)) return null;
  if (!isAllowedForLevel(clean, level)) return null;

  if (kind === 'words') {
    if (!ALPHA_WORD_RE.test(clean)) return null;
    if (level <= 3 && clean !== clean.toLowerCase()) return null;
    return clean;
  }

  if (kind === 'sentences') {
    if (clean.length < 40 || clean.length > 110) return null;
    if (!ENDS_IN_PUNCTUATION_RE.test(clean)) return null;
    return clean;
  }

  if (kind === 'paragraphs') {
    if (clean.length < 200 || clean.length > 450) return null;
    if (!ENDS_IN_PUNCTUATION_RE.test(clean)) return null;
    return clean;
  }

  if (kind === 'numbers') {
    if (clean.length < 8 || clean.length > 80) return null;
    const digits = (clean.match(/\d/g) || []).length;
    if (digits < 2) return null;
    return clean;
  }

  if (kind === 'code') {
    if (clean.length < 15 || clean.length > 120) return null;
    return clean;
  }

  return null;
}

export function extractKeysUsedFromItems(items) {
  const seen = new Set();
  for (const text of items) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') continue;
      seen.add(ch.toLowerCase());
    }
  }
  return Array.from(seen).sort();
}

export function validatePackObject(rawPack, options = {}) {
  if (!rawPack || typeof rawPack !== 'object') {
    return {ok: false, reason: 'Pack payload is not an object.'};
  }

  const id = typeof rawPack.id === 'string' ? rawPack.id.trim() : '';
  if (!id || !/^[a-zA-Z0-9._-]{3,120}$/.test(id)) {
    return {ok: false, reason: 'Invalid pack id.'};
  }

  const kind = rawPack.kind;
  if (!PACK_KINDS.includes(kind)) {
    return {ok: false, reason: `Invalid pack kind: ${String(kind)}`};
  }

  const theme = rawPack.theme;
  if (!PACK_THEMES.includes(theme)) {
    return {ok: false, reason: `Invalid pack theme: ${String(theme)}`};
  }

  const level = Number(rawPack.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    return {ok: false, reason: `Invalid pack level: ${String(rawPack.level)}`};
  }

  const spelling = rawPack.spelling;
  if (!PACK_SPELLINGS.includes(spelling)) {
    return {ok: false, reason: `Invalid pack spelling: ${String(spelling)}`};
  }

  if (!Array.isArray(rawPack.items)) {
    return {ok: false, reason: 'Pack items must be an array.'};
  }

  const seen = new Set();
  const validItems = [];
  for (const rawItem of rawPack.items) {
    const valid = validatePackItem(rawItem, kind, level);
    if (!valid) continue;
    const key = valid.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    validItems.push(valid);
  }

  const minItems =
    typeof options.minItems === 'number'
      ? options.minItems
      : MIN_ITEMS_BY_KIND[kind] ?? 8;

  if (validItems.length < minItems) {
    return {
      ok: false,
      reason: `Too few valid items (${validItems.length}/${minItems}) for ${kind} level ${level}.`,
    };
  }

  const keysUsed = extractKeysUsedFromItems(validItems);

  return {
    ok: true,
    pack: {
      id,
      kind,
      theme,
      level,
      spelling,
      items: validItems,
      keysUsed,
    },
  };
}

export function validatePackIndex(rawIndex) {
  if (!rawIndex || typeof rawIndex !== 'object') {
    return {ok: false, reason: 'Index payload is not an object.'};
  }

  if (!Array.isArray(rawIndex.packs)) {
    return {ok: false, reason: 'Index missing packs array.'};
  }

  const validEntries = [];
  const seenIds = new Set();

  for (const entry of rawIndex.packs) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seenIds.has(id) || !/^[a-zA-Z0-9._-]{3,120}$/.test(id)) continue;
    if (!PACK_KINDS.includes(entry.kind)) continue;
    if (!PACK_THEMES.includes(entry.theme)) continue;
    const level = Number(entry.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) continue;
    if (!PACK_SPELLINGS.includes(entry.spelling)) continue;
    const count = Number(entry.count);
    if (!Number.isFinite(count) || count < 1) continue;
    const file = typeof entry.file === 'string' ? entry.file.trim() : '';
    if (!file || file.includes('..') || !/^[a-zA-Z0-9._/-]+\.json$/.test(file)) {
      continue;
    }
    const createdAt =
      typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : Date.now();
    const date =
      typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        ? entry.date
        : new Date(createdAt).toISOString().slice(0, 10);

    seenIds.add(id);
    validEntries.push({
      id,
      kind: entry.kind,
      theme: entry.theme,
      level,
      spelling: entry.spelling,
      count,
      file,
      createdAt,
      date,
    });
  }

  return {
    ok: true,
    index: {
      schemaVersion: Number(rawIndex.schemaVersion) || 1,
      generatedAt:
        typeof rawIndex.generatedAt === 'string'
          ? rawIndex.generatedAt
          : new Date().toISOString(),
      packs: validEntries,
    },
  };
}
