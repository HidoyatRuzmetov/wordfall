import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { getDaily } from '../../shared/daily';
import type {
  DailyResponse,
  ErrorResponse,
  ShareResponse,
  SubmitResponse,
} from '../../shared/types';
import {
  getLeaderboards,
  getLongRank,
  getPercentile,
  getPostDate,
  getPostNumber,
  getProfile,
  getScoreRank,
  getTotalPlayers,
  getTrickFinders,
  getUsername,
  hasProcessedRun,
  markProcessedRun,
  recordRun,
  updateProfile,
} from '../core/store';
import { sanitizeRun } from '../core/validate';

export const api = new Hono();

/** Everything the daily hub needs (safe: no trick answer, only the scramble). */
api.get('/daily', async (c) => {
  try {
    const date = await getPostDate(context.postId);
    const daily = getDaily(date);
    const username = await getUsername();

    const [profile, leaderboards, trickFinders, totalPlayers, postNumber] = await Promise.all([
      getProfile(username, date),
      getLeaderboards(date, username),
      getTrickFinders(date),
      getTotalPlayers(date),
      getPostNumber(date),
    ]);

    return c.json<DailyResponse>({
      date,
      dayNumber: postNumber || daily.dayNumber,
      rule: daily.rule,
      trickScramble: daily.trickScramble,
      trickLength: daily.trickWord.length,
      trickFinders,
      totalPlayers,
      profile,
      leaderboards,
    });
  } catch (error) {
    console.error('daily error', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to load daily' }, 400);
  }
});

/** Submit a completed run: update boards + profile, return fresh ranks. */
api.post('/submit', async (c) => {
  try {
    const date = await getPostDate(context.postId);
    const username = await getUsername();
    const body = await c.req.json().catch(() => ({}));
    const run = sanitizeRun(date, body);

    const alreadyProcessed = run.id ? await hasProcessedRun(username, run.id) : false;
    const profile = alreadyProcessed
      ? await getProfile(username, date)
      : await updateStoredRun(date, username, run);

    const [scoreRank, longestRank, leaderboards, trickFinders, totalPlayers, percentile] =
      await Promise.all([
        getScoreRank(date, username),
        getLongRank(date, username),
        getLeaderboards(date, username),
        getTrickFinders(date),
        getTotalPlayers(date),
        getPercentile(date, username),
      ]);

    return c.json<SubmitResponse>({
      accepted: true,
      scoreRank,
      longestRank,
      profile,
      leaderboards,
      trickFinders,
      totalPlayers,
      percentile,
    });
  } catch (error) {
    console.error('submit error', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to submit run' }, 400);
  }
});

const updateStoredRun = async (
  date: string,
  username: string,
  run: ReturnType<typeof sanitizeRun>
) => {
  await recordRun(date, username, run);
  const profile = await updateProfile(username, run, date);
  if (run.id) await markProcessedRun(username, run.id);
  return profile;
};

/** Refresh just the leaderboards (used by the standings overlay). */
api.get('/leaderboard', async (c) => {
  try {
    const date = await getPostDate(context.postId);
    const username = await getUsername();
    const leaderboards = await getLeaderboards(date, username, 25);
    return c.json(leaderboards);
  } catch (error) {
    console.error('leaderboard error', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to load board' }, 400);
  }
});

/** Post the player's result as a comment to fuel the thread. */
api.post('/share', async (c) => {
  try {
    const { postId } = context;
    if (!postId) {
      return c.json<ShareResponse>({ ok: false, message: 'No post context' }, 400);
    }
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text =
      typeof body.text === 'string' && body.text.length > 0 && body.text.length <= 2000
        ? body.text
        : 'I played WordFall today!';
    const comment = await reddit.submitComment({ id: postId, text });
    return c.json<ShareResponse>({ ok: true, url: comment.permalink });
  } catch (error) {
    console.error('share error', error);
    return c.json<ShareResponse>({ ok: false, message: 'Failed to post comment' }, 400);
  }
});
