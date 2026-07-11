/**
 * Redis-backed persistence for WordFall: per-day leaderboards, trick-word
 * finders, player profiles/streaks, and post<->date mapping.
 *
 * Leaderboards are Redis sorted sets keyed by the challenge date so any day's
 * post keeps its own board. Streaks advance on the challenge date being played.
 */

import { redis, reddit } from '@devvit/web/server';
import { addDaysUTC, dateKeyUTC } from '../../shared/daily';
import type {
  Leaderboards,
  LeaderboardEntry,
  Profile,
  RunResult,
} from '../../shared/types';

const NS = 'wf';
const DAY_TTL = 60 * 60 * 24 * 120; // keep daily boards ~120 days

const kScore = (date: string) => `${NS}:lb:score:${date}`;
const kLong = (date: string) => `${NS}:lb:long:${date}`;
const kLongWord = (date: string) => `${NS}:lb:longword:${date}`; // hash user->word
const kBestWord = (date: string) => `${NS}:lb:bestword:${date}`; // hash user->"word:score"
const kTrick = (date: string) => `${NS}:trick:${date}`;
const kProfile = (user: string) => `${NS}:profile:${user}`;
const kProcessedRun = (user: string, runId: string) => `${NS}:run:${user}:${runId}`;
const kPostDate = (postId: string) => `${NS}:postdate:${postId}`;
const kDatePost = (date: string) => `${NS}:datepost:${date}`;
const kAllScore = `${NS}:lb:alltime:score`;
const kAllLong = `${NS}:lb:alltime:long`;
const kAllLongWord = `${NS}:lb:alltime:longword`;
const RUN_TTL = 60 * 60 * 24 * 30;

/* --------------------------- post <-> date --------------------------- */

export const setPostDate = async (postId: string, date: string): Promise<void> => {
  await Promise.all([
    redis.set(kPostDate(postId), date),
    redis.set(kDatePost(date), postId),
  ]);
};

export const getPostDate = async (postId: string | undefined): Promise<string> => {
  if (!postId) return dateKeyUTC();
  const d = await redis.get(kPostDate(postId));
  return d ?? dateKeyUTC();
};

export const getPostIdForDate = async (date: string): Promise<string | undefined> =>
  (await redis.get(kDatePost(date))) ?? undefined;

/** Find the first challenge date that does not already have a post. */
export const getNextUnpostedDate = async (start: string = dateKeyUTC()): Promise<string> => {
  for (let i = 0; i < 365; i++) {
    const date = addDaysUTC(start, i);
    if (!(await getPostIdForDate(date))) return date;
  }
  return addDaysUTC(start, 365);
};

/* ----------------------------- post number --------------------------- */

const kPostSeq = `${NS}:postseq`;
const kPostNum = (date: string) => `${NS}:postnum:${date}`;

/** Assign (once) and return this date's sequential post number (#1, #2, ...). */
export const nextPostNumber = async (date: string): Promise<number> => {
  const existing = await redis.get(kPostNum(date));
  if (existing) return Number(existing);
  const n = await redis.incrBy(kPostSeq, 1);
  await redis.set(kPostNum(date), String(n));
  return n;
};

/** Read this date's sequential post number, or 0 if none has been assigned. */
export const getPostNumber = async (date: string): Promise<number> => {
  const n = await redis.get(kPostNum(date));
  return n ? Number(n) : 0;
};

/* ----------------------------- profiles ------------------------------ */

const emptyProfile = (username: string): Profile => ({
  username,
  streak: 0,
  bestStreak: 0,
  daysPlayed: 0,
  lifetimeScore: 0,
  lifetimeWords: 0,
  longestWordEver: '',
  playedToday: false,
  bestTodayScore: 0,
});

const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay!, (am ?? 1) - 1, ad ?? 1);
  const tb = Date.UTC(by!, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((tb - ta) / 86400000);
};

