import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, textStyle, hex } from '../theme';
import { makeButton, drawPanel, centerFit } from '../ui';
import { SFX } from '../audio';
import { Net } from '../net';
import { Session } from '../session';
import type { Leaderboards, LeaderboardEntry } from '../../shared/types';

const DESIGN_W = 460;
const DESIGN_H = 600;

type OverlayData = { parent?: string };

/** Full standings overlay with Top Scores / Longest Words tabs. */
export class Leaderboard extends Scene {
  private parentKey = 'Home';
  private content: Phaser.GameObjects.Container | null = null;
  private board: Leaderboards | null = null;
  private tab: 'score' | 'long' = 'score';
  private listLayer: Phaser.GameObjects.Container | null = null;
  private tabScore!: ReturnType<typeof makeButton>;
  private tabLong!: ReturnType<typeof makeButton>;
  private loadingMessage = 'loading board...';
  private alive = false;

  constructor() {
    super('Leaderboard');
  }

  create(data: OverlayData): void {
    this.alive = true;
    this.parentKey = data.parent ?? 'Home';
    const { width, height } = this.scale;

    const dim = this.add.graphics();
    dim.fillStyle(COLORS.bgBottom, 0.8);
    dim.fillRect(0, 0, width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    dim.on('pointerdown', () => this.close());

    this.build();
    void this.loadBoard();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.scale.off('resize', this.onResize, this);
    });
  }

  private async loadBoard(): Promise<void> {
    const pending = Session.pendingSubmit;
    if (pending) {
      this.loadingMessage = 'syncing your score...';
      this.renderList();
      await pending.catch(() => null);
      if (!this.alive) return;
    }
    this.loadingMessage = Session.submitSync === 'failed' ? 'retrying score sync...' : 'checking for fresh scores...';
    this.renderList();
    const retried = await Net.retryPendingSubmits();
    if (!this.alive) return;
    const latest = retried[retried.length - 1];
    if (latest) {
      Session.lastSubmit = latest;
      Session.submitSync = 'synced';
    }
    if (Session.submitSync === 'failed') {
      this.loadingMessage = 'score not synced yet';
      this.renderList();
      return;
    }
    this.loadingMessage = 'loading board...';
    this.renderList();
    const lb = await Net.getLeaderboard();
    if (!this.alive) return;
    this.board = lb;
    this.renderList();
  }

  private onResize(g: Phaser.Structs.Size): void {
    if (this.content) centerFit(this.content, DESIGN_W, DESIGN_H, g.width, g.height);
  }

  private build(): void {
    const c = this.add.container(0, 0);
    this.content = c;
    // Stop backdrop taps from closing when interacting with the card.
    const hit = this.add.zone(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H).setInteractive();
    hit.on('pointerdown', () => {});
    c.add(hit);

    const g = this.add.graphics();
    drawPanel(g, 0, 0, DESIGN_W, DESIGN_H, { alpha: 0.98, edge: COLORS.cyanDeep, radius: 26 });
    c.add(g);

    c.add(this.add.text(DESIGN_W / 2, 38, '🏆 Leaderboard', textStyle(28, hex(COLORS.gold))).setOrigin(0.5));

    const closeText = this.add.text(0, 0, '✕', textStyle(24, hex(COLORS.muted))).setOrigin(0.5);
    const closeHit = this.add
      .rectangle(0, 0, 56, 56, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const close = this.add.container(DESIGN_W - 30, 30, [closeHit, closeText]);
    close.setSize(56, 56);
    closeHit.on('pointerover', () => closeText.setColor(hex(COLORS.text)));
    closeHit.on('pointerout', () => closeText.setColor(hex(COLORS.muted)));
    closeHit.on('pointerdown', () => this.close());
    c.add(close);

    this.tabScore = makeButton(this, {
      label: 'Top Scores',
      width: 176,
      height: 44,
      color: COLORS.cyan,
      fontSize: 17,
      onClick: () => this.setTab('score'),
    });
    this.tabScore.setPosition(DESIGN_W / 2 - 96, 82);
    this.tabLong = makeButton(this, {
      label: 'Longest Words',
      width: 176,
      height: 44,
      color: COLORS.violet,
      fontSize: 17,
      onClick: () => this.setTab('long'),
    });
    this.tabLong.setPosition(DESIGN_W / 2 + 96, 82);
    c.add([this.tabScore.container, this.tabLong.container]);

    this.listLayer = this.add.container(0, 0);
    c.add(this.listLayer);
    this.renderList();

    const done = makeButton(this, {
      label: 'Close',
      width: 200,
      height: 50,
      color: COLORS.muted,
      fontSize: 18,
      onClick: () => this.close(),
    });
    done.setPosition(DESIGN_W / 2, DESIGN_H - 40);
    c.add(done.container);

    const fit = centerFit(c, DESIGN_W, DESIGN_H, this.scale.width, this.scale.height);
    c.setScale(fit * 0.92);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, scale: fit, duration: 200, ease: 'Back.out' });
    this.updateTabStyles();
  }

  private setTab(tab: 'score' | 'long'): void {
    this.tab = tab;
    this.updateTabStyles();
    this.renderList();
  }

  private updateTabStyles(): void {
    this.tabScore.setEnabled(true);
    this.tabLong.setEnabled(true);
    this.tabScore.container.setAlpha(this.tab === 'score' ? 1 : 0.72);
    this.tabLong.container.setAlpha(this.tab === 'long' ? 1 : 0.72);
  }

  private renderList(): void {
    if (!this.listLayer) return;
    this.listLayer.removeAll(true);
    const top = 118;
    const rows: LeaderboardEntry[] =
      this.tab === 'score' ? this.board?.topScore ?? [] : this.board?.longestWord ?? [];

    if (!this.board) {
      if (Session.submitSync === 'failed') {
        this.renderSyncFailed(top);
        return;
      }
      this.renderLoading(top);
      return;
    }
    if (rows.length === 0) {
      this.listLayer.add(
        this.add
          .text(DESIGN_W / 2, top + 120, 'No scores yet — be the first!', textStyle(16, hex(COLORS.muted), false))
          .setOrigin(0.5)
      );
      return;
    }

    const rowH = 38;
    const shown = rows.slice(0, 9);
    shown.forEach((r, i) => {
      const y = top + i * rowH;
      if (r.isYou) {
        const hi = this.add.graphics();
        hi.fillStyle(COLORS.gold, 0.14);
        hi.fillRoundedRect(28, y - rowH / 2 + 4, DESIGN_W - 56, rowH - 4, 10);
        this.listLayer!.add(hi);
      }
      const rankColor = r.rank <= 3 ? COLORS.gold : COLORS.muted;
      this.listLayer!.add(this.add.text(44, y, `#${r.rank}`, textStyle(16, hex(rankColor))).setOrigin(0, 0.5));
      this.listLayer!.add(
        this.add
          .text(96, y, r.username + (r.isYou ? ' (you)' : ''), textStyle(16, r.isYou ? hex(COLORS.gold) : hex(COLORS.text), r.isYou))
          .setOrigin(0, 0.5)
      );
      const valueText = this.tab === 'score' ? String(r.score) : r.detail;
      this.listLayer!.add(
        this.add.text(DESIGN_W - 44, y, valueText, textStyle(16, hex(COLORS.cyan))).setOrigin(1, 0.5)
      );
    });
  }

  private renderSyncFailed(top: number): void {
    if (!this.listLayer) return;
    const y = top + 104;
    this.listLayer.add(
      this.add.text(DESIGN_W / 2, y, this.loadingMessage, textStyle(17, hex(COLORS.danger), false)).setOrigin(0.5)
    );
    this.listLayer.add(
      this.add
        .text(
          DESIGN_W / 2,
          y + 38,
          'This run is saved locally and will retry when the app opens.',
          textStyle(12, hex(COLORS.muted), false)
        )
        .setOrigin(0.5)
    );
    this.listLayer.add(
      this.add
        .text(DESIGN_W / 2, y + 62, 'Fresh ranks are paused until Reddit confirms it.', textStyle(12, hex(COLORS.muted), false))
        .setOrigin(0.5)
    );
  }

  private renderLoading(top: number): void {
    if (!this.listLayer) return;
    const y = top + 104;
    this.listLayer.add(
      this.add.text(DESIGN_W / 2, y, this.loadingMessage, textStyle(16, hex(COLORS.cyan), false)).setOrigin(0.5)
    );
    for (let i = 0; i < 3; i++) {
      const dot = this.add.circle(DESIGN_W / 2 - 18 + i * 18, y + 34, 5, COLORS.cyan, 1).setAlpha(0.35);
      this.tweens.add({
        targets: dot,
        alpha: 1,
        scale: 1.35,
        duration: 420,
        delay: i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      this.listLayer.add(dot);
    }
    this.listLayer.add(
      this.add
        .text(DESIGN_W / 2, y + 68, 'fresh ranks will appear as soon as Reddit confirms it', textStyle(12, hex(COLORS.muted), false))
        .setOrigin(0.5)
    );
  }

  private close(): void {
    SFX.click();
    this.scene.resume(this.parentKey);
    this.scene.stop();
  }
}
