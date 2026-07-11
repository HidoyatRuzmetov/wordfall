/**
 * The daily challenge heart of WordFall.
 *
 * Every player who opens the post on a given UTC day gets the same core
 * challenge: the same rotating rule and the same hidden Trick Word. The
 * falling stream stays fresh each play, but is shaped by fairness guards so
 * unlucky letter droughts do not dominate the run.
 *
 * This module is shared by both the Phaser client and the Devvit server so the
 * daily config, rules, scoring inputs, and spawn-shaping rules stay aligned.
 */

import { hashString, makeRng } from './rng';
import type { DailyConfig, DailyRule, DailyRuleId } from './types';

/** Day 0 of WordFall. dayNumber counts UTC days from here. */
const LAUNCH_EPOCH_UTC = Date.UTC(2026, 6, 8);

/** The rotating daily rule mutators. */
export const RULES: Record<DailyRuleId, DailyRule> = {
  classic: {
    id: 'classic',
    name: 'Classic Fall',
    blurb: 'Pure WordFall — every letter counts.',
    tip: 'Catch letters, build words, dodge the shards.',
  },
  vowelRush: {
    id: 'vowelRush',
    name: 'Vowel Rush',
    blurb: 'Vowels add bonus points today.',
    tip: 'Load up on A E I O U — they pay extra.',
  },
  longHaul: {
    id: 'longHaul',
    name: 'Long Haul',
    blurb: 'Words of 6+ letters earn a strong bonus.',
    tip: 'Be patient. Big words, big points.',
  },
  consonantChaos: {
    id: 'consonantChaos',
    name: 'Consonant Chaos',
    blurb: 'Consonants add bonus points today.',
    tip: 'Crunchy consonant words rule the board.',
  },
  rareGems: {
    id: 'rareGems',
    name: 'Rare Gems',
    blurb: 'Words with J Q X Z or K earn a gem bonus.',
    tip: 'Hunt the rare letters for a jackpot.',
  },
  featherweight: {
    id: 'featherweight',
    name: 'Featherweight',
    blurb: 'Snappy 3–4 letter words earn a bonus.',
    tip: 'Speed over size — rack up quick combos.',
  },
  comboFrenzy: {
    id: 'comboFrenzy',
    name: 'Combo Frenzy',
    blurb: 'Combos climb twice as fast and never fully reset.',
    tip: 'Keep the valid words flowing to spike your multiplier.',
  },
};

/** Format a Date as a UTC YYYY-MM-DD key. */
export const dateKeyUTC = (d: Date = new Date()): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Add whole UTC days to a YYYY-MM-DD date key. */
export const addDaysUTC = (dateKey: string, days: number): string => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return dateKeyUTC(new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days)));
};

/** dayNumber = whole UTC days since the launch epoch (day 1 on launch day). */
export const dayNumberFor = (dateKey: string): number => {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  const t = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  return Math.floor((t - LAUNCH_EPOCH_UTC) / 86400000) + 1;
};

/** Seeded shuffle of a word's letters that is guaranteed to differ from the source. */
const scramble = (word: string, seed: number): string => {
  const rng = makeRng(seed ^ 0x5bd1e995);
  const chars = word.toUpperCase().split('');
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = chars[i]!;
      chars[i] = chars[j]!;
      chars[j] = tmp;
    }
    const out = chars.join('');
    if (out !== word.toUpperCase()) return out;
  }
  return chars.reverse().join('');
};

/** One prepared day: which rule is active and the hidden Trick Word. */
type DaySpec = { rule: DailyRuleId; trick: string };

/**
 * 50 hand-picked days — a fresh, engaging rule + Trick Word each day, ordered
 * so the difficulty and flavor stay inviting. Day numbers beyond 50 cycle back
 * through the list.
 */