const parseProfile = (username: string, h: Record<string, string>, date: string = dateKeyUTC()): Profile => {
  const lastDate = h.lastDate ?? '';
  const activeStreak = lastDate === date || (lastDate !== '' && daysBetween(lastDate, date) === 1);
  return {
    username,
    streak: activeStreak ? Number(h.streak ?? '0') : 0,
    bestStreak: Number(h.bestStreak ?? '0'),
    daysPlayed: Number(h.daysPlayed ?? '0'),
    lifetimeScore: Number(h.lifetimeScore ?? '0'),
    lifetimeWords: Number(h.lifetimeWords ?? '0'),
    longestWordEver: h.longestWordEver ?? '',
    playedToday: lastDate === date,
    bestTodayScore: lastDate === date ? Number(h.bestTodayScore ?? '0') : 0,
  };
};

export const getProfile = async (username: string, date: string = dateKeyUTC()): Promise<Profile> => {
  if (!username || username === 'anonymous') return emptyProfile(username || 'guest');
  const h = await redis.hGetAll(kProfile(username));
  if (!h || Object.keys(h).length === 0) return emptyProfile(username);
  return parseProfile(username, h, date);
};

/** Advance the player's profile after a run. Streaks follow the challenge date being played. */
export const updateProfile = async (
  username: string,
  result: RunResult,
  date: string = dateKeyUTC()
): Promise<Profile> => {
  const key = kProfile(username);
  const h = await redis.hGetAll(key);
  const prev = h && Object.keys(h).length > 0 ? parseProfileRaw(h) : null;

  let streak = prev?.streak ?? 0;
  let bestStreak = prev?.bestStreak ?? 0;
  let daysPlayed = prev?.daysPlayed ?? 0;
  let bestTodayScore: number;
  const lastDate = prev?.lastDate ?? '';

  const firstPlayToday = lastDate !== date;
  if (firstPlayToday) {
    const gap = lastDate ? daysBetween(lastDate, date) : 999;
    streak = gap === 1 ? streak + 1 : 1;
    daysPlayed += 1;
    bestTodayScore = result.score;
  } else {
    bestTodayScore = Math.max(prev?.bestTodayScore ?? 0, result.score);
  }
  bestStreak = Math.max(bestStreak, streak);

  const lifetimeScore = (prev?.lifetimeScore ?? 0) + Math.max(0, result.score);
  const lifetimeWords = (prev?.lifetimeWords ?? 0) + Math.max(0, result.wordsFound);
  const longestWordEver =
    result.longestWord.length > (prev?.longestWordEver ?? '').length
      ? result.longestWord
      : prev?.longestWordEver ?? '';

  await redis.hSet(key, {
    streak: String(streak),
    bestStreak: String(bestStreak),
    daysPlayed: String(daysPlayed),
    lifetimeScore: String(lifetimeScore),
    lifetimeWords: String(lifetimeWords),
    longestWordEver,
    lastDate: date,
    bestTodayScore: String(bestTodayScore),
  });

  return {
    username,
    streak,
    bestStreak,
    daysPlayed,
    lifetimeScore,
    lifetimeWords,
    longestWordEver,
    playedToday: true,
    bestTodayScore,
  };
};

type RawProfile = {
  streak: number;
  bestStreak: number;
  daysPlayed: number;
  lifetimeScore: number;
  lifetimeWords: number;
  longestWordEver: string;
  lastDate: string;
  bestTodayScore: number;
};

const parseProfileRaw = (h: Record<string, string>): RawProfile => ({
  streak: Number(h.streak ?? '0'),
  bestStreak: Number(h.bestStreak ?? '0'),
  daysPlayed: Number(h.daysPlayed ?? '0'),
  lifetimeScore: Number(h.lifetimeScore ?? '0'),
  lifetimeWords: Number(h.lifetimeWords ?? '0'),
  longestWordEver: h.longestWordEver ?? '',
  lastDate: h.lastDate ?? '',
  bestTodayScore: Number(h.bestTodayScore ?? '0'),
});

/* --------------------------- leaderboards ---------------------------- */

