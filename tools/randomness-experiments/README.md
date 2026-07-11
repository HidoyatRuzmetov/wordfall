# WordFall Randomness Experiments

This folder is a small, reproducible lab for testing WordFall falling-letter
randomizers before changing production gameplay.

Run it from the project root:

```powershell
node tools/randomness-experiments/run-randomness-experiments.mjs
```

The script generates:

- `results.json` - full aggregate metrics and 20 sample 2-minute runs per variant.
- `report.md` - a readable summary and recommendation.

## What It Measures

There is no objective universal "fun score" for a word arcade stream, so the
script uses proxy metrics:

- **Word affordance**: how many common words can be made from rolling 12-letter
  windows as ordered subsequences.
- **Long-word windows**: how often a rolling window has at least one 5+ letter
  common word available.
- **Trick reliability**: whether the highlighted trick-letter stream can supply
  at least two full trick-word cycles in a 2-minute run.
- **Rare-letter access**: how often J/Q/X/Z/K are absent and how long rare
  droughts get.
- **Common-letter droughts**: longest drought among frequent English letters.
- **Class balance**: vowel/consonant streaks and droughts.
- **Variety**: entropy of the resulting letter stream.

These are ranking tools, not proof of player enjoyment. Human playtesting still
matters because dodging, attention, panic, and word-recognition skill are not
fully modeled here.