const DAY_SCHEDULE: readonly DaySpec[] = [
  { rule: 'classic', trick: 'RIVER' },
  { rule: 'vowelRush', trick: 'PLANET' },
  { rule: 'featherweight', trick: 'GARDEN' },
  { rule: 'longHaul', trick: 'HARBOR' },
  { rule: 'rareGems', trick: 'WIZARD' },
  { rule: 'consonantChaos', trick: 'SPHINX' },
  { rule: 'comboFrenzy', trick: 'JUNGLE' },
  { rule: 'classic', trick: 'CANDLE' },
  { rule: 'vowelRush', trick: 'ORANGE' },
  { rule: 'featherweight', trick: 'ROCKET' },
  { rule: 'longHaul', trick: 'LANTERN' },
  { rule: 'rareGems', trick: 'QUIVER' },
  { rule: 'consonantChaos', trick: 'RHYTHM' },
  { rule: 'comboFrenzy', trick: 'GALAXY' },
  { rule: 'classic', trick: 'MEADOW' },
  { rule: 'vowelRush', trick: 'PUZZLE' },
  { rule: 'featherweight', trick: 'FALCON' },
  { rule: 'longHaul', trick: 'THRONE' },
  { rule: 'rareGems', trick: 'JACKET' },
  { rule: 'consonantChaos', trick: 'CRYPT' },
  { rule: 'comboFrenzy', trick: 'BREEZE' },
  { rule: 'classic', trick: 'SILVER' },
  { rule: 'vowelRush', trick: 'IODINE' },
  { rule: 'featherweight', trick: 'PEBBLE' },
  { rule: 'longHaul', trick: 'ORCHID' },
  { rule: 'rareGems', trick: 'ZENITH' },
  { rule: 'consonantChaos', trick: 'STRING' },
  { rule: 'comboFrenzy', trick: 'RIPPLE' },
  { rule: 'classic', trick: 'SUNSET' },
  { rule: 'vowelRush', trick: 'AUTUMN' },
  { rule: 'featherweight', trick: 'TEMPLE' },
  { rule: 'longHaul', trick: 'VELVET' },
  { rule: 'rareGems', trick: 'QUARTZ' },
  { rule: 'consonantChaos', trick: 'BRANCH' },
  { rule: 'comboFrenzy', trick: 'ANCHOR' },
  { rule: 'classic', trick: 'BADGER' },
  { rule: 'vowelRush', trick: 'OCEANS' },
  { rule: 'featherweight', trick: 'COPPER' },
  { rule: 'longHaul', trick: 'HELMET' },
  { rule: 'rareGems', trick: 'JIGSAW' },
  { rule: 'consonantChaos', trick: 'MYSTIC' },
  { rule: 'comboFrenzy', trick: 'NECTAR' },
  { rule: 'classic', trick: 'OYSTER' },
  { rule: 'vowelRush', trick: 'PICKLE' },
  { rule: 'longHaul', trick: 'SADDLE' },
  { rule: 'featherweight', trick: 'TURTLE' },
  { rule: 'rareGems', trick: 'JOCKEY' },
  { rule: 'consonantChaos', trick: 'FROSTY' },
  { rule: 'comboFrenzy', trick: 'VIOLET' },
  { rule: 'classic', trick: 'WALRUS' },
];

/**
 * Derive the full, deterministic configuration for a given day from the
 * 50-day schedule. Same date -> identical rule + Trick Word for everyone.
 */
export const getDaily = (dateKey: string = dateKeyUTC()): DailyConfig => {
  const seed = hashString(`WORDFALL::${dateKey}`);
  const dayNumber = dayNumberFor(dateKey);
  const idx = (((dayNumber - 1) % DAY_SCHEDULE.length) + DAY_SCHEDULE.length) % DAY_SCHEDULE.length;
  const spec = DAY_SCHEDULE[idx]!;

  const rule = RULES[spec.rule];
  const trickWord = spec.trick.toLowerCase();
  const trickScramble = scramble(trickWord, seed);
  const consonants = 'BCDFGHJKLMNPRSTVWY';
  const hotLetter = consonants[dayNumber % consonants.length]!;

  return {
    date: dateKey,
    dayNumber,
    seed,
    rule,
    hazardRate: 0.1,
    bonusRate: 0.08,
    trickWord,
    trickScramble,
    durationSec: 120,
    startHearts: 3,
    startBacks: 5,
    startClears: 5,
    hotLetter,
  };
};

/* ------------------------------------------------------------------ *
 *  Falling-object stream
 * ------------------------------------------------------------------ */

export type BonusType = 'heart' | 'time' | 'back' | 'clear' | 'gem';