/** Record a run into the day's boards (keeps each user's personal best). */
export const recordRun = async (
  date: string,
  username: string,
  result: RunResult
): Promise<void> => {
  if (!username || username === 'anonymous') return;

  // Best daily score (only improve).
  const prevScore = await redis.zScore(kScore(date), username);
  if (prevScore === undefined || result.score > prevScore) {
    await redis.zAdd(kScore(date), { member: username, score: result.score });
  }
  const prevAll = await redis.zScore(kAllScore, username);
  if (prevAll === undefined || result.score > prevAll) {
    await redis.zAdd(kAllScore, { member: username, score: result.score });
  }

  // Longest word (only improve), storing the word itself in a hash.
  const len = result.longestWord.length;
  if (len >= 3) {
    const prevLen = await redis.zScore(kLong(date), username);
    if (prevLen === undefined || len > prevLen) {
      await redis.zAdd(kLong(date), { member: username, score: len });
      await redis.hSet(kLongWord(date), { [username]: result.longestWord });
    }
    const prevAllLen = await redis.zScore(kAllLong, username);
    if (prevAllLen === undefined || len > prevAllLen) {
      await redis.zAdd(kAllLong, { member: username, score: len });
      await redis.hSet(kAllLongWord, { [username]: result.longestWord });
    }
  }

  // Best single word (store "word:score" for flavor on the board). Keep the best only.
  if (result.bestWord && result.bestWordScore > 0) {
    const prevBest = await redis.hGet(kBestWord(date), username);
    const prevBestScore = prevBest ? Number(prevBest.split(':')[1] ?? '0') : 0;
    if (result.bestWordScore > prevBestScore) {
      await redis.hSet(kBestWord(date), {
        [username]: `${result.bestWord}:${result.bestWordScore}`,
      });
    }
  }

  if (result.foundTrick) {
    await redis.zAdd(kTrick(date), { member: username, score: Date.now() });
  }

  await Promise.all([
    redis.expire(kScore(date), DAY_TTL),
    redis.expire(kLong(date), DAY_TTL),
    redis.expire(kLongWord(date), DAY_TTL),
    redis.expire(kBestWord(date), DAY_TTL),
    redis.expire(kTrick(date), DAY_TTL),
  ]);
};

const rankFor = async (key: string, username: string): Promise<number> => {
  if (!username || username === 'anonymous') return 0;
  const [asc, card] = await Promise.all([
    redis.zRank(key, username),
    redis.zCard(key),
  ]);
  if (asc === undefined) return 0;
  return card - asc; // 1-based descending rank
};

export const getScoreRank = (date: string, username: string): Promise<number> =>
  rankFor(kScore(date), username);
export const getLongRank = (date: string, username: string): Promise<number> =>
  rankFor(kLong(date), username);

export const getTotalPlayers = (date: string): Promise<number> =>
  redis.zCard(kScore(date));
export const getTrickFinders = (date: string): Promise<number> =>
  redis.zCard(kTrick(date));

/** Fraction of players you beat today, 0..100. */
export const getPercentile = async (date: string, username: string): Promise<number> => {
  const total = await redis.zCard(kScore(date));
  if (total <= 1) return 100;
  const asc = await redis.zRank(kScore(date), username);
  if (asc === undefined) return 0;
  return Math.round((asc / (total - 1)) * 100);
};

export const getLeaderboards = async (
  date: string,
  username: string,
  count = 10
): Promise<Leaderboards> => {
  const [scoreRows, longRows, longWords] = await Promise.all([
    redis.zRange(kScore(date), 0, count - 1, { reverse: true, by: 'rank' }),
    redis.zRange(kLong(date), 0, count - 1, { reverse: true, by: 'rank' }),
    redis.hGetAll(kLongWord(date)),
  ]);

  const topScore: LeaderboardEntry[] = scoreRows.map((r, i) => ({
    rank: i + 1,
    username: r.member,
    score: r.score,
    detail: 'points',
    isYou: r.member === username,
  }));

  const longestWord: LeaderboardEntry[] = longRows.map((r, i) => ({
    rank: i + 1,
    username: r.member,
    score: r.score,
    detail: (longWords?.[r.member] ?? '').toUpperCase(),
    isYou: r.member === username,
  }));

  return { topScore, longestWord };
};

export const getUsername = async (): Promise<string> => {
  try {
    return (await reddit.getCurrentUsername()) ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
};

export const hasProcessedRun = async (username: string, runId: string): Promise<boolean> => {
  if (!username || !runId) return false;
  return (await redis.get(kProcessedRun(username, runId))) === '1';
};

export const markProcessedRun = async (username: string, runId: string): Promise<void> => {
  if (!username || !runId) return;
  const key = kProcessedRun(username, runId);
  await redis.set(key, '1');
  await redis.expire(key, RUN_TTL);
};
