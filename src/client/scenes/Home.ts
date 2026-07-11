import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, textStyle, hex } from '../theme';
import { TEX } from '../textures';
import { Background, makeButton, drawPanel, centerFit } from '../ui';
import { SFX } from '../audio';
import { Net } from '../net';
import { Session } from '../session';
import { getDaily } from '../../shared/daily';
import { dailyStreakMultiplier } from '../../shared/scoring';
import type { DailyResponse } from '../../shared/types';

const DESIGN_W = 440;
const DESIGN_H = 660;

/** The daily hub: streak, today's rule, the Trick Word puzzle, standings, Play. */
export class Home extends Scene {
  private bg!: Background;
  private content: Phaser.GameObjects.Container | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Home');
  }

  create(): void {
    const { width, height } = this.scale;
    this.bg = new Background(this);
    this.bg.resize(width, height);

    this.loadingText = this.add
      .text(width / 2, height / 2, 'loading today’s challenge…', textStyle(16, hex(COLORS.muted), false))
      .setOrigin(0.5);

    void this.loadDaily();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
  }

  private async loadDaily(): Promise<void> {
    if (Session.pendingSubmit) await Session.pendingSubmit.catch(() => null);
    const synced = await Net.retryPendingSubmits();
    const latest = synced[synced.length - 1];
    if (latest) {
      Session.lastSubmit = latest;
      Session.submitSync = 'synced';
    }
    const data = this.withFreshSubmit(await Net.getDaily());
    Session.daily = data;
    Session.config = getDaily(data.date);
    this.loadingText?.destroy();
    this.build(data);

    if (!Session.seenHowTo && localStorage.getItem('wf:seenHowto') !== '1') {
      this.time.delayedCall(250, () => this.openOverlay('HowTo'));
    }
  }

  private withFreshSubmit(data: DailyResponse): DailyResponse {
    const res = Session.lastSubmit;
    if (!res || Session.lastRun?.date !== data.date) return data;
    return {
      ...data,
      profile: res.profile,
      leaderboards: res.leaderboards,
      trickFinders: res.trickFinders,
      totalPlayers: res.totalPlayers,
    };
  }

  private openOverlay(key: string): void {
    this.scene.launch(key, { parent: 'Home' });
    this.scene.pause();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.bg.resize(gameSize.width, gameSize.height);
    if (this.content) centerFit(this.content, DESIGN_W, DESIGN_H, gameSize.width, gameSize.height);
    if (this.loadingText) this.loadingText.setPosition(gameSize.width / 2, gameSize.height / 2);
  }

  override update(time: number, delta: number): void {
    this.bg.update(time, delta);
  }

  private build(d: DailyResponse): void {
    this.content?.destroy();
    const c = this.add.container(0, 0);
    this.content = c;

    // Header
    const logoGlow = this.add
      .image(DESIGN_W / 2, 34, TEX.glow)
      .setTint(COLORS.cyan)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(340, 130);
    const logo = this.add
      .text(DESIGN_W / 2, 30, 'WORDFALL', textStyle(58, hex(COLORS.cyan)))
      .setOrigin(0.5);
    const tag = this.add
      .text(DESIGN_W / 2, 70, 'reimagine the fall', textStyle(15, hex(COLORS.muted), false))
      .setOrigin(0.5);
    c.add([logoGlow, logo, tag]);

    // Streak + players row
    const streakLabel =
      d.profile.streak > 0
        ? `🔥 ${d.profile.streak} day streak +${this.streakBoostPercent(d.profile.streak)}%`
        : '🔥 start a streak';
    c.add(this.pill(24, 96, 190, streakLabel, COLORS.streak));
    c.add(this.pill(DESIGN_W - 24 - 190, 96, 190, `👥 ${d.totalPlayers} played`, COLORS.cyan));

    // Challenge card
    this.buildChallengeCard(c, d, 138);

    // Leaderboard preview
    this.buildBoardPreview(c, d, 372);

    // Play button
    const playLabel = d.profile.playedToday ? 'PLAY AGAIN' : 'PLAY';
    const play = makeButton(this, {
      label: playLabel,
      width: 240,
      height: 66,
      color: COLORS.cyan,
      fontSize: 30,
      onClick: () => this.startGame(),
    });
    play.setPosition(DESIGN_W / 2, 566);
    c.add(play.container);
    this.tweens.add({ targets: play.container, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    if (d.profile.playedToday) {
      const best = this.add
        .text(DESIGN_W / 2, 610, `Best today: ${d.profile.bestTodayScore}`, textStyle(14, hex(COLORS.gold), false))
        .setOrigin(0.5);
      c.add(best);
    }

    // Footer: how to play + mute
    const howto = this.textLink(120, 640, 'How to play', () => this.openOverlay('HowTo'));
    c.add(howto);
    const muteText = this.add
      .text(0, 0, SFX.muted ? '🔈 Sound off' : '🔊 Sound on', textStyle(14, hex(COLORS.cyan), false))
      .setOrigin(0.5);
    const muteHit = this.add
      .rectangle(0, 0, 170, 34, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const muteC = this.add.container(DESIGN_W - 120, 640, [muteHit, muteText]);
    muteC.setSize(170, 34);
    muteHit.on('pointerover', () => muteText.setColor(hex(COLORS.text)));
    muteHit.on('pointerout', () => muteText.setColor(hex(COLORS.cyan)));
    muteHit.on('pointerdown', () => {
      SFX.unlock();
      const m = SFX.toggle();
      muteText.setText(m ? '🔈 Sound off' : '🔊 Sound on');
    });
    c.add(muteC);

    centerFit(c, DESIGN_W, DESIGN_H, this.scale.width, this.scale.height);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
  }

  private buildChallengeCard(c: Phaser.GameObjects.Container, d: DailyResponse, top: number): void {
    const g = this.add.graphics();
    drawPanel(g, 24, top, DESIGN_W - 48, 210, { edge: COLORS.violetDeep });
    c.add(g);

    c.add(this.add.text(44, top + 16, `WORDFALL #${d.dayNumber}`, textStyle(13, hex(COLORS.muted), false)));
    c.add(
      this.add
        .text(DESIGN_W - 44, top + 16, "TODAY'S RULE", textStyle(13, hex(COLORS.violet), false))
        .setOrigin(1, 0)
    );
    c.add(this.add.text(44, top + 38, d.rule.name, textStyle(24, hex(COLORS.text))));
    c.add(
      this.add.text(44, top + 70, d.rule.blurb, textStyle(15, hex(COLORS.gold), false)).setWordWrapWidth(DESIGN_W - 88)
    );

    // divider
    const div = this.add.graphics();
    div.lineStyle(1, COLORS.panelEdge, 1);
    div.lineBetween(44, top + 108, DESIGN_W - 44, top + 108);
    c.add(div);

    // Trick word puzzle
    c.add(this.add.text(44, top + 118, '🎯 TRICK WORD', textStyle(13, hex(COLORS.gold), false)));
    c.add(
      this.add
        .text(DESIGN_W - 44, top + 118, `${d.trickFinders} cracked it`, textStyle(12, hex(COLORS.muted), false))
        .setOrigin(1, 0)
    );
    // scramble tiles
    this.scrambleTiles(c, d.trickScramble, top + 148);
    c.add(
      this.add
        .text(DESIGN_W / 2, top + 188, 'unscramble it, then spell it mid-fall for a fair bonus', textStyle(12, hex(COLORS.muted), false))
        .setOrigin(0.5)
    );
  }

  private streakBoostPercent(streak: number): string {
    const pct = Math.round((dailyStreakMultiplier(streak) - 1) * 1000) / 10;
    return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  }

  private scrambleTiles(c: Phaser.GameObjects.Container, scramble: string, y: number): void {
    const letters = scramble.toUpperCase().split('');
    const size = 30;
    const gap = 6;
    const totalW = letters.length * size + (letters.length - 1) * gap;
    let x = DESIGN_W / 2 - totalW / 2 + size / 2;
    for (const ch of letters) {
      const tile = this.add.image(x, y, TEX.trickTile).setDisplaySize(size, size);
      const t = this.add.text(x, y, ch, textStyle(18, hex(COLORS.gold))).setOrigin(0.5);
      c.add([tile, t]);
      x += size + gap;
    }
  }

  private buildBoardPreview(c: Phaser.GameObjects.Container, d: DailyResponse, top: number): void {
    const g = this.add.graphics();
    drawPanel(g, 24, top, DESIGN_W - 48, 150, { edge: COLORS.cyanDeep });
    c.add(g);

    c.add(this.add.text(44, top + 14, "TODAY'S TOP SCORES", textStyle(13, hex(COLORS.cyan), false)));
    const view = this.textLink(DESIGN_W - 78, top + 20, 'Full board ›', () => this.openOverlay('Leaderboard'));
    c.add(view);

    const rows = d.leaderboards.topScore.slice(0, 3);
    if (rows.length === 0) {
      c.add(
        this.add
          .text(DESIGN_W / 2, top + 80, 'Be the first on the board!', textStyle(15, hex(COLORS.muted), false))
          .setOrigin(0.5)
      );
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      rows.forEach((r, i) => {
        const ry = top + 44 + i * 30;
        c.add(this.add.text(44, ry, medals[i] ?? '', textStyle(16, hex(COLORS.text))).setOrigin(0, 0.5));
        c.add(
          this.add
            .text(78, ry, r.username, textStyle(16, r.isYou ? hex(COLORS.gold) : hex(COLORS.text), r.isYou))
            .setOrigin(0, 0.5)
        );
        c.add(
          this.add.text(DESIGN_W - 44, ry, String(r.score), textStyle(16, hex(COLORS.gold))).setOrigin(1, 0.5)
        );
      });
    }

    const longest = d.leaderboards.longestWord[0];
    const lw = longest ? `Longest: ${longest.detail} (${longest.username})` : 'Longest word: up for grabs';
    c.add(this.add.text(44, top + 128, lw, textStyle(13, hex(COLORS.violet), false)));
  }

  private pill(x: number, y: number, w: number, label: string, color: number): Phaser.GameObjects.Container {
    const c = this.add.container(x + w / 2, y);
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.85);
    g.fillRoundedRect(-w / 2, -18, w, 36, 18);
    g.lineStyle(1.5, color, 0.7);
    g.strokeRoundedRect(-w / 2, -18, w, 36, 18);
    const t = this.add.text(0, 0, label, textStyle(15, hex(color))).setOrigin(0.5);
    c.add([g, t]);
    return c;
  }

  private textLink(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const t = this.add.text(0, 0, label, textStyle(14, hex(COLORS.cyan), false)).setOrigin(0.5);
    const hitW = Math.max(t.width + 40, 124);
    const hitH = 40;
    const hit = this.add
      .rectangle(0, 0, hitW, hitH, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    c.add([hit, t]);
    c.setSize(hitW, hitH);
    hit.on('pointerover', () => t.setColor(hex(COLORS.text)));
    hit.on('pointerout', () => t.setColor(hex(COLORS.cyan)));
    hit.on('pointerdown', () => {
      SFX.unlock();
      SFX.click();
      onClick();
    });
    return c;
  }

  private startGame(): void {
    try {
      localStorage.setItem('wf:seenHowto', '1');
    } catch {
      /* ignore */
    }
    Session.seenHowTo = true;
    this.scene.start('Game');
  }
}
