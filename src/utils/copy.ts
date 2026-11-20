import type {SpellingVariant} from '@/src/types/app';

interface SpellingPair {
  british: string;
  american: string;
}

const COPY_MAP = {
  colour: {british: 'Colour', american: 'Color'},
  colourLower: {british: 'colour', american: 'color'},
  practise: {british: 'Practise', american: 'Practice'},
  practiseLower: {british: 'practise', american: 'practice'},
  customise: {british: 'Customise', american: 'Customize'},
  customiseLower: {british: 'customise', american: 'customize'},
  recognised: {british: 'recognised', american: 'recognized'},
  centre: {british: 'Centre', american: 'Center'},
  behaviour: {british: 'Behaviour', american: 'Behavior'},
  personalise: {british: 'Personalise', american: 'Personalize'},
  metre: {british: 'Metre', american: 'Meter'},
  optimise: {british: 'Optimise', american: 'Optimize'},
} as const satisfies Record<string, SpellingPair>;

export type CopyKey = keyof typeof COPY_MAP;

export function tCopy(key: CopyKey, spelling: SpellingVariant): string {
  return COPY_MAP[key][spelling];
}

const WORD_SPELLING_SWAPS: Array<[RegExp, string]> = [
  [/\bcolor\b/gi, 'colour'],
  [/\bcolors\b/gi, 'colours'],
  [/\bcolored\b/gi, 'coloured'],
  [/\bfavor\b/gi, 'favour'],
  [/\bfavors\b/gi, 'favours'],
  [/\bfavorite\b/gi, 'favourite'],
  [/\bbehavior\b/gi, 'behaviour'],
  [/\bcenter\b/gi, 'centre'],
  [/\bcenters\b/gi, 'centres'],
  [/\bmeter\b/gi, 'metre'],
  [/\bmeters\b/gi, 'metres'],
  [/\btheater\b/gi, 'theatre'],
  [/\boptimize\b/gi, 'optimise'],
  [/\borganize\b/gi, 'organise'],
  [/\brecognize\b/gi, 'recognise'],
  [/\bcustomize\b/gi, 'customise'],
  [/\btraveling\b/gi, 'travelling'],
  [/\bcanceled\b/gi, 'cancelled'],
  [/\bgray\b/gi, 'grey'],
  [/\bneighbor\b/gi, 'neighbour'],
  [/\bhonor\b/gi, 'honour'],
  [/\blabor\b/gi, 'labour'],
  [/\bharbor\b/gi, 'harbour'],
  [/\bprogram\b/gi, 'programme'],
];

const UK_TO_US_SWAPS: Array<[RegExp, string]> = [
  [/\bcolour\b/gi, 'color'],
  [/\bcolours\b/gi, 'colors'],
  [/\bcoloured\b/gi, 'colored'],
  [/\bfavour\b/gi, 'favor'],
  [/\bfavours\b/gi, 'favors'],
  [/\bfavourite\b/gi, 'favorite'],
  [/\bbehaviour\b/gi, 'behavior'],
  [/\bcentre\b/gi, 'center'],
  [/\bcentres\b/gi, 'centers'],
  [/\bmetre\b/gi, 'meter'],
  [/\bmetres\b/gi, 'meters'],
  [/\btheatre\b/gi, 'theater'],
  [/\boptimise\b/gi, 'optimize'],
  [/\borganise\b/gi, 'organize'],
  [/\brecognise\b/gi, 'recognize'],
  [/\bcustomise\b/gi, 'customize'],
  [/\btravelling\b/gi, 'traveling'],
  [/\bcancelled\b/gi, 'canceled'],
  [/\bgrey\b/gi, 'gray'],
  [/\bneighbour\b/gi, 'neighbor'],
  [/\bhonour\b/gi, 'honor'],
  [/\blabor\b/gi, 'labor'],
  [/\bharbour\b/gi, 'harbor'],
  [/\bprogramme\b/gi, 'program'],
];

function matchCase(source: string, replacement: string): string {
  if (source.toUpperCase() === source) return replacement.toUpperCase();
  if (source[0] && source[0].toUpperCase() === source[0]) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function adaptTextSpelling(text: string, spelling: SpellingVariant): string {
  const swaps = spelling === 'british' ? WORD_SPELLING_SWAPS : UK_TO_US_SWAPS;
  let result = text;
  for (const [pattern, replacement] of swaps) {
    result = result.replace(pattern, (matched) => matchCase(matched, replacement));
  }
  return result;
}