export type Spawn =
  | { kind: 'letter'; letter: string; isTrick: boolean }
  | { kind: 'hazard' }
  | { kind: 'bonus'; bonus: BonusType };

/** English text-frequency distribution, scaled and smoothed for playability. */
const LETTER_DIST: Record<string, number> = {
  E: 25,
  T: 18,
  A: 16,
  O: 15,
  I: 14,
  N: 13,
  S: 13,
  H: 12,
  R: 12,
  D: 9,
  L: 8,
  C: 6,
  U: 6,
  M: 5,
  W: 5,
  F: 4,
  G: 4,
  P: 4,
  Y: 4,
  B: 3,
  K: 2,
  V: 2,
  J: 1,
  Q: 1,
  X: 1,
  Z: 1,
};

const LETTERS = Object.keys(LETTER_DIST);
const LETTER_TOTAL = Object.values(LETTER_DIST).reduce((sum, n) => sum + n, 0);
const BONUS_BAG: BonusType[] = ['time', 'time', 'heart', 'back', 'back', 'clear', 'gem'];

const RECENT_LETTER_WINDOW = 8;
const LETTER_DECK_SIZE = 64;
const MIN_RARE_PER_DECK = 2;
const RARE_LETTERS = 'JQXZK';
const RARE_FLOOR_GAP = 34;
const TRICK_FLOOR_EVERY_LETTERS = 8;
const isVowelLetter = (ch: string): boolean => 'AEIOU'.includes(ch.toUpperCase());

const isRareLetter = (ch: string): boolean => RARE_LETTERS.includes(ch.toUpperCase());

const COMMON_BIGRAMS: Record<string, number> = {
  ER: 116,
  IN: 111,
  RE: 101,
  ES: 88,
  TE: 87,
  ST: 87,
  AL: 76,
  AR: 74,
  OR: 72,
  NG: 68,
  EN: 67,
  EA: 65,
  LE: 65,
  SE: 63,
  ON: 63,
  AN: 58,
  TH: 57,
  NT: 55,
  AT: 53,
  CE: 50,
  DE: 48,
  CO: 45,
  OU: 44,
  VE: 44,
  MA: 44,
  IT: 43,
  HO: 43,
  ME: 42,
  TI: 42,
  ED: 42,
  LL: 40,
  AS: 40,
  HE: 39,
  EL: 39,
  IC: 38,
  LA: 38,
  CH: 37,
  LI: 37,
  NE: 36,
  TA: 36,
  ND: 36,
  RO: 35,
  UR: 35,
  RI: 35,
  RA: 35,
  ET: 35,
  LO: 35,
  IL: 34,
  EE: 34,
  TO: 34,
  GE: 33,
  RT: 33,
  PA: 32,
  AC: 32,
  RS: 30,
  OW: 30,
  CA: 30,
  HI: 29,
  SI: 29,
  MO: 28,
  IE: 28,
  FI: 28,
  US: 28,
  OO: 28,
  HA: 27,
  OM: 27,
  OT: 27,
  TS: 27,
  EC: 27,
  IO: 27,
  IS: 26,
  CT: 26,
  PL: 25,
  SS: 25,
  UN: 25,
  VI: 24,
  WE: 24,
  OL: 24,
  PR: 23,
  PO: 23,
};

const COMMON_TRIGRAMS: Record<string, number> = {
  ING: 53,
  ENT: 29,
  ATE: 21,
  TER: 21,
  ION: 20,
  ERS: 19,
  ALL: 19,
  THE: 18,
  REA: 17,
  HER: 16,
  ICE: 15,
  VER: 15,
  EST: 15,
  ART: 15,
  AGE: 14,
  STA: 14,
  EAR: 13,
  ORT: 13,
  FOR: 13,
  ECT: 13,
  EVE: 13,
  AND: 13,
  STE: 12,
  EAS: 12,
  COM: 12,
  TOR: 12,
  OUN: 12,
  IVE: 12,
  OUR: 11,
  ITE: 11,
  OST: 11,
  LEA: 11,
  ESS: 11,
  IDE: 11,
  EAD: 11,
  TED: 11,
  RES: 11,
  TES: 11,
  ARE: 11,
  TIO: 11,
  TIN: 11,
  TUR: 11,
  OME: 10,
  REE: 10,
  HAN: 10,
  PRI: 10,
  IGH: 10,
  PAR: 10,
  COU: 10,
  OTE: 10,
  STO: 10,
  PLA: 10,
  ARD: 10,
  LOW: 10,
  URE: 10,
  INE: 9,
  AME: 9,
  WOR: 9,
  USE: 9,
  AST: 9,
  SHO: 9,
  PRO: 9,
  ELL: 9,
  UND: 9,
  EAT: 9,
  HIN: 9,
  ONE: 9,
  TAL: 9,
  NCE: 9,
  CHA: 9,
  PER: 9,
  ORE: 8,
  ONT: 8,
  ACT: 8,
  IND: 8,
  PLE: 8,
  IST: 8,
  OVE: 8,
  HOU: 8,
  ASE: 8,
};

