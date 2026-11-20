import type {
  ContentTheme,
  PackKind,
  SpellingVariant,
  WordDifficultyTier,
} from '@/src/types/app';

export interface StaticPackFile {
  id: string;
  kind: PackKind;
  theme: ContentTheme;
  level: WordDifficultyTier;
  spelling: SpellingVariant;
  items: string[];
  keysUsed: string[];
}

export interface StaticPackIndexEntry {
  id: string;
  kind: PackKind;
  theme: ContentTheme;
  level: WordDifficultyTier;
  spelling: SpellingVariant;
  count: number;
  file: string;
  createdAt: number;
  date: string;
}

export interface StaticPackIndex {
  schemaVersion: number;
  generatedAt: string;
  packs: StaticPackIndexEntry[];
}

export declare const PACK_THEMES: ContentTheme[];
export declare const PACK_KINDS: PackKind[];
export declare const PACK_SPELLINGS: SpellingVariant[];
export declare const MIN_ITEMS_BY_KIND: Record<PackKind, number>;

export declare function sanitiseAscii(input: unknown): string | null;
export declare function hasBlockedContent(text: string): boolean;
export declare function isAllowedForLevel(text: string, level: number): boolean;
export declare function validatePackItem(
  rawItem: unknown,
  kind: PackKind,
  level: number,
): string | null;
export declare function extractKeysUsedFromItems(items: string[]): string[];
export declare function validatePackObject(
  rawPack: unknown,
  options?: {minItems?: number},
): {ok: true; pack: StaticPackFile} | {ok: false; reason: string};
export declare function validatePackIndex(
  rawIndex: unknown,
): {ok: true; index: StaticPackIndex} | {ok: false; reason: string};
