# WordFall Randomness Experiment Report

Generated: 2026-07-08T18:56:00.168Z

Runs per variant: 320
Run length: 120 seconds
Trick word used for test: PLANET
Common-word bank: top 1200 entries from `public/assets/common.txt`

## Important Honesty Note

This is a playability proxy, not a true human-fun measurement. It measures
letter-stream affordances: word opportunities, droughts, trick reliability,
rare-letter access, and variety. It cannot measure finger pressure, panic,
visual scanning, or how satisfying a save feels.

## Ranking

| Variant | Score | Avg playable words/window | Dead word windows | Avg rare letters | No-rare runs | 2 trick cycles | Avg worst common-letter drought |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Deck + floors + word nudge | 75.6 | 3.8 | 17% | 3.17 | 0% | 88.1% | 60 |
| Deck + floors + vowel ratio guard | 60.4 | 2.1 | 22.1% | 3.69 | 0% | 88.8% | 60.9 |
| Deck + rare/trick floors | 59.8 | 2.1 | 22.7% | 3.71 | 0% | 88.1% | 61.9 |
| Current + word nudge | 54.4 | 6.2 | 1.1% | 0.03 | 96.6% | 37.8% | 95.6 |
| Current + trick floor | 52.5 | 2 | 21.6% | 2.38 | 8.1% | 91.9% | 74.7 |
| 64-letter weighted deck | 50.7 | 2.1 | 22.4% | 2.57 | 0% | 45.9% | 59.5 |
| Current + rare floor | 48.8 | 1.9 | 23.6% | 3.63 | 0% | 46.6% | 76.2 |
| Current smoothing | 44.3 | 2 | 22.4% | 2.39 | 6.9% | 47.2% | 73.2 |

## Current Baseline

- Score: 44.3
- Avg playable words per 12-letter window: 2
- Dead 12-letter windows: 22.4%
- Long-word window rate: 17%
- Rare letters per run: 2.39
- Runs with zero rare letters: 6.9%
- Runs with at least two full trick-letter cycles: 47.2%
- Avg worst common-letter drought: 73.2 letters

## Best Variant In This Test

Deck + floors + word nudge scored 75.6.

Adds a light English bigram/trigram preference to the deck + floor candidate.

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

See `results.json` for sample streams and all aggregate metrics.
