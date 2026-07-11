/**
 * Backend adapter. Talks to the Devvit server under /api, and transparently
 * falls back to a local, deterministic mock when no server is reachable
 * (standalone preview or offline) so the game is always playable.
 */
import { dateKeyUTC, getDaily } from '../shared/daily';
import type {
  DailyResponse,
  Leaderboards,
  LeaderboardEntry,
  Profile,
  RunResult,
  ShareResponse,
  SubmitResponse,
} from '../shared/types';
import { getContextUsername } from './devvit';

let useMock = false;

const MOCK_KEY = 'wf:mock:v1';
const PENDING_KEY = 'wf:pendingRuns:v1';

type MockStore = {
  profile: Profile;
  lastDate: string;
  bestByDate: Record<string, number>;
  longByDate: Record<string, string>;
};

const defaultProfile = (username: string): Profile => ({
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

const numberProp = (obj: object, key: string, fallback = 0): number => {
  const value = Reflect.get(obj, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const stringProp = (obj: object, key: string, fallback = ''): string => {
  const value = Reflect.get(obj, key);
  return typeof value === 'string' ? value : fallback;
};

const booleanProp = (obj: object, key: string, fallback = false): boolean => {
  const value = Reflect.get(obj, key);
  return typeof value === 'boolean' ? value : fallback;
};

const numberRecord = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [key, n] of Object.entries(value)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = n;
  }
  return out;
};

const stringRecord = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [key, s] of Object.entries(value)) {
    if (typeof s === 'string') out[key] = s;
  }
  return out;
};

const profileFrom = (value: unknown, username: string): Profile => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaultProfile(username);
  return {
    username: stringProp(value, 'username', username),
    streak: numberProp(value, 'streak'),
    bestStreak: numberProp(value, 'bestStreak'),
    daysPlayed: numberProp(value, 'daysPlayed'),
    lifetimeScore: numberProp(value, 'lifetimeScore'),
    lifetimeWords: numberProp(value, 'lifetimeWords'),
    longestWordEver: stringProp(value, 'longestWordEver'),
    playedToday: booleanProp(value, 'playedToday'),
    bestTodayScore: numberProp(value, 'bestTodayScore'),
  };
};

const runFrom = (value: unknown): RunResult | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const id = stringProp(value, 'id');
  const date = stringProp(value, 'date');
  if (!id || !date) return null;
  return {
    id,
    date,
    score: numberProp(value, 'score'),
    longestWord: stringProp(value, 'longestWord'),
    wordsFound: numberProp(value, 'wordsFound'),
    foundTrick: booleanProp(value, 'foundTrick'),
    bestWord: stringProp(value, 'bestWord'),
    bestWordScore: numberProp(value, 'bestWordScore'),
  };
};

const readPendingRuns = (): RunResult[] => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const runs: RunResult[] = [];
    for (const item of parsed) {
      const run = runFrom(item);
      if (run) runs.push(run);
    }
    return runs;
  } catch {
    return [];
  }
};

const writePendingRuns = (runs: readonly RunResult[]): void => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(runs.slice(-12)));
  } catch {
    /* ignore */
  }
};

const savePendingRun = (run: RunResult): void => {
  const runs = readPendingRuns().filter((item) => item.id !== run.id);
  runs.push(run);
  writePendingRuns(runs);
};

const removePendingRun = (runId: string): void => {
  writePendingRuns(readPendingRuns().filter((run) => run.id !== runId));
};

const readMock = (username: string): MockStore => {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { profile: defaultProfile(username), lastDate: '', bestByDate: {}, longByDate: {} };
      }
      return {
        profile: profileFrom(Reflect.get(parsed, 'profile'), username),
        lastDate: stringProp(parsed, 'lastDate'),
        bestByDate: numberRecord(Reflect.get(parsed, 'bestByDate')),
        longByDate: stringRecord(Reflect.get(parsed, 'longByDate')),
      };
    }
  } catch {
    /* ignore */
  }
  return { profile: defaultProfile(username), lastDate: '', bestByDate: {}, longByDate: {} };
};

const writeMock = (s: MockStore): void => {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86400000);
};

const activeMockProfile = (store: MockStore, username: string, date: string): Profile => {
  const p = store.profile;
  p.username = username;
  const activeStreak = store.lastDate === date || (store.lastDate !== '' && daysBetween(store.lastDate, date) === 1);
  return {
    ...p,
    streak: activeStreak ? p.streak : 0,
    playedToday: store.lastDate === date,
    bestTodayScore: store.lastDate === date ? p.bestTodayScore : 0,
  };
};

