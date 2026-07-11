/** Scoring rules shared by client (live feedback) and server (validation). */

import type { DailyRule } from './types';
import { isVowel } from './daily';

/** Standard Scrabble letter values — gives rare letters real weight. */
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const RARE_LETTERS = 'JQXZK';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const letterValue = (ch: string): number => LETTER_VALUES[ch.toUpperCase()] ?? 1;

/** Bonus that makes short words worthwhile and longer words feel meaningfully better. */
const lengthBonus = (length: number): number => {
  if (length <= 2) return 0;
  if (length === 3) return 6;
  if (length === 4) return 12;
  if (length === 5) return 22;
  if (length === 6) return 36;
  if (length === 7) return 54;
  return 76 + (length - 8) * 24;
};

/** Raw value of a word: rare letters matter, then length gives the word its heft. */
export const wordBaseValue = (word: string): number => {
  const w = word.toUpperCase();
  let sum = 0;
  for (const ch of w) sum += letterValue(ch);
  return sum * 4 + lengthBonus(w.length);
};

/** Multiplier from a consecutive-valid-word combo streak (caps at 1.6x). */
export const comboMultiplier = (streak: number): number => {
  const capped = clamp(streak, 0, 12);
  return Math.round((1 + capped * 0.05) * 100) / 100;
};

/** Small capped daily-streak boost: rewarding consistency without locking out new players. */
export const dailyStreakMultiplier = (streak: number): number => {
  const capped = clamp(streak, 0, 10);
  return Math.round((1 + capped * 0.015) * 1000) / 1000;
};

export type WordScore = {
  points: number;
  multiplier: number;
  dailyMultiplier: number;
  base: number;
  tags: string[]; // human-readable bonus labels for juicy feedback
  isTrick: boolean;
};

export type ScoreOptions = {
  rule: DailyRule;
  comboStreak: number; // number of valid words already chained (before this one)
  dailyStreak: number;
  isTrick: boolean;
};

/** Apply the active daily rule to a word's base value, collecting feedback tags. */
const applyRule = (word: string, base: number, rule: DailyRule, tags: string[]): number => {
  const w = word.toUpperCase();
  switch (rule.id) {
    case 'vowelRush': {
      let vBonus = 0;
      for (const ch of w) if (isVowel(ch)) vBonus += letterValue(ch);
      if (vBonus > 0) tags.push('Vowels +');
      return base + vBonus * 3;
    }
    case 'consonantChaos': {
      let cBonus = 0;
      for (const ch of w) if (!isVowel(ch)) cBonus += letterValue(ch);
      if (cBonus > 0) tags.push('Consonants +');
      return base + cBonus * 2;
    }
    case 'longHaul': {
      if (w.length >= 6) {
        tags.push('Long Haul x1.5');
        return Math.round(base * 1.5);
      }
      return base;
    }
    case 'featherweight': {
      if (w.length <= 4) {
        tags.push('Featherweight x1.35');
        return Math.round(base * 1.35);
      }
      return base;
    }
    case 'rareGems': {
      if ([...w].some((c) => RARE_LETTERS.includes(c))) {
        tags.push('Rare Gem +35');
        return base + 35;
      }
      return base;
    }
    case 'comboFrenzy':
    case 'classic':
    default:
      return base;
  }
};

const trickWordBonus = (ruleBase: number): number => clamp(Math.round(ruleBase * 0.6), 30, 70);

/** Score a single valid word given the day's rule and the player's combo state. */
export const scoreWord = (word: string, opts: ScoreOptions): WordScore => {
  const tags: string[] = [];
  const base = wordBaseValue(word);
  const ruleBase = applyRule(word, base, opts.rule, tags);
  const multiplier = comboMultiplier(opts.comboStreak);
  const dailyMultiplier = dailyStreakMultiplier(opts.dailyStreak);
  if (multiplier > 1) tags.push(`Combo x${multiplier.toFixed(1)}`);
  if (dailyMultiplier > 1) tags.push(`Streak x${dailyMultiplier.toFixed(2)}`);
  let points = Math.round(ruleBase * multiplier * dailyMultiplier);
  if (opts.isTrick) {
    const bonus = trickWordBonus(ruleBase);
    points += bonus;
    tags.push(`TRICK WORD +${bonus}`);
  }
  return { points, multiplier, dailyMultiplier, base, tags, isTrick: opts.isTrick };
};

/** Gentle penalty for an invalid submission — failure should feel fixable. */
export const invalidPenalty = (word: string): number => (word.length >= 3 ? -2 : 0);

/** How the combo streak evolves after a submission. */
export const nextCombo = (streak: number, valid: boolean, rule: DailyRule): number => {
  if (valid) return streak + (rule.id === 'comboFrenzy' ? 2 : 1);
  // Combo Frenzy softens the fall instead of a hard reset.
  return rule.id === 'comboFrenzy' ? Math.floor(streak / 2) : 0;
};
