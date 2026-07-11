/**
 * Pragmatic server-side validation of submitted runs.
 *
 * The client dictionary is authoritative for live gameplay; here we clamp
 * values to plausible bounds so the shared leaderboards can't be trivially
 * poisoned by a crafted request. (Full replay validation is out of scope.)
 */

import type { RunResult } from '../../shared/types';

const WORD_RE = /^[a-z]{3,15}$/;
const RUN_ID_RE = /^[a-z0-9-]{8,80}$/i;
const SCORE_CAP = 30000; // very generous ceiling for a daily run
const WORDS_CAP = 600;
const BEST_WORD_CAP = 3000;

const cleanWord = (w: unknown): string => {
  if (typeof w !== 'string') return '';
  const s = w.toLowerCase().trim();
  return WORD_RE.test(s) ? s : '';
};

const clampInt = (n: unknown, min: number, max: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(min, Math.min(max, v));
};

const cleanRunId = (id: unknown): string => {
  if (typeof id !== 'string') return '';
  const s = id.trim();
  return RUN_ID_RE.test(s) ? s : '';
};

/** Sanitize an untrusted RunResult body into a safe, bounded RunResult. */
export const sanitizeRun = (date: string, body: unknown): RunResult => {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    id: cleanRunId(b.id),
    date,
    score: clampInt(b.score, -50, SCORE_CAP),
    longestWord: cleanWord(b.longestWord),
    wordsFound: clampInt(b.wordsFound, 0, WORDS_CAP),
    foundTrick: b.foundTrick === true,
    bestWord: cleanWord(b.bestWord),
    bestWordScore: clampInt(b.bestWordScore, 0, BEST_WORD_CAP),
  };
};
