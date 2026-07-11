/**
 * Client-side dictionary. Loaded once (80k words) for instant, offline word
 * validation during play.
 */

let WORDS: Set<string> | null = null;

export const buildDict = (raw: string): void => {
  WORDS = new Set(
    raw
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3)
  );
};

let dictLoading = false;

/** Candidate URLs for a data file — robust to how the webview serves assets. */
const candidatePaths = (file: string): string[] => [
  `assets/${file}`,
  `./assets/${file}`,
  `../assets/${file}`,
  `data/${file}`,
  file,
];

const fetchFirst = async (file: string): Promise<string | null> => {
  for (const url of candidatePaths(file)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text.length > 100) return text;
      }
    } catch {
      /* try the next candidate path */
    }
  }
  return null;
};

/**
 * Load the word list in the background so the hub appears instantly instead of
 * blocking on a ~770KB download. Safe to call more than once.
 */
export const ensureDict = async (): Promise<void> => {
  if (WORDS || dictLoading) return;
  dictLoading = true;
  try {
    const dictText = await fetchFirst('dict.txt');
    if (dictText) buildDict(dictText);
  } finally {
    dictLoading = false;
  }
};

export const isWord = (w: string): boolean => {
  if (!WORDS) return false;
  return WORDS.has(w.toLowerCase());
};

export const dictReady = (): boolean => WORDS !== null && WORDS.size > 0;
