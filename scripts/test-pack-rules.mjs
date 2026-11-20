import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractKeysUsedFromItems,
  hasBlockedContent,
  isAllowedForLevel,
  sanitiseAscii,
  validatePackIndex,
  validatePackItem,
  validatePackObject,
} from '../shared/pack-rules.mjs';

test('sanitiseAscii normalises smart punctuation and rejects non-ASCII', () => {
  assert.equal(sanitiseAscii('“Today’s   plan — ready”'), '"Today\'s plan - ready"');
  assert.equal(sanitiseAscii('café crème'), null);
  assert.equal(sanitiseAscii('   '), null);
});

test('level 1 enforces home-row letters and space only', () => {
  assert.equal(isAllowedForLevel('salad falls asks', 1), true);
  assert.equal(isAllowedForLevel('flask', 1), true);
  assert.equal(isAllowedForLevel('top', 1), false); // t, o, p are top row
  assert.equal(isAllowedForLevel('Salad', 1), false); // uppercase disallowed
  assert.equal(isAllowedForLevel('sad!', 1), false);
});

test('level 2 allows home + top row lowercase only', () => {
  assert.equal(isAllowedForLevel('typewriter poetry', 2), true);
  assert.equal(isAllowedForLevel('zebra', 2), false); // z, b are bottom row
  assert.equal(isAllowedForLevel('Quiet', 2), false);
});

test('level 3 allows all lowercase a-z without capitals or punctuation', () => {
  assert.equal(isAllowedForLevel('quick brown fox jumps', 3), true);
  assert.equal(isAllowedForLevel('Quick brown', 3), false);
  assert.equal(isAllowedForLevel('pack.', 3), false);
});

test('level 4 allows capitals, apostrophes, and basic punctuation without digits/symbols', () => {
  assert.equal(isAllowedForLevel("Today's calm tide rises, doesn't it?", 4), true);
  assert.equal(isAllowedForLevel('Score was 42 points.', 4), false);
  assert.equal(isAllowedForLevel('const x = 1;', 4), false);
});

test('level 5 allows full printable ASCII including digits and code symbols', () => {
  assert.equal(isAllowedForLevel('Order #408: 25% off $64.00!', 5), true);
  assert.equal(isAllowedForLevel('const rate = [95, 98];', 5), true);
});

test('validatePackItem enforces length, endings, and content filters per kind', () => {
  // Words: 2-12 alpha
  assert.equal(validatePackItem('flask', 'words', 1), 'flask');
  assert.equal(validatePackItem('a', 'words', 1), null);
  assert.equal(validatePackItem('abcdefghijklm', 'words', 3), null);

  // Sentences: 40-110 chars ending in punctuation
  const validSentence = 'Bright lantern lights guide students across the quiet courtyard.';
  assert.equal(validatePackItem(validSentence, 'sentences', 4), validSentence);
  assert.equal(validatePackItem('Too short.', 'sentences', 4), null);
  assert.equal(
    validatePackItem('This sentence is long enough to pass length rules without punctuation', 'sentences', 4),
    null,
  );

  // Paragraphs: 200-450 chars ending in punctuation
  const validParagraph =
    'Morning dew rests across the tall meadow grass while birds gather near the wooden fence. Warm sunlight crosses the quiet valley floor, waking winding footpaths that lead past clear streams,mossy boulders, and tall old oak trees.';
  assert.equal(validatePackItem(validParagraph, 'paragraphs', 4), validParagraph);
  assert.equal(validatePackItem(validSentence, 'paragraphs', 4), null);

  // Numbers & code
  assert.equal(validatePackItem('Flight 402 departs 08:45 AM.', 'numbers', 5), 'Flight 402 departs 08:45 AM.');
  assert.equal(validatePackItem('No digits here!', 'numbers', 5), null);
  assert.equal(validatePackItem('const sum = values.reduce((a, b) => a + b, 0);', 'code', 5) !== null, true);
});

test('hasBlockedContent rejects profanity, unsafe school terms, brands, emails, and URLs', () => {
  assert.equal(hasBlockedContent('Please avoid using google in class.'), true);
  assert.equal(hasBlockedContent('Visit https://example.com today.'), true);
  assert.equal(hasBlockedContent('Email student@school.org now.'), true);
  assert.equal(hasBlockedContent('We studied biology and chemistry today.'), false);
});

test('validatePackObject deduplicates items, computes keysUsed, and enforces minimum counts', () => {
  const words = [
    'dad', 'sad', 'lad', 'fad', 'had', 'all', 'ask', 'add', 'ash', 'dash',
    'fall', 'fast', 'flag', 'glad', 'half', 'hall', 'jag', 'lass', 'salad', 'glass',
    'flask', 'flags', 'SAD', '  flask  ',
  ];
  // Wait: t, m, r, n etc. — ensure purely home row letters!
  const pureHomeWords = [
    'dad', 'sad', 'lad', 'fad', 'had', 'all', 'ask', 'add', 'ash', 'dash',
    'fall', 'gash', 'glad', 'half', 'hall', 'lash', 'lass', 'salad', 'glass', 'flask',
    'sash', 'hash', 'gala', 'slag', 'shag', 'shad', 'lags', 'hags', 'DAD', '  glass ',
  ];
  const result = validatePackObject({
    id: 'test-home-l1',
    kind: 'words',
    theme: 'Everyday life',
    level: 1,
    spelling: 'british',
    items: pureHomeWords,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.pack.items.length >= 20);
    assert.equal(result.pack.items.includes('DAD'), false); // case-insensitive dedupe
    assert.deepEqual(result.pack.keysUsed, extractKeysUsedFromItems(result.pack.items));
  }

  // Fails if items contain forbidden top-row word leaving < 20 valid
  const tooSmall = validatePackObject({
    id: 'too-small',
    kind: 'words',
    theme: 'Everyday life',
    level: 1,
    spelling: 'british',
    items: ['dad', 'sad', 'top', 'quiz'],
  });
  assert.equal(tooSmall.ok, false);
});

test('validatePackIndex rejects path-traversal files and keeps valid entries', () => {
  const res = validatePackIndex({
    schemaVersion: 1,
    generatedAt: '2026-11-19T12:00:00.000Z',
    packs: [
      {
        id: 'seed-ok',
        kind: 'words',
        theme: 'Nature',
        level: 2,
        spelling: 'british',
        count: 30,
        file: 'seed-ok.json',
        createdAt: 1700000000000,
        date: '2026-11-19',
      },
      {
        id: 'evil-entry',
        kind: 'words',
        theme: 'Nature',
        level: 2,
        spelling: 'british',
        count: 30,
        file: '../secret.json',
        createdAt: 1700000000000,
        date: '2026-11-19',
      },
    ],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.index.packs.length, 1);
    assert.equal(res.index.packs[0].id, 'seed-ok');
  }
});
