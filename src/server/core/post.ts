import { reddit } from '@devvit/web/server';
import { dateKeyUTC, getDaily } from '../../shared/daily';
import { getNextUnpostedDate, getPostIdForDate, setPostDate, nextPostNumber } from './store';

/** Create the interactive WordFall post for a given day and remember its date. */
export const createDailyPost = async (
  date: string = dateKeyUTC()
): Promise<{ id: string; date: string; created: boolean }> => {
  const existing = await getPostIdForDate(date);
  if (existing) return { id: existing, date, created: false };

  const daily = getDaily(date);
  const postNumber = await nextPostNumber(date);
  const title = `WordFall #${postNumber} · ${daily.rule.name}`;
  const post = await reddit.submitCustomPost({ title });
  await setPostDate(post.id, date);
  return { id: post.id, date, created: true };
};

/** Create the next unposted daily challenge, starting from today. */
export const createNextDailyPost = async (): Promise<{ id: string; date: string; created: boolean }> => {
  const date = await getNextUnpostedDate();
  return createDailyPost(date);
};

/** Back-compat alias used by menu / install trigger. */
export const createPost = async (): Promise<{ id: string; date: string; created: boolean }> => {
  return createNextDailyPost();
};
