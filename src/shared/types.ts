/** Shared type definitions for WordFall (client <-> server). */

/** Identifier for the rotating daily rule mutator. */
export type DailyRuleId =
  | 'classic'
  | 'vowelRush'
  | 'longHaul'
  | 'consonantChaos'
  | 'rareGems'
  | 'featherweight'
  | 'comboFrenzy';

export type DailyRule = {
  id: DailyRuleId;
  name: string;
  blurb: string;
  tip: string;
};

/**
 * The fully deterministic definition of a single day's challenge.
 * Computed purely from the date string by both client and server.
 */
export type DailyConfig = {
  date: string; // YYYY-MM-DD (UTC)
  dayNumber: number; // days since the WordFall launch epoch
  seed: number;
  rule: DailyRule;
  hazardRate: number; // fraction of spawns that are hazards
  bonusRate: number; // fraction of spawns that are power-ups
  trickWord: string; // the hidden target word (kept client-side for detection)
  trickScramble: string; // shuffled letters shown as the public puzzle hint
  durationSec: number;
  startHearts: number;
  startBacks: number;
  startClears: number;
  hotLetter: string; // a spotlighted letter for flavor / some rules
};

/** A single run's result submitted by the client. */
export type RunResult = {
  id: string;
  date: string;
  score: number;
  longestWord: string;
  wordsFound: number;
  foundTrick: boolean;
  bestWord: string; // highest-scoring single word this run
  bestWordScore: number;
};

/** Public leaderboard entry. */
export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  detail: string; // e.g. longest word, or best word
  isYou: boolean;
};

export type Leaderboards = {
  topScore: LeaderboardEntry[];
  longestWord: LeaderboardEntry[];
};

/** Per-user persistent profile. */
export type Profile = {
  username: string;
  streak: number;
  bestStreak: number;
  daysPlayed: number;
  lifetimeScore: number;
  lifetimeWords: number;
  longestWordEver: string;
  playedToday: boolean;
  bestTodayScore: number;
};

/** Server response for the daily hub (safe subset — no trick answer). */
export type DailyResponse = {
  date: string;
  dayNumber: number;
  rule: DailyRule;
  trickScramble: string;
  trickLength: number;
  trickFinders: number; // how many players cracked it today
  totalPlayers: number;
  profile: Profile;
  leaderboards: Leaderboards;
};

/** Server response after submitting a run. */
export type SubmitResponse = {
  accepted: boolean;
  scoreRank: number;
  longestRank: number;
  profile: Profile;
  leaderboards: Leaderboards;
  trickFinders: number;
  totalPlayers: number;
  percentile: number; // 0..100, share of players you beat today
};

export type ShareResponse = {
  ok: boolean;
  url?: string;
  message?: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
