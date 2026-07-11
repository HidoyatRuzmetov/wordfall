import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, textStyle, hex } from '../theme';
import { Background, makeButton, drawPanel, centerFit } from '../ui';
import { SFX } from '../audio';
import { Net } from '../net';
import { Session } from '../session';
import { addDaysUTC, getDaily } from '../../shared/daily';
import { dailyStreakMultiplier } from '../../shared/scoring';
import type { Profile, RunResult, SubmitResponse } from '../../shared/types';

const DESIGN_W = 440;
const DESIGN_H = 724;

/** Peak-end results: reveal, standings, share to comments, tomorrow's teaser. */
export class Results extends Scene {
  private bg!: Background;
  private content: Phaser.GameObjects.Container | null = null;
  private run!: RunResult;
  private counted = false;
  private alive = false;

  constructor() {
    super('Results');
  }

  create(): void {
    this.alive = true;
    const { width, height } = this.scale;
    this.bg = new Background(this);
    this.bg.resize(width, height);

    const run = Session.lastRun;
    if (!run) {
      this.scene.start('Home');
      return;
    }
    this.run = run;

    // Show the results instantly from local run data, then quietly refresh the
    // ranks/streak once the server replies — no "tallying" wait.
    Session.submitSync = 'pending';
    this.build(this.optimisticResponse(run));
    const submit = this.submitWithRetry(run)
      .then((res) => {
        const merged = this.applySubmitResponse(res);
        Session.submitSync = 'synced';
        if (this.alive) this.build(merged);
        return merged;
      })
      .catch((error) => {
        Session.submitSync = 'failed';
        if (this.alive) this.build(this.optimisticResponse(run));
        throw error;
      });
    Session.pendingSubmit = submit;
    const clearPending = (): void => {
      if (Session.pendingSubmit === submit) Session.pendingSubmit = null;
    };
    void submit.then(clearPending, clearPending);

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.scale.off('resize', this.onResize, this);
    });
  }

  private async submitWithRetry(run: RunResult): Promise<SubmitResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await Net.submit(run);
      } catch (error) {
        lastError = error;
        await this.wait(700 + attempt * 900);
      }
    }
    const retried = await Net.retryPendingSubmits();
    const latest = retried[retried.length - 1];
    if (latest) return latest;
    throw lastError;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  private applySubmitResponse(res: SubmitResponse): SubmitResponse {
    const profile = this.mergeProfile(res.profile);
    const merged = { ...res, profile };
    Session.lastSubmit = merged;
    if (Session.daily && Session.lastRun?.date === Session.daily.date) {
      Session.daily = {
        ...Session.daily,
        profile,
        leaderboards: res.leaderboards,
        trickFinders: res.trickFinders,
        totalPlayers: res.totalPlayers,
      };
    }
    return merged;
  }

  private mergeProfile(next: Profile): Profile {
    const current = Session.daily?.profile;
    if (!current || Session.lastRun?.date !== Session.daily?.date || !next.playedToday) return next;
    return {
      ...next,
      streak: Math.max(current.streak, next.streak),
      bestStreak: Math.max(current.bestStreak, next.bestStreak, current.streak),
    };
  }

  private optimisticResponse(run: RunResult): SubmitResponse {
    const profile = this.optimisticProfile(run);
    return {
      accepted: true,
      scoreRank: 0,
      longestRank: 0,
      profile,
      leaderboards: Session.lastSubmit?.leaderboards ?? { topScore: [], longestWord: [] },
      trickFinders: run.foundTrick ? 1 : 0,
      totalPlayers: 1,
      percentile: 100,
    };
  }

  private optimisticProfile(run: RunResult): Profile {
    const current = Session.lastSubmit?.profile ?? Session.daily?.profile;
    if (!current) {
      return {
        username: 'you',
        streak: 0,
        bestStreak: 0,
        daysPlayed: 0,
        lifetimeScore: 0,
        lifetimeWords: 0,
        longestWordEver: run.longestWord,
        playedToday: true,
        bestTodayScore: run.score,
      };
    }
    return {
      ...current,
      playedToday: true,
      bestTodayScore: Math.max(current.bestTodayScore, run.score),
      longestWordEver:
        run.longestWord.length > current.longestWordEver.length ? run.longestWord : current.longestWordEver,
    };
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.bg.resize(gameSize.width, gameSize.height);
    if (this.content) centerFit(this.content, DESIGN_W, DESIGN_H, gameSize.width, gameSize.height);
  }

  override update(time: number, delta: number): void {
    this.bg.update(time, delta);
  }

  private build(res: SubmitResponse): void {
    this.content?.destroy();
    const c = this.add.container(0, 0);
    this.content = c;
    const run = this.run;
    const firstBuild = !this.counted;

    // Title
    const title = run.foundTrick ? 'Trick Word cracked! 🎯' : 'Run complete!';
    c.add(
      this.add
        .text(DESIGN_W / 2, 34, title, textStyle(30, hex(run.foundTrick ? COLORS.gold : COLORS.cyan)))
        .setOrigin(0.5)
    );

    // Score count-up
    c.add(this.add.text(DESIGN_W / 2, 78, 'SCORE', textStyle(14, hex(COLORS.muted), false)).setOrigin(0.5));
    const scoreText = this.add
      .text(DESIGN_W / 2, 120, firstBuild ? '0' : String(run.score), textStyle(74, hex(COLORS.gold)))
      .setOrigin(0.5);
    c.add(scoreText);
    if (firstBuild) {
      this.counted = true;
      this.tweens.addCounter({
        from: 0,
        to: run.score,
        duration: 1000,
        ease: 'Cubic.out',
        onUpdate: (t) => scoreText.setText(String(Math.round(t.getValue() ?? 0))),
      });
      SFX.unlock();
    }

    // Rank line
    const pct = res.percentile;
    const rankLine =
      res.scoreRank > 0
        ? `#${res.scoreRank} of ${res.totalPlayers} today · top ${Math.max(1, 100 - pct)}%`
        : `${res.totalPlayers} playing today`;
    c.add(this.add.text(DESIGN_W / 2, 168, rankLine, textStyle(15, hex(COLORS.cyan), false)).setOrigin(0.5));
    const sync = this.syncStatus();
    if (sync) {
      c.add(this.add.text(DESIGN_W / 2, 188, sync.label, textStyle(12, hex(sync.color), false)).setOrigin(0.5));
    }

    // Stats grid
    this.statsGrid(c, res, 206);

    // Streak panel
    this.streakPanel(c, res, 366);

    // Tomorrow teaser
    this.tomorrowTeaser(c, 450);

    // Share button
    const shareBtn = makeButton(this, {
      label: '💬 Share result to comments',
      width: 320,
      height: 56,
      color: COLORS.violet,
      textColor: '#0a0720',
      fontSize: 19,
      onClick: () => {
        void this.doShare(shareBtn.setLabel);
      },
    });
    shareBtn.setPosition(DESIGN_W / 2, 584);
    c.add(shareBtn.container);

    // Row: leaderboard + play again
    const lb = makeButton(this, {
      label: '🏆 Leaderboard',
      width: 200,
      height: 50,
      color: COLORS.cyan,
      fontSize: 18,
      onClick: () => {
        this.scene.launch('Leaderboard', { parent: 'Results' });
        this.scene.pause();
      },
    });
    lb.setPosition(DESIGN_W / 2 - 108, 646);
    const again = makeButton(this, {
      label: 'Play again',
      width: 200,
      height: 50,
      color: COLORS.gold,
      fontSize: 18,
      onClick: () => this.scene.start('Game'),
    });
    again.setPosition(DESIGN_W / 2 + 108, 646);
    c.add([lb.container, again.container]);

    // Home link
    const home = this.add
      .text(DESIGN_W / 2, 698, 'back to hub', textStyle(15, hex(COLORS.muted), false))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    home.on('pointerdown', () => {
      home.setText('updating hub...');
      const pending = Session.pendingSubmit;
      if (pending) {
        void pending.then(
          () => this.scene.start('Home'),
          () => this.scene.start('Home')
        );
      } else {
        this.scene.start('Home');
      }
    });
    c.add(home);

    centerFit(c, DESIGN_W, DESIGN_H, this.scale.width, this.scale.height);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    if (run.foundTrick && firstBuild) this.time.delayedCall(200, () => SFX.trick());
  }

  private syncStatus(): { label: string; color: number } | null {
    if (Session.submitSync === 'pending') return { label: 'syncing score with Reddit...', color: COLORS.cyan };
    if (Session.submitSync === 'failed') return { label: 'saved locally - will retry when this app opens', color: COLORS.danger };
    return null;
  }

  private statsGrid(c: Phaser.GameObjects.Container, res: SubmitResponse, top: number): void {
    const g = this.add.graphics();
    drawPanel(g, 24, top, DESIGN_W - 48, 140);
    c.add(g);
    const run = this.run;
    const cells: { label: string; value: string; color: number }[] = [
      {
        label: 'LONGEST WORD',
        value: run.longestWord ? `${run.longestWord.toUpperCase()}` : '—',
        color: COLORS.cyan,
      },
      { label: 'WORDS FOUND', value: String(run.wordsFound), color: COLORS.text },
      {
        label: 'BEST WORD',
        value: run.bestWord ? `${run.bestWord.toUpperCase()} +${run.bestWordScore}` : '—',
        color: COLORS.gold,
      },
      {
        label: 'TRICK WORD',
        value: run.foundTrick ? '✓ found' : '✗ missed',
        color: run.foundTrick ? COLORS.success : COLORS.muted,
      },
    ];
    const colW = (DESIGN_W - 48) / 2;
    cells.forEach((cell, i) => {
      const cx = 24 + (i % 2) * colW + colW / 2;
      const cy = top + 34 + Math.floor(i / 2) * 66;
      c.add(this.add.text(cx, cy - 12, cell.label, textStyle(12, hex(COLORS.muted), false)).setOrigin(0.5));
      c.add(this.add.text(cx, cy + 12, cell.value, textStyle(19, hex(cell.color))).setOrigin(0.5));
    });
    // longest word rank tag
    if (res.longestRank > 0 && run.longestWord) {
      c.add(
        this.add
          .text(24 + colW / 2, top + 34 + 30, `#${res.longestRank} longest today`, textStyle(11, hex(COLORS.violet), false))
          .setOrigin(0.5)
      );
    }
  }

  private streakPanel(c: Phaser.GameObjects.Container, res: SubmitResponse, top: number): void {
    const g = this.add.graphics();
    drawPanel(g, 24, top, DESIGN_W - 48, 62, { edge: COLORS.streak });
    c.add(g);
    c.add(
      this.add
        .text(
          44,
          top + 31,
          `🔥 ${res.profile.streak} day streak +${this.streakBoostPercent(res.profile.streak)}%`,
          textStyle(20, hex(COLORS.streak))
        )
        .setOrigin(0, 0.5)
    );
    c.add(
      this.add
        .text(DESIGN_W - 44, top + 20, `Best: ${res.profile.bestStreak}`, textStyle(13, hex(COLORS.muted), false))
        .setOrigin(1, 0.5)
    );
    c.add(
      this.add
        .text(DESIGN_W - 44, top + 42, `${res.trickFinders} cracked the trick`, textStyle(12, hex(COLORS.gold), false))
        .setOrigin(1, 0.5)
    );
  }

  private streakBoostPercent(streak: number): string {
    const pct = Math.round((dailyStreakMultiplier(streak) - 1) * 1000) / 10;
    return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  }

  private tomorrowTeaser(c: Phaser.GameObjects.Container, top: number): void {
    const tomorrowKey = addDaysUTC(this.run.date, 1);
    const tRule = getDaily(tomorrowKey).rule;
    const g = this.add.graphics();
    drawPanel(g, 24, top, DESIGN_W - 48, 104, { fill: COLORS.violetDeep, alpha: 0.25, edge: COLORS.violet });
    c.add(g);
    c.add(this.add.text(44, top + 14, '⏳ COME BACK TOMORROW', textStyle(13, hex(COLORS.violet), false)));
    c.add(this.add.text(44, top + 38, tRule.name, textStyle(19, hex(COLORS.text))).setWordWrapWidth(DESIGN_W - 88));
    c.add(
      this.add
        .text(44, top + 64, tRule.tip, textStyle(12, hex(COLORS.muted), false))
        .setWordWrapWidth(DESIGN_W - 88)
    );
  }

  private async doShare(setLabel: (s: string) => void): Promise<void> {
    setLabel('posting…');
    const run = this.run;
    const daily = Session.daily;
    const config = getDaily(run.date);
    const day = daily?.dayNumber ?? config.dayNumber;
    const rule = daily?.rule.name ?? config.rule.name;
    const longestIsTrick = run.longestWord.toLowerCase() === config.trickWord.toLowerCase();
    const longest = run.longestWord
      ? longestIsTrick
        ? "Longest word was actually today's Trick Word."
        : `Longest word: ${run.longestWord.toUpperCase()}.`
      : 'Longest word: —.';
    const text =
      `WordFall #${day} — I scored ${run.score}! ` +
      `${longest} ` +
      (run.foundTrick ? `🎯 Cracked today's Trick Word! ` : `Still hunting today's Trick Word… `) +
      `Rule: ${rule}. Can you beat my score?`;
    const res = await Net.share(text);
    if (res.ok) {
      setLabel('✓ Shared!');
      this.toast('Posted to the comments!');
    } else {
      setLabel('💬 Share result to comments');
      this.toast(Net.isMock() ? 'Preview mode — sharing works on Reddit' : 'Could not post, try again');
    }
  }

  private toast(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height - 40, msg, textStyle(16, hex(COLORS.text)))
      .setOrigin(0.5)
      .setDepth(100);
    const bg = this.add.graphics().setDepth(99);
    bg.fillStyle(COLORS.panel, 0.95);
    bg.fillRoundedRect(t.x - t.width / 2 - 16, t.y - 20, t.width + 32, 40, 12);
    this.tweens.add({
      targets: [t, bg],
      alpha: 0,
      delay: 1800,
      duration: 400,
      onComplete: () => {
        t.destroy();
        bg.destroy();
      },
    });
  }
}
