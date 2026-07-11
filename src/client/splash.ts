import { requestExpandedMode } from '@devvit/web/client';
import { getDaily, dateKeyUTC } from '../shared/daily';
import type { DailyResponse, DailyRuleId } from '../shared/types';

type SplashDaily = Pick<DailyResponse, 'dayNumber' | 'rule' | 'trickScramble'>;
const DAILY_RULE_IDS = new Set<string>([
  'classic',
  'vowelRush',
  'longHaul',
  'consonantChaos',
  'rareGems',
  'featherweight',
  'comboFrenzy',
]);

const isDailyRuleId = (value: unknown): value is DailyRuleId =>
  typeof value === 'string' && DAILY_RULE_IDS.has(value);

const set = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

const splashDailyFrom = (value: unknown): SplashDaily | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const dayNumber = Reflect.get(value, 'dayNumber');
  const rule = Reflect.get(value, 'rule');
  const trickScramble = Reflect.get(value, 'trickScramble');
  if (typeof dayNumber !== 'number' || typeof trickScramble !== 'string') return null;
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return null;
  const id = Reflect.get(rule, 'id');
  const name = Reflect.get(rule, 'name');
  const blurb = Reflect.get(rule, 'blurb');
  const tip = Reflect.get(rule, 'tip');
  if (!isDailyRuleId(id) || typeof name !== 'string' || typeof blurb !== 'string' || typeof tip !== 'string') {
    return null;
  }
  return { dayNumber, rule: { id, name, blurb, tip }, trickScramble };
};

const fallbackDaily = (): SplashDaily => {
  const daily = getDaily(dateKeyUTC());
  return {
    dayNumber: daily.dayNumber,
    rule: daily.rule,
    trickScramble: daily.trickScramble,
  };
};

const loadDaily = async (): Promise<SplashDaily> => {
  try {
    const res = await fetch('/api/daily');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const daily = splashDailyFrom(await res.json());
    return daily ?? fallbackDaily();
  } catch {
    return fallbackDaily();
  }
};

const renderDaily = (daily: SplashDaily): void => {
  set('daynum', `DAILY #${daily.dayNumber}`);
  set('rule', daily.rule.name);
  set('scramble', daily.trickScramble.split('').join(' '));
  set('blurb', daily.rule.blurb);
};

void loadDaily().then(renderDaily);

// Ambient falling letters
const falls = document.getElementById('falls');
if (falls) {
  const letters = 'WORDFALLETRSAI';
  for (let i = 0; i < 10; i++) {
    const span = document.createElement('span');
    span.textContent = letters[Math.floor(Math.random() * letters.length)] ?? 'A';
    span.style.left = `${Math.random() * 100}%`;
    span.style.animationDuration = `${5 + Math.random() * 6}s`;
    span.style.animationDelay = `${-Math.random() * 8}s`;
    span.style.fontSize = `${16 + Math.random() * 20}px`;
    if (Math.random() < 0.3) span.style.color = '#ffd257';
    falls.appendChild(span);
  }
}

const play = document.getElementById('play');
play?.addEventListener('click', (e: MouseEvent) => {
  requestExpandedMode(e, 'game');
});
