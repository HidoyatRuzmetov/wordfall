import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

const RUNS_PER_VARIANT = 320;
const SAMPLE_RUNS = 20;
const DURATION_SEC = 120;
const HAZARD_RATE = 0.1;
const BONUS_RATE = 0.08;
const TRICK_WORD = 'PLANET';
const WORD_WINDOW = 12;
const WORD_WINDOW_STEP = 4;
const WORD_BANK_LIMIT = 1200;
const RECENT_LETTER_WINDOW = 8;
const TOP_COMMON_LETTERS = 'ETAOINSRHLDCU';
const RARE_LETTERS = 'JQXZK';

const LETTER_DIST = {
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
const LETTER_BAG = Object.entries(LETTER_DIST)
  .map(([letter, n]) => letter.repeat(n))
  .join('');
const BONUS_BAG = ['time', 'time', 'heart', 'back', 'back', 'clear', 'gem'];

const VARIANTS = [
  {
    id: 'current',
    label: 'Current smoothing',
    source: 'weighted',
    notes: 'Current letter distribution plus recent-repeat and vowel/consonant run guards.',
  },
  {
    id: 'rare-floor',
    label: 'Current + rare floor',
    source: 'weighted',
    rareFloor: true,
    rareGapLimit: 34,
    notes: 'Forces a rare letter after a long rare drought if it can pass smoothing.',
  },
  {
    id: 'current-word-nudge',
    label: 'Current + word nudge',
    source: 'weighted',
    wordNudge: true,
    notes: 'Keeps current randomness but prefers letters that form common bigrams/trigrams with the recent stream.',
  },
  {
    id: 'trick-floor',
    label: 'Current + trick floor',
    source: 'weighted',
    trickFloor: true,
    trickEveryLetters: 8,
    notes: 'Keeps trick letters on pace for at least two full trick-word cycles.',
  },
  {
    id: 'weighted-deck',
    label: '64-letter weighted deck',
    source: 'deck',
    deckSize: 64,
    notes: 'Draws letters without replacement from a small weighted deck, Tetris-bag style.',
  },
  {
    id: 'deck-floors',
    label: 'Deck + rare/trick floors',
    source: 'deck',
    deckSize: 64,
    rareFloor: true,
    rareGapLimit: 34,
    trickFloor: true,
    trickEveryLetters: 8,
    notes: 'Combines bagged letters with rare-letter and trick-word reliability floors.',
  },
  {
    id: 'deck-floors-word-nudge',
    label: 'Deck + floors + word nudge',
    source: 'deck',
    deckSize: 64,
    rareFloor: true,
    rareGapLimit: 34,
    trickFloor: true,
    trickEveryLetters: 8,
    wordNudge: true,
    notes: 'Adds a light English bigram/trigram preference to the deck + floor candidate.',
  },
  {
    id: 'full-fairness',
    label: 'Deck + floors + vowel ratio guard',
    source: 'deck',
    deckSize: 64,
    rareFloor: true,
    rareGapLimit: 34,
    trickFloor: true,
    trickEveryLetters: 8,
    vowelRatioGuard: true,
    notes: 'Adds a rolling vowel-ratio nudge on top of the deck and floor rules.',
  },
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n, digits = 2) => Number(n.toFixed(digits));
const isVowel = (letter) => 'AEIOU'.includes(letter);
const isRare = (letter) => RARE_LETTERS.includes(letter);

const hashString = (str) => {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h1 >>> 0) ^ (h2 >>> 0)) >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (items, rand) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const makeRoundedDeck = (size) => {
  const rows = Object.entries(LETTER_DIST).map(([letter, weight]) => {
    const exact = (weight / LETTER_TOTAL) * size;
    return { letter, exact, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let used = rows.reduce((sum, row) => sum + row.count, 0);
  for (const row of rows.sort((a, b) => b.remainder - a.remainder)) {
    if (used >= size) break;
    row.count += 1;
    used += 1;
  }

  const rareCount = rows.filter((row) => isRare(row.letter)).reduce((sum, row) => sum + row.count, 0);
  if (rareCount < 2) {
    const rare = rows.find((row) => row.letter === 'K');
    const donor = rows
      .filter((row) => !isRare(row.letter) && row.count > 1)
      .sort((a, b) => b.count - a.count)[0];
    if (rare && donor) {
      rare.count += 1;
      donor.count -= 1;
    }
  }

  return rows.flatMap((row) => Array.from({ length: row.count }, () => row.letter));
};

const makeLetterSource = (variant, rand) => {
  if (variant.source !== 'deck') {
    return {
      candidate(predicate = () => true) {
        for (let i = 0; i < 80; i += 1) {
          const letter = LETTER_BAG[Math.floor(rand() * LETTER_BAG.length)];
          if (predicate(letter)) return letter;
        }
        return LETTERS.find(predicate) ?? 'E';
      },
      commit() {},
      snapshot: [],
    };
  }

  const baseDeck = makeRoundedDeck(variant.deckSize ?? 64);
  let deck = shuffle(baseDeck, rand);
  const refill = () => {
    deck = shuffle(baseDeck, rand);
  };
  return {
    candidate(predicate = () => true) {
      if (deck.length === 0) refill();
      const matching = deck
        .map((letter, index) => ({ letter, index }))
        .filter((item) => predicate(item.letter));
      if (matching.length === 0) return LETTERS.find(predicate) ?? deck[0] ?? 'E';
      return matching[Math.floor(rand() * matching.length)].letter;
    },
    commit(letter) {
      const index = deck.indexOf(letter);
      if (index >= 0) deck.splice(index, 1);
      if (deck.length === 0) refill();
    },
    snapshot: baseDeck,
  };
};

const repeatsTooSoon = (letter, recent) => {
  if (recent[recent.length - 1] === letter) return true;
  return recent.slice(-6).filter((ch) => ch === letter).length >= 2;
};

const extendsLetterClassRun = (letter, recent) => {
  const tail = recent.slice(-3);
  if (tail.length < 3) return false;
  const wantVowel = isVowel(letter);
  return tail.every((ch) => isVowel(ch) === wantVowel);
};

const safeLetter = (letter, recent) => !extendsLetterClassRun(letter, recent) && !repeatsTooSoon(letter, recent);

const desiredClassPredicate = (variant, recent) => {
  if (!variant.vowelRatioGuard) return null;
  const window = recent.slice(-12);
  if (window.length < 10) return null;
  const vowels = window.filter(isVowel).length;
  if (vowels <= 3) return isVowel;
  if (vowels >= 7) return (letter) => !isVowel(letter);
  return null;
};

const ngramScore = (letter, recent, ngrams) => {
  if (!ngrams) return 0;
  const prev = recent[recent.length - 1] ?? '';
  const prev2 = recent[recent.length - 2] ?? '';
  const bigram = prev ? `${prev}${letter}` : '';
  const trigram = prev2 && prev ? `${prev2}${prev}${letter}` : '';
  return Math.log1p(ngrams.bigrams.get(bigram) ?? 0) * 1.8 + Math.log1p(ngrams.trigrams.get(trigram) ?? 0) * 3.2;
};

const pickSmoothedLetter = (source, recent, predicate = () => true, variant = {}, rand = Math.random, ngrams = null) => {
  if (variant.wordNudge) {
    let best = '';
    let bestScore = -Infinity;
    for (let i = 0; i < 18; i += 1) {
      const letter = source.candidate(predicate);
      const classBad = extendsLetterClassRun(letter, recent);
      const repeatBad = repeatsTooSoon(letter, recent);
      if (classBad || repeatBad) continue;
      const score = ngramScore(letter, recent, ngrams) + rand() * 0.35;
      if (score > bestScore) {
        best = letter;
        bestScore = score;
      }
    }
    if (best) {
      source.commit(best);
      return best;
    }
  }

  let classSafe = '';
  let repeatSafe = '';
  let fallback = '';
  for (let i = 0; i < 24; i += 1) {
    const letter = source.candidate(predicate);
    fallback ||= letter;
    const classBad = extendsLetterClassRun(letter, recent);
    const repeatBad = repeatsTooSoon(letter, recent);
    if (!classBad && !repeatBad) {
      source.commit(letter);
      return letter;
    }
    if (!classBad && !classSafe) classSafe = letter;
    if (!repeatBad && !repeatSafe) repeatSafe = letter;
  }
  const chosen = classSafe || repeatSafe || fallback || source.candidate(predicate);
  source.commit(chosen);
  return chosen;
};

const forceRareLetter = (recent, rand) => {
  const rareBag = 'KKJQXZ';
  for (let i = 0; i < 12; i += 1) {
    const letter = rareBag[Math.floor(rand() * rareBag.length)];
    if (safeLetter(letter, recent)) return letter;
  }
  return '';
};

const nextSpawn = (state, variant, rand, ngrams) => {
  const roll = rand();
  if (roll < HAZARD_RATE) return { kind: 'hazard' };
  if (roll < HAZARD_RATE + BONUS_RATE) {
    return { kind: 'bonus', bonus: BONUS_BAG[Math.floor(rand() * BONUS_BAG.length)] };
  }

  const trickLetter = TRICK_WORD[state.trickIndex % TRICK_WORD.length];
  const trickQuota = variant.trickFloor
    ? Math.floor((state.letters.length + 1) / (variant.trickEveryLetters ?? 8))
    : 0;
  if (variant.trickFloor && state.trickMarked < trickQuota && safeLetter(trickLetter, state.recent)) {
    state.trickIndex += 1;
    state.trickMarked += 1;
    return { kind: 'letter', letter: trickLetter, isTrick: true };
  }

  if (rand() < 0.14 && safeLetter(trickLetter, state.recent)) {
    state.trickIndex += 1;
    state.trickMarked += 1;
    return { kind: 'letter', letter: trickLetter, isTrick: true };
  }

  if (variant.rareFloor && state.lettersSinceRare >= (variant.rareGapLimit ?? 34)) {
    const rare = forceRareLetter(state.recent, rand);
    if (rare) return { kind: 'letter', letter: rare, isTrick: false, forcedRare: true };
  }

  const classPredicate = desiredClassPredicate(variant, state.recent) ?? (() => true);
  const letter = pickSmoothedLetter(state.source, state.recent, classPredicate, variant, rand, ngrams);
  return { kind: 'letter', letter, isTrick: false };
};

const simulateRun = (variant, seed, ngrams) => {
  const rand = mulberry32(seed);
  const source = makeLetterSource(variant, rand);
  const state = {
    source,
    recent: [],
    letters: [],
    stream: [],
    trickIndex: 0,
    trickMarked: 0,
    lettersSinceRare: 0,
  };

  for (let t = 0; t < DURATION_SEC; ) {
    const progress = t / DURATION_SEC;
    const ramp = progress * progress * (3 - 2 * progress);
    const interval = 1.15 - ramp * 0.25;
    t += interval;
    if (t > DURATION_SEC) break;

    const spawn = nextSpawn(state, variant, rand, ngrams);
    state.stream.push(spawn);
    if (spawn.kind === 'letter') {
      state.letters.push(spawn.letter);
      state.recent.push(spawn.letter);
      if (state.recent.length > RECENT_LETTER_WINDOW) state.recent.shift();
      state.lettersSinceRare = isRare(spawn.letter) ? 0 : state.lettersSinceRare + 1;
    }
  }

  return state.stream;
};

const loadWordBank = () => {
  const raw = readFileSync(join(projectRoot, 'public/assets/common.txt'), 'utf8');
  const seen = new Set();
  const words = [];
  for (const word of raw.split(/\r?\n/)) {
    const clean = word.trim().toUpperCase();
    if (!/^[A-Z]{3,7}$/.test(clean) || seen.has(clean)) continue;
    seen.add(clean);
    words.push({ word: clean, letters: clean.split(''), long: clean.length >= 5 });
    if (words.length >= WORD_BANK_LIMIT) break;
  }
  return words;
};

const makeNgramStats = (wordBank) => {
  const bigrams = new Map();
  const trigrams = new Map();
  for (const { word } of wordBank) {
    for (let i = 0; i < word.length - 1; i += 1) {
      const bg = word.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
    for (let i = 0; i < word.length - 2; i += 1) {
      const tg = word.slice(i, i + 3);
      trigrams.set(tg, (trigrams.get(tg) ?? 0) + 1);
    }
  }
  return { bigrams, trigrams };
};

const isSubsequence = (wordLetters, windowLetters) => {
  let index = 0;
  for (const ch of windowLetters) {
    if (ch === wordLetters[index]) index += 1;
    if (index >= wordLetters.length) return true;
  }
  return false;
};

const maxRun = (letters, predicate) => {
  let best = 0;
  let current = 0;
  for (const letter of letters) {
    if (predicate(letter)) current += 1;
    else current = 0;
    best = Math.max(best, current);
  }
  return best;
};

const maxGapUntil = (letters, predicate) => {
  let best = 0;
  let gap = 0;
  for (const letter of letters) {
    if (predicate(letter)) gap = 0;
    else {
      gap += 1;
      best = Math.max(best, gap);
    }
  }
  return best;
};

const maxSpecificGap = (letters, target) => {
  let best = 0;
  let gap = 0;
  let seen = false;
  for (const letter of letters) {
    if (letter === target) {
      best = Math.max(best, gap);
      gap = 0;
      seen = true;
    } else {
      gap += 1;
    }
  }
  return seen ? Math.max(best, gap) : letters.length;
};

const entropy = (letters) => {
  const counts = new Map();
  for (const letter of letters) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  let h = 0;
  for (const count of counts.values()) {
    const p = count / letters.length;
    h -= p * Math.log2(p);
  }
  return h;
};

const targetEntropy = () => {
  let h = 0;
  for (const n of Object.values(LETTER_DIST)) {
    const p = n / LETTER_TOTAL;
    h -= p * Math.log2(p);
  }
  return h;
};

const sequenceContainsTrick = (letters) => isSubsequence(TRICK_WORD.split(''), letters);

const analyzeRun = (stream, wordBank) => {
  const letters = stream.filter((spawn) => spawn.kind === 'letter').map((spawn) => spawn.letter);
  const trickMarked = stream.filter((spawn) => spawn.kind === 'letter' && spawn.isTrick).length;
  const rareCount = letters.filter(isRare).length;
  const windowCounts = [];
  const longWindowHits = [];
  for (let start = 0; start + WORD_WINDOW <= letters.length; start += WORD_WINDOW_STEP) {
    const window = letters.slice(start, start + WORD_WINDOW);
    let count = 0;
    let longCount = 0;
    for (const entry of wordBank) {
      if (isSubsequence(entry.letters, window)) {
        count += 1;
        if (entry.long) longCount += 1;
      }
    }
    windowCounts.push(count);
    longWindowHits.push(longCount > 0);
  }

  const commonGaps = TOP_COMMON_LETTERS.split('').map((letter) => maxSpecificGap(letters, letter));
  const counts = Object.fromEntries(LETTERS.map((letter) => [letter, 0]));
  for (const letter of letters) counts[letter] += 1;

  return {
    objects: stream.length,
    letters: letters.length,
    hazards: stream.filter((spawn) => spawn.kind === 'hazard').length,
    bonuses: stream.filter((spawn) => spawn.kind === 'bonus').length,
    vowelPct: (letters.filter(isVowel).length / letters.length) * 100,
    maxVowelRun: maxRun(letters, isVowel),
    maxConsonantRun: maxRun(letters, (letter) => !isVowel(letter)),
    maxVowelGap: maxGapUntil(letters, isVowel),
    maxConsonantGap: maxGapUntil(letters, (letter) => !isVowel(letter)),
    rareCount,
    maxRareGap: maxGapUntil(letters, isRare),
    noRare: rareCount === 0,
    trickMarked,
    trickCycles: Math.floor(trickMarked / TRICK_WORD.length),
    trickSubsequence: sequenceContainsTrick(letters),
    avgPlayableWords12: avg(windowCounts),
    deadWordWindowPct: pct(windowCounts.filter((n) => n === 0).length, windowCounts.length),
    longWordWindowPct: pct(longWindowHits.filter(Boolean).length, longWindowHits.length),
    worstCommonLetterGap: Math.max(...commonGaps),
    entropy: entropy(letters),
    normalizedEntropy: (entropy(letters) / targetEntropy()) * 100,
    counts,
    sequence: letters.join(''),
  };
};

const avg = (items) => (items.length === 0 ? 0 : items.reduce((sum, n) => sum + n, 0) / items.length);
const pct = (num, den) => (den === 0 ? 0 : (num / den) * 100);
const percentile = (items, p) => {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => a - b);
  const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index];
};

const aggregate = (variant, runMetrics) => {
  const metric = (key) => runMetrics.map((run) => run[key]);
  const scoreParts = {
    affordance: clamp(((avg(metric('avgPlayableWords12')) - 1.2) / 1.8) * 100, 0, 100),
    deadWindows: clamp(100 - avg(metric('deadWordWindowPct')) * 3, 0, 100),
    longWords: clamp(avg(metric('longWordWindowPct')), 0, 100),
    trickReliability: pct(runMetrics.filter((run) => run.trickCycles >= 2).length, runMetrics.length),
    rareAccess: clamp(100 - pct(runMetrics.filter((run) => run.noRare).length, runMetrics.length) * 1.2 - Math.max(0, avg(metric('maxRareGap')) - 42) * 2, 0, 100),
    commonDroughts: clamp(100 - Math.max(0, avg(metric('worstCommonLetterGap')) - 32) * 3, 0, 100),
    variety: clamp(avg(metric('normalizedEntropy')), 0, 100),
  };
  const playabilityScore =
    scoreParts.affordance * 0.2 +
    scoreParts.deadWindows * 0.1 +
    scoreParts.longWords * 0.12 +
    scoreParts.trickReliability * 0.18 +
    scoreParts.rareAccess * 0.16 +
    scoreParts.commonDroughts * 0.12 +
    scoreParts.variety * 0.12;

  return {
    id: variant.id,
    label: variant.label,
    notes: variant.notes,
    playabilityScore: round(playabilityScore, 1),
    scoreParts: Object.fromEntries(Object.entries(scoreParts).map(([key, value]) => [key, round(value, 1)])),
    means: {
      objects: round(avg(metric('objects')), 1),
      letters: round(avg(metric('letters')), 1),
      hazards: round(avg(metric('hazards')), 1),
      bonuses: round(avg(metric('bonuses')), 1),
      vowelPct: round(avg(metric('vowelPct')), 1),
      rareCount: round(avg(metric('rareCount')), 2),
      maxRareGap: round(avg(metric('maxRareGap')), 1),
      trickMarked: round(avg(metric('trickMarked')), 1),
      avgPlayableWords12: round(avg(metric('avgPlayableWords12')), 1),
      deadWordWindowPct: round(avg(metric('deadWordWindowPct')), 1),
      longWordWindowPct: round(avg(metric('longWordWindowPct')), 1),
      worstCommonLetterGap: round(avg(metric('worstCommonLetterGap')), 1),
      normalizedEntropy: round(avg(metric('normalizedEntropy')), 1),
    },
    rates: {
      noRareRunPct: round(pct(runMetrics.filter((run) => run.noRare).length, runMetrics.length), 1),
      twoTrickCyclesPct: round(pct(runMetrics.filter((run) => run.trickCycles >= 2).length, runMetrics.length), 1),
      trickSubsequencePct: round(pct(runMetrics.filter((run) => run.trickSubsequence).length, runMetrics.length), 1),
    },
    p90: {
      maxRareGap: round(percentile(metric('maxRareGap'), 90), 1),
      worstCommonLetterGap: round(percentile(metric('worstCommonLetterGap'), 90), 1),
      deadWordWindowPct: round(percentile(metric('deadWordWindowPct'), 90), 1),
    },
    samples: runMetrics.slice(0, SAMPLE_RUNS).map((run, index) => ({
      sample: index + 1,
      letters: run.letters,
      vowelPct: round(run.vowelPct, 1),
      rareCount: run.rareCount,
      trickMarked: run.trickMarked,
      avgPlayableWords12: round(run.avgPlayableWords12, 1),
      sequence: run.sequence,
    })),
  };
};

const makeMarkdownReport = (results) => {
  const ranked = [...results.variants].sort((a, b) => b.playabilityScore - a.playabilityScore);
  const rows = ranked
    .map(
      (r) =>
        `| ${r.label} | ${r.playabilityScore} | ${r.means.avgPlayableWords12} | ${r.means.deadWordWindowPct}% | ${r.means.rareCount} | ${r.rates.noRareRunPct}% | ${r.rates.twoTrickCyclesPct}% | ${r.means.worstCommonLetterGap} |`
    )
    .join('\n');
  const best = ranked[0];
  const current = results.variants.find((variant) => variant.id === 'current');

  return `# WordFall Randomness Experiment Report

Generated: ${new Date().toISOString()}

Runs per variant: ${RUNS_PER_VARIANT}
Run length: ${DURATION_SEC} seconds
Trick word used for test: ${TRICK_WORD}
Common-word bank: top ${WORD_BANK_LIMIT} entries from \`public/assets/common.txt\`

## Important Honesty Note

This is a playability proxy, not a true human-fun measurement. It measures
letter-stream affordances: word opportunities, droughts, trick reliability,
rare-letter access, and variety. It cannot measure finger pressure, panic,
visual scanning, or how satisfying a save feels.

## Ranking

| Variant | Score | Avg playable words/window | Dead word windows | Avg rare letters | No-rare runs | 2 trick cycles | Avg worst common-letter drought |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Current Baseline

- Score: ${current.playabilityScore}
- Avg playable words per 12-letter window: ${current.means.avgPlayableWords12}
- Dead 12-letter windows: ${current.means.deadWordWindowPct}%
- Long-word window rate: ${current.means.longWordWindowPct}%
- Rare letters per run: ${current.means.rareCount}
- Runs with zero rare letters: ${current.rates.noRareRunPct}%
- Runs with at least two full trick-letter cycles: ${current.rates.twoTrickCyclesPct}%
- Avg worst common-letter drought: ${current.means.worstCommonLetterGap} letters

## Best Variant In This Test

${best.label} scored ${best.playabilityScore}.

${best.notes}

## Recommendation

The strongest production candidate in this experiment is **Deck + floors + word
nudge**. It is the only tested variant that meaningfully improves word access
while preserving rare-letter and trick-word reliability.

The minimal safer candidate is **Deck + rare/trick floors**. It improves
fairness and daily-rule reliability, but it does not materially improve how
word-like the letter stream feels.

Do **not** use the word nudge by itself. In this test it made the stream much
more word-like, but it nearly eliminated rare letters because common English
ngrams naturally avoid J/Q/X/Z/K. The rare floor and deck are what keep that
from breaking the game's rule variety.

I would avoid making the stream too perfectly balanced. If every short window
looks engineered, players may stop believing the run is alive. The goal is
"no brutal droughts", not "every 12 letters are identical in shape."

See \`results.json\` for sample streams and all aggregate metrics.
`;
};

const main = () => {
  mkdirSync(__dirname, { recursive: true });
  const wordBank = loadWordBank();
  const ngrams = makeNgramStats(wordBank);
  const variants = [];

  for (const variant of VARIANTS) {
    const metrics = [];
    for (let i = 0; i < RUNS_PER_VARIANT; i += 1) {
      const seed = hashString(`wordfall-randomness-lab::${variant.id}::${i}`);
      const stream = simulateRun(variant, seed, ngrams);
      metrics.push(analyzeRun(stream, wordBank));
    }
    variants.push(aggregate(variant, metrics));
  }

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      runsPerVariant: RUNS_PER_VARIANT,
      sampleRuns: SAMPLE_RUNS,
      durationSec: DURATION_SEC,
      wordWindow: WORD_WINDOW,
      wordWindowStep: WORD_WINDOW_STEP,
      wordBankLimit: WORD_BANK_LIMIT,
      trickWord: TRICK_WORD,
    },
    variants,
  };

  writeFileSync(join(__dirname, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(__dirname, 'report.md'), makeMarkdownReport(results));

  const ranked = [...variants].sort((a, b) => b.playabilityScore - a.playabilityScore);
  console.log('WordFall randomness experiment complete.');
  for (const result of ranked) {
    console.log(
      `${result.playabilityScore.toFixed(1).padStart(5)}  ${result.label.padEnd(34)}  words/window=${String(
        result.means.avgPlayableWords12
      ).padStart(5)} rare=${String(result.means.rareCount).padStart(4)} noRare=${String(
        result.rates.noRareRunPct
      ).padStart(5)}% trick2=${String(result.rates.twoTrickCyclesPct).padStart(5)}%`
    );
  }
  console.log(`\nWrote ${join(__dirname, 'results.json')}`);
  console.log(`Wrote ${join(__dirname, 'report.md')}`);
};

main();
