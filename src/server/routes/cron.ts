import { Hono } from 'hono';
import { createDailyPost } from '../core/post';

export const cron = new Hono();

/** Fires once a day (see devvit.json scheduler) to drop the fresh daily post. */
cron.post('/daily-roll', async (c) => {
  try {
    const { id, date, created } = await createDailyPost();
    console.log(`WordFall daily post ready: ${id} for ${date} (created: ${created})`);
    return c.json({ status: 'success', postId: id, date, created }, 200);
  } catch (error) {
    console.error('daily-roll error', error);
    return c.json({ status: 'error', message: 'Failed to roll daily post' }, 400);
  }
});