/** Honest preview board: only the player's own real result, no fabricated rivals. */
const mockBoards = (date: string, store: MockStore, you: Profile): Leaderboards => {
  const bestTodayScore = store.bestByDate[date] ?? you.bestTodayScore;
  const longestToday = store.longByDate[date] ?? '';
  const topScore: LeaderboardEntry[] =
    bestTodayScore > 0
      ? [{ rank: 1, username: you.username, score: bestTodayScore, detail: 'points', isYou: true }]
      : [];
  const longestWord: LeaderboardEntry[] = longestToday
    ? [
        {
          rank: 1,
          username: you.username,
          score: longestToday.length,
          detail: longestToday.toUpperCase(),
          isYou: true,
        },
      ]
    : [];
  return { topScore, longestWord };
};

const mockDaily = (): DailyResponse => {
  const date = dateKeyUTC();
  const daily = getDaily(date);
  const username = getContextUsername() ?? 'you';
  const store = readMock(username);
  const profile = activeMockProfile(store, username, date);
  return {
    date,
    dayNumber: 1, // preview shows #1; the real sequential number comes from the server
    rule: daily.rule,
    trickScramble: daily.trickScramble,
    trickLength: daily.trickWord.length,
    trickFinders: 0,
    totalPlayers: (store.bestByDate[date] ?? 0) > 0 ? 1 : 0,
    profile,
    leaderboards: mockBoards(date, store, profile),
  };
};

const mockSubmit = (run: RunResult): SubmitResponse => {
  const username = getContextUsername() ?? 'you';
  const store = readMock(username);
  const today = run.date;
  const p = store.profile;
  p.username = username;

  if (store.lastDate !== today) {
    const gap = store.lastDate ? daysBetween(store.lastDate, today) : 999;
    p.streak = gap === 1 ? p.streak + 1 : 1;
    p.daysPlayed += 1;
    p.bestTodayScore = run.score;
  } else {
    p.bestTodayScore = Math.max(p.bestTodayScore, run.score);
  }
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  p.lifetimeScore += Math.max(0, run.score);
  p.lifetimeWords += Math.max(0, run.wordsFound);
  if (run.longestWord.length > p.longestWordEver.length) p.longestWordEver = run.longestWord;
  p.playedToday = true;
  store.lastDate = today;
  store.bestByDate[today] = Math.max(store.bestByDate[today] ?? 0, run.score);
  if (run.longestWord.length > (store.longByDate[today] ?? '').length) store.longByDate[today] = run.longestWord;
  writeMock(store);

  const boards = mockBoards(today, store, p);
  const rank = boards.topScore.find((r) => r.isYou)?.rank ?? 0;
  return {
    accepted: true,
    scoreRank: rank,
    longestRank: boards.longestWord.find((r) => r.isYou)?.rank ?? 0,
    profile: p,
    leaderboards: boards,
    trickFinders: run.foundTrick ? 1 : 0,
    totalPlayers: 1,
    percentile: 100,
  };
};

const tryFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

const submitToServer = (run: RunResult): Promise<SubmitResponse> =>
  tryFetch<SubmitResponse>('/api/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(run),
  });

export const Net = {
  isMock: (): boolean => useMock,

  async getDaily(): Promise<DailyResponse> {
    if (useMock) return mockDaily();
    try {
      return await tryFetch<DailyResponse>('/api/daily');
    } catch {
      useMock = true;
      return mockDaily();
    }
  },

  async submit(run: RunResult): Promise<SubmitResponse> {
    if (useMock) return mockSubmit(run);
    savePendingRun(run);
    const res = await submitToServer(run);
    removePendingRun(run.id);
    return res;
  },

  async retryPendingSubmits(): Promise<SubmitResponse[]> {
    if (useMock) return [];
    const responses: SubmitResponse[] = [];
    for (const run of readPendingRuns()) {
      try {
        const res = await submitToServer(run);
        removePendingRun(run.id);
        responses.push(res);
      } catch {
        return responses;
      }
    }
    return responses;
  },

  async getLeaderboard(): Promise<Leaderboards> {
    if (useMock) {
      const username = getContextUsername() ?? 'you';
      const date = dateKeyUTC();
      const store = readMock(username);
      return mockBoards(date, store, activeMockProfile(store, username, date));
    }
    try {
      return await tryFetch<Leaderboards>('/api/leaderboard');
    } catch {
      useMock = true;
      const username = getContextUsername() ?? 'you';
      const date = dateKeyUTC();
      const store = readMock(username);
      return mockBoards(date, store, activeMockProfile(store, username, date));
    }
  },

  async share(text: string): Promise<ShareResponse> {
    if (useMock) return { ok: true, message: 'preview' };
    try {
      return await tryFetch<ShareResponse>('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      return { ok: false, message: 'Could not post comment' };
    }
  },
};