type RandomSource = {
  next: () => number;
  int: (minInclusive: number, maxExclusive: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
};

const makeRandomSource = (): RandomSource => ({
  next: () => Math.random(),
  int: (min, max) => min + Math.floor(Math.random() * (max - min)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)]!,
  chance: (p) => Math.random() < p,
});

type LetterSource = {
  candidate: (predicate?: (letter: string) => boolean) => string;
  commit: (letter: string) => void;
};

const shuffleLetters = (items: readonly string[], rng: RandomSource): string[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
};

const makeRoundedDeck = (): string[] => {
  const rows = Object.entries(LETTER_DIST).map(([letter, weight]) => {
    const exact = (weight / LETTER_TOTAL) * LETTER_DECK_SIZE;
    const count = Math.floor(exact);
    return { letter, count, remainder: exact - count };
  });

  let used = rows.reduce((sum, row) => sum + row.count, 0);
  for (const row of rows.sort((a, b) => b.remainder - a.remainder)) {
    if (used >= LETTER_DECK_SIZE) break;
    row.count += 1;
    used += 1;
  }

  const rareCount = rows.filter((row) => isRareLetter(row.letter)).reduce((sum, row) => sum + row.count, 0);
  if (rareCount < MIN_RARE_PER_DECK) {
    const rare = rows.find((row) => row.letter === 'K');
    const donor = rows
      .filter((row) => !isRareLetter(row.letter) && row.count > 1)
      .sort((a, b) => b.count - a.count)[0];
    if (rare && donor) {
      rare.count += 1;
      donor.count -= 1;
    }
  }

  return rows.flatMap((row) => Array.from({ length: row.count }, () => row.letter));
};

const makeLetterSource = (rng: RandomSource): LetterSource => {
  const baseDeck = makeRoundedDeck();
  let deck = shuffleLetters(baseDeck, rng);

  const refill = (): void => {
    deck = shuffleLetters(baseDeck, rng);
  };

  return {
    candidate(predicate = () => true): string {
      if (deck.length === 0) refill();
      const matching = deck.filter(predicate);
      if (matching.length > 0) return matching[rng.int(0, matching.length)]!;
      return LETTERS.find(predicate) ?? deck[0] ?? 'E';
    },
    commit(letter: string): void {
      const index = deck.indexOf(letter);
      if (index >= 0) deck.splice(index, 1);
      if (deck.length === 0) refill();
    },
  };
};

const repeatsTooSoon = (letter: string, recent: readonly string[]): boolean => {
  if (recent[recent.length - 1] === letter) return true;
  const recentSix = recent.slice(-6);
  return recentSix.filter((ch) => ch === letter).length >= 2;
};

const extendsLetterClassRun = (letter: string, recent: readonly string[]): boolean => {
  const tail = recent.slice(-3);
  if (tail.length < 3) return false;
  const wantVowel = isVowelLetter(letter);
  return tail.every((ch) => isVowelLetter(ch) === wantVowel);
};

const safeLetter = (letter: string, recent: readonly string[]): boolean =>
  !extendsLetterClassRun(letter, recent) && !repeatsTooSoon(letter, recent);

const ngramScore = (letter: string, recent: readonly string[]): number => {
  const prev = recent[recent.length - 1] ?? '';
  const prev2 = recent[recent.length - 2] ?? '';
  const bigram = prev ? `${prev}${letter}` : '';
  const trigram = prev2 && prev ? `${prev2}${prev}${letter}` : '';
  return Math.log1p(COMMON_BIGRAMS[bigram] ?? 0) * 1.8 + Math.log1p(COMMON_TRIGRAMS[trigram] ?? 0) * 3.2;
};

const pickSmoothedLetter = (source: LetterSource, recent: readonly string[], rng: RandomSource): string => {
  let best = '';
  let bestScore = -Infinity;
  for (let i = 0; i < 18; i++) {
    const letter = source.candidate();
    if (!safeLetter(letter, recent)) continue;
    const score = ngramScore(letter, recent) + rng.next() * 0.35;
    if (score > bestScore) {
      best = letter;
      bestScore = score;
    }
  }
  if (best) {
    source.commit(best);
    return best;
  }

  let classSafe = '';
  let repeatSafe = '';
  let fallback = '';
  for (let i = 0; i < 24; i++) {
    const letter = source.candidate();
    fallback = fallback || letter;
    const classBad = extendsLetterClassRun(letter, recent);
    const repeatBad = repeatsTooSoon(letter, recent);
    if (!classBad && !repeatBad) {
      source.commit(letter);
      return letter;
    }
    if (!classBad && !classSafe) classSafe = letter;
    if (!repeatBad && !repeatSafe) repeatSafe = letter;
  }
  const chosen = classSafe || repeatSafe || fallback || source.candidate();
  source.commit(chosen);
  return chosen;
};

const forceRareLetter = (recent: readonly string[], rng: RandomSource): string => {
  const rareBag = 'KKJQXZ';
  for (let i = 0; i < 12; i++) {
    const letter = rareBag[rng.int(0, rareBag.length)]!;
    if (safeLetter(letter, recent)) return letter;
  }
  return '';
};

/**
 * A fresh spawn generator for each play. The client pulls the next spawn on
 * each spawn tick; positions and timing are the client's concern, while the
 * sequence is shaped by deck/floor/word-likeness guards.
 *
 * The day's Trick Word letters are woven through the stream so it is always
 * possible to spell — rewarding players who solved the anagram.
 */
export const makeSpawner = (config: DailyConfig): { next: () => Spawn } => {
  const rng = makeRandomSource();
  const source = makeLetterSource(rng);
  const trick = config.trickWord.toUpperCase();
  let trickIdx = 0;
  let trickMarked = 0;
  let letterCount = 0;
  let lettersSinceRare = 0;
  const recentLetters: string[] = [];

  const letterSpawn = (letter: string, isTrick: boolean): Spawn => {
    letterCount += 1;
    lettersSinceRare = isRareLetter(letter) ? 0 : lettersSinceRare + 1;
    if (isTrick) trickMarked += 1;
    recentLetters.push(letter);
    if (recentLetters.length > RECENT_LETTER_WINDOW) recentLetters.shift();
    return { kind: 'letter', letter, isTrick };
  };

  const next = (): Spawn => {
    const roll = rng.next();
    if (roll < config.hazardRate) return { kind: 'hazard' };
    if (roll < config.hazardRate + config.bonusRate) {
      return { kind: 'bonus', bonus: rng.pick(BONUS_BAG) };
    }

    const trickLetter = trick[trickIdx % trick.length]!;
    const trickQuota = Math.floor((letterCount + 1) / TRICK_FLOOR_EVERY_LETTERS);
    if (trickMarked < trickQuota && safeLetter(trickLetter, recentLetters)) {
      trickIdx++;
      return letterSpawn(trickLetter, true);
    }

    // Sprinkle the next-needed trick letter fairly often so the word stays catchable.
    if (rng.chance(0.14) && safeLetter(trickLetter, recentLetters)) {
      trickIdx++;
      return letterSpawn(trickLetter, true);
    }

    if (lettersSinceRare >= RARE_FLOOR_GAP) {
      const rare = forceRareLetter(recentLetters, rng);
      if (rare) return letterSpawn(rare, false);
    }

    return letterSpawn(pickSmoothedLetter(source, recentLetters, rng), false);
  };

  return { next };
};

/** Vowel test used by scoring rules and UI. */
export const isVowel = (ch: string): boolean => isVowelLetter(ch);
