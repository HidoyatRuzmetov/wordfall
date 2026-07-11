import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, textStyle, hex } from '../theme';
import { TEX } from '../textures';
import { Background, makeButton, type Button } from '../ui';
import { SFX } from '../audio';
import { computeLayout, type Layout } from '../layout';
import { Session } from '../session';
import { getDaily, dateKeyUTC, makeSpawner, type Spawn, type BonusType } from '../../shared/daily';
import { isWord, dictReady } from '../dict';
import { scoreWord, nextCombo, comboMultiplier } from '../../shared/scoring';
import type { DailyConfig, RunResult } from '../../shared/types';

type Falling = {
  root: Phaser.GameObjects.Container;
  kind: Spawn['kind'];
  letter: string;
  bonus: BonusType | null;
  isTrick: boolean;
  x: number;
  y: number;
  r: number; // radius for collision
  speed: number;
  spin: number;
  dead: boolean;
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export class Game extends Scene {
  private bg!: Background;
  private layout!: Layout;
  private config!: DailyConfig;
  private spawner!: { next: () => Spawn };

  // world
  private worldLayer!: Phaser.GameObjects.Container;
  private catcher!: Phaser.GameObjects.Container;
  private catcherBody!: Phaser.GameObjects.Image;
  private catcherGlow!: Phaser.GameObjects.Image;
  private objects: Falling[] = [];
  private targetX = 0;
  private tileSize = 48;
  private catcherHalf = 90;

  // state
  private running = false;
  private paused = false;
  private score = 0;
  private combo = 0;
  private hearts = 3;
  private backs = 5;
  private clears = 5;
  private dailyStreak = 0;
  private timeLeftMs = 120000;
  private word = '';
  private wordsFound = 0;
  private longestWord = '';
  private bestWord = '';
  private bestWordScore = 0;
  private foundTrick = false;
  private spawnAcc = 0;
  private lastSpawnX = -9999;
  private lastWholeSecond = 999;

  // hud
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private heartsText!: Phaser.GameObjects.Text;
  private ruleChip!: Phaser.GameObjects.Container;
  private trickChip!: Phaser.GameObjects.Container;
  private forge!: Phaser.GameObjects.Container;
  private wordRow!: Phaser.GameObjects.Container;
  private submitBtn!: Button;
  private deleteBtn!: Button;
  private clearBtn!: Button;
  private pauseBtn!: Phaser.GameObjects.Container;
  private hudTop!: Phaser.GameObjects.Container;
  private pauseOverlay: Phaser.GameObjects.Container | null = null;

  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
    back: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('Game');
  }

  create(): void {
    this.config = Session.config ?? getDaily(dateKeyUTC());
    this.spawner = makeSpawner(this.config);

    this.resetState();

    const { width, height } = this.scale;
    this.layout = computeLayout(width, height);
    this.bg = new Background(this);
    this.bg.resize(width, height);

    this.worldLayer = this.add.container(0, 0);

    this.buildCatcher();
    this.buildHud();
    this.layoutAll();

    this.setupInput();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    // Ready countdown then go.
    this.startCountdown();
  }

  private resetState(): void {
    this.objects = [];
    this.running = false;
    this.paused = false;
    this.score = 0;
    this.combo = 0;
    this.hearts = this.config.startHearts;
    this.backs = this.config.startBacks;
    this.clears = this.config.startClears;
    this.dailyStreak = Session.lastSubmit?.profile.streak ?? Session.daily?.profile.streak ?? 0;
    this.timeLeftMs = this.config.durationSec * 1000;
    this.word = '';
    this.wordsFound = 0;
    this.longestWord = '';
    this.bestWord = '';
    this.bestWordScore = 0;
    this.foundTrick = false;
    this.spawnAcc = 0;
    this.lastSpawnX = -9999;
    this.lastWholeSecond = this.config.durationSec + 1;
  }

  /* ----------------------------- build ----------------------------- */

  private buildCatcher(): void {
    this.catcherGlow = this.add
      .image(0, 0, TEX.glow)
      .setTint(COLORS.cyan)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.catcherBody = this.add.image(0, 0, TEX.catcher).setOrigin(0.5);
    this.catcher = this.add.container(0, 0, [this.catcherGlow, this.catcherBody]);
    this.catcher.setDepth(20);
  }

  private buildHud(): void {
    // Top HUD
    this.hudTop = this.add.container(0, 0).setDepth(30);
    this.heartsText = this.add.text(0, 0, '', textStyle(22, hex(COLORS.heart))).setOrigin(0, 0.5);
    this.timeText = this.add.text(0, 0, '', textStyle(30, hex(COLORS.text))).setOrigin(0.5);
    this.scoreText = this.add.text(0, 0, '0', textStyle(28, hex(COLORS.gold))).setOrigin(1, 0.5);
    this.comboText = this.add.text(0, 0, '', textStyle(15, hex(COLORS.streak))).setOrigin(1, 0.5);
    this.hudTop.add([this.heartsText, this.timeText, this.scoreText, this.comboText]);
    // Show the real configured duration immediately (e.g. 2:00) instead of a
    // hardcoded placeholder, so the timer is correct during the 3-2-1 countdown.
    this.updateTimeText();

    // Rule + trick chips
    this.ruleChip = this.makeChip(this.config.rule.name, COLORS.violet);
    this.trickChip = this.makeChip(`🎯 ${this.config.trickScramble}`, COLORS.gold);
    this.ruleChip.setDepth(30);
    this.trickChip.setDepth(30);

    // Pause button
    this.pauseBtn = this.add.container(0, 0).setDepth(30);
    const pauseHit = this.add
      .rectangle(0, 0, 58, 58, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const pg = this.add.graphics();
    pg.fillStyle(COLORS.panel, 0.85);
    pg.fillRoundedRect(-18, -18, 36, 36, 10);
    pg.lineStyle(1.5, COLORS.panelEdge, 1);
    pg.strokeRoundedRect(-18, -18, 36, 36, 10);
    pg.fillStyle(COLORS.text, 1);
    pg.fillRect(-6, -8, 4, 16);
    pg.fillRect(2, -8, 4, 16);
    this.pauseBtn.add([pauseHit, pg]);
    this.pauseBtn.setSize(58, 58);
    pauseHit.on('pointerdown', () => this.togglePause());

    // Word forge (bottom)
    this.forge = this.add.container(0, 0).setDepth(30);
    this.wordRow = this.add.container(0, 0);
    this.forge.add(this.wordRow);

    this.submitBtn = makeButton(this, {
      label: 'SUBMIT',
      width: 150,
      height: 52,
      color: COLORS.cyan,
      onClick: () => this.submitWord(),
    });
    this.deleteBtn = makeButton(this, {
      label: '⌫',
      width: 96,
      height: 52,
      color: COLORS.back,
      textColor: '#0a0720',
      onClick: () => this.deleteLetter(),
    });
    this.clearBtn = makeButton(this, {
      label: 'CLEAR',
      width: 104,
      height: 52,
      color: COLORS.clear,
      textColor: '#0a0720',
      fontSize: 18,
      onClick: () => this.clearWord(),
    });
    this.submitBtn.container.setDepth(30);
    this.deleteBtn.container.setDepth(30);
    this.clearBtn.container.setDepth(30);

    this.renderWord();
    this.updateHud();
  }

  private makeChip(label: string, color: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const txt = this.add.text(0, 0, label, textStyle(14, hex(color))).setOrigin(0.5);
    const w = txt.width + 26;
    const h = 30;
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.85);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(1.5, color, 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add([g, txt]);
    c.setSize(w, h);
    return c;
  }

  /* ---------------------------- layout ----------------------------- */

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.layout = computeLayout(gameSize.width, gameSize.height);
    this.bg.resize(gameSize.width, gameSize.height);
    this.layoutAll();
  }

  private layoutAll(): void {
    const L = this.layout;
    this.tileSize = clamp(L.field.w * 0.11, 30, 50);
    this.catcherHalf = this.tileSize * 1.4;

    // Catcher
    const catcherY = L.field.y + L.field.h - this.tileSize * 0.8;
    const cw = this.catcherHalf * 2;
    this.catcher.setPosition(clamp(this.catcher.x || L.cx, L.field.x + this.catcherHalf, L.field.x + L.field.w - this.catcherHalf), catcherY);
    this.catcherBody.setDisplaySize(cw, cw * 0.36);
    this.catcherGlow.setDisplaySize(cw * 1.2, cw * 0.6);
    if (!this.running) this.targetX = this.catcher.x;

    // Top HUD
    const pad = L.pad;
    const topY = L.topBarH / 2;
    this.heartsText.setPosition(pad + 6, topY).setFontSize(Math.round(22 * L.s));
    this.timeText.setPosition(L.cx, topY).setFontSize(Math.round(30 * L.s));
    this.scoreText.setPosition(L.w - pad - 6, topY - 8 * L.s).setFontSize(Math.round(26 * L.s));
    this.comboText.setPosition(L.w - pad - 6, topY + 14 * L.s).setFontSize(Math.round(14 * L.s));

    // Chips just under the top bar
    this.ruleChip.setPosition(L.pad + this.ruleChip.width / 2, L.topBarH + 16 * L.s);
    this.trickChip.setPosition(L.w - L.pad - this.trickChip.width / 2, L.topBarH + 16 * L.s);
    const chipScale = clamp(L.s, 0.8, 1.1);
    this.ruleChip.setScale(chipScale);
    this.trickChip.setScale(chipScale);

    this.pauseBtn.setPosition(L.w - pad - 18, topY);
    this.pauseBtn.setScale(clamp(L.s, 0.85, 1.15));
    // move score left of pause on small screens
    this.scoreText.setX(L.w - pad - 44 * L.s);
    this.comboText.setX(L.w - pad - 44 * L.s);

    // Bottom forge band
    const bandY = L.h - L.bottomBarH;
    const btnScale = clamp(L.s, 0.85, 1.15);
    this.wordRow.setPosition(L.cx, bandY + 30 * L.s);
    this.submitBtn.container.setScale(btnScale);
    this.deleteBtn.container.setScale(btnScale);
    this.clearBtn.container.setScale(btnScale);
    const btnY = L.h - 34 * L.s;
    const deleteW = 96 * btnScale;
    const clearW = 104 * btnScale;
    const submitW = 150 * btnScale;
    const gap = 10 * btnScale;
    const groupW = deleteW + clearW + submitW + gap * 2;
    const startX = L.cx - groupW / 2;
    this.deleteBtn.setPosition(startX + deleteW / 2, btnY);
    this.clearBtn.setPosition(startX + deleteW + gap + clearW / 2, btnY);
    this.submitBtn.setPosition(startX + deleteW + gap + clearW + gap + submitW / 2, btnY);
    this.renderWord();
  }

  /* ----------------------------- input ----------------------------- */

  private setupInput(): void {
    const track = (p: Phaser.Input.Pointer): void => {
      if (!this.running || this.paused || !this.inField(p)) return;
      this.targetX = this.clampCatcher(p.x);
      this.catcher.x = this.targetX; // 1:1 finger tracking — no lag
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      SFX.unlock();
      track(p);
    });
    this.input.on('pointermove', track);

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
        back: kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE),
      };
    }
  }

  private inField(p: Phaser.Input.Pointer): boolean {
    // Generous band: steer from most of the screen, not just a narrow strip.
    return p.y >= this.layout.field.y - 30 && p.y <= this.layout.field.y + this.layout.field.h + 60;
  }

  private clampCatcher(x: number): number {
    const L = this.layout;
    return clamp(x, L.field.x + this.catcherHalf, L.field.x + L.field.w - this.catcherHalf);
  }

  /* --------------------------- countdown --------------------------- */

  private startCountdown(): void {
    const L = this.layout;
    let n = 3;
    const label = this.add
      .text(L.cx, L.field.cy, '3', textStyle(96, hex(COLORS.cyan)))
      .setOrigin(0.5)
      .setDepth(60);
    SFX.unlock();
    const step = (): void => {
      if (n === 0) {
        label.destroy();
        this.running = true;
        SFX.levelStart();
        return;
      }
      label.setText(String(n));
      label.setScale(0.4);
      label.setAlpha(1);
      SFX.tick();
      this.tweens.add({ targets: label, scale: 1.2, alpha: 0.2, duration: 700, ease: 'Quad.out' });
      n--;
      this.time.delayedCall(700, step);
    };
    step();
  }

  /* --------------------------- main loop --------------------------- */

  override update(_time: number, delta: number): void {
    this.bg.update(_time, delta);
    if (!this.running || this.paused) return;
    const dt = Math.min(delta, 50) / 1000;

    this.handleKeys(dt);
    this.tickTimer(delta);
    this.moveCatcher(dt);
    this.spawnStep(dt);
    this.updateObjects(dt);
  }

  private handleKeys(dt: number): void {
    if (!this.keys) return;
    const speed = this.layout.field.w * 1.5 * dt;
    if (this.keys.left.isDown || this.keys.a.isDown) this.targetX = this.clampCatcher(this.catcher.x - speed);
    if (this.keys.right.isDown || this.keys.d.isDown) this.targetX = this.clampCatcher(this.catcher.x + speed);
    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) || Phaser.Input.Keyboard.JustDown(this.keys.space))
      this.submitWord();
    if (Phaser.Input.Keyboard.JustDown(this.keys.back)) this.deleteLetter();
  }

  private tickTimer(delta: number): void {
    this.timeLeftMs -= delta;
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      this.updateTimeText();
      this.endRun('time');
      return;
    }
    const sec = Math.ceil(this.timeLeftMs / 1000);
    if (sec !== this.lastWholeSecond) {
      this.lastWholeSecond = sec;
      this.updateTimeText();
      if (sec <= 10) {
        SFX.tick();
        this.tweens.add({ targets: this.timeText, scale: 1.25, duration: 120, yoyo: true });
        this.timeText.setColor(hex(COLORS.danger));
      }
    }
  }

  private moveCatcher(dt: number): void {
    const k = 1 - Math.pow(0.00003, dt); // snappy, framerate-independent follow
    this.catcher.x += (this.targetX - this.catcher.x) * k;
    this.catcher.x = this.clampCatcher(this.catcher.x);
  }

  private spawnStep(dt: number): void {
    const progress = 1 - this.timeLeftMs / (this.config.durationSec * 1000);
    const ramp = progress * progress * (3 - 2 * progress);
    const interval = 1.15 - ramp * 0.25; // seconds between spawns
    this.spawnAcc += dt;
    if (this.spawnAcc >= interval) {
      this.spawnAcc -= interval;
      this.spawnOne(ramp);
    }
  }

  private spawnOne(ramp: number): void {
    const s = this.spawner.next();
    const L = this.layout;
    const fallTime = 3.9 - ramp * 1.1; // seconds top->bottom
    const speed = L.field.h / fallTime;
    let x = L.field.x + this.tileSize + Math.random() * (L.field.w - this.tileSize * 2);
    // Keep a catcher-width lane open between back-to-back objects so there's
    // always room to weave through and dodge.
    const minSep = this.catcherHalf * 1.7;
    if (Math.abs(x - this.lastSpawnX) < minSep) {
      const lo = L.field.x + this.tileSize;
      const hi = L.field.x + L.field.w - this.tileSize;
      x = clamp(this.lastSpawnX < L.cx ? this.lastSpawnX + minSep : this.lastSpawnX - minSep, lo, hi);
    }
    this.lastSpawnX = x;
    const y = L.field.y - this.tileSize;

    const root = this.add.container(x, y).setDepth(10);
    this.worldLayer.add(root);

    const obj: Falling = {
      root,
      kind: s.kind,
      letter: s.kind === 'letter' ? s.letter : '',
      bonus: s.kind === 'bonus' ? s.bonus : null,
      isTrick: s.kind === 'letter' ? s.isTrick : false,
      x,
      y,
      r: this.tileSize * 0.5,
      speed,
      spin: (Math.random() - 0.5) * 2,
      dead: false,
    };

    if (s.kind === 'letter') this.decorateLetter(obj);
    else if (s.kind === 'hazard') this.decorateHazard(obj);
    else this.decorateBonus(obj, s.bonus);

    this.objects.push(obj);
  }

  private decorateLetter(o: Falling): void {
    const size = this.tileSize * 1.3;
    const glow = this.add
      .image(0, 0, o.isTrick ? TEX.glowGold : TEX.glow)
      .setTint(o.isTrick ? COLORS.gold : COLORS.cyan)
      .setAlpha(o.isTrick ? 0.6 : 0.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(size * 1.4, size * 1.4);
    const tile = this.add.image(0, 0, o.isTrick ? TEX.trickTile : TEX.tile).setDisplaySize(size, size);
    const letter = this.add
      .text(0, 0, o.letter, textStyle(this.tileSize * 0.86, hex(COLORS.tileText)))
      .setOrigin(0.5);
    o.root.add([glow, tile, letter]);
    if (o.isTrick) this.tweens.add({ targets: glow, alpha: 0.9, duration: 500, yoyo: true, repeat: -1 });
  }

  private decorateHazard(o: Falling): void {
    const size = this.tileSize * 1.35;
    const glow = this.add
      .image(0, 0, TEX.glowRed)
      .setTint(COLORS.hazard)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(size * 1.4, size * 1.4);
    const shard = this.add.image(0, 0, TEX.hazard).setDisplaySize(size, size);
    o.root.add([glow, shard]);
    this.tweens.add({ targets: glow, alpha: 0.85, duration: 300, yoyo: true, repeat: -1 });
  }

  private decorateBonus(o: Falling, bonus: BonusType): void {
    const size = this.tileSize * 1.25;
    const tex =
      bonus === 'heart'
        ? TEX.bonusHeart
        : bonus === 'time'
          ? TEX.bonusTime
          : bonus === 'back'
            ? TEX.bonusBack
            : bonus === 'clear'
              ? TEX.bonusClear
              : TEX.bonusGem;
    const color =
      bonus === 'heart'
        ? COLORS.heart
        : bonus === 'time'
          ? COLORS.time
          : bonus === 'back'
            ? COLORS.back
            : bonus === 'clear'
              ? COLORS.clear
              : COLORS.gem;
    const glow = this.add
      .image(0, 0, TEX.glow)
      .setTint(color)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(size * 1.5, size * 1.5);
    const orb = this.add.image(0, 0, tex).setDisplaySize(size, size);
    o.root.add([glow, orb]);
    this.tweens.add({ targets: orb, scale: orb.scale * 1.12, duration: 500, yoyo: true, repeat: -1 });
  }

  private updateObjects(dt: number): void {
    const L = this.layout;
    const catcherY = this.catcher.y;
    const bottom = L.field.y + L.field.h;
    for (const o of this.objects) {
      if (o.dead) continue;
      o.y += o.speed * dt;
      o.root.y = o.y;
      if (o.kind !== 'bonus') o.root.rotation += o.spin * dt * (o.kind === 'hazard' ? 1.4 : 0.4);

      // Catch test near the catcher band
      if (!o.dead && o.y + o.r >= catcherY - this.tileSize * 0.5 && o.y - o.r <= catcherY + this.tileSize * 0.5) {
        if (Math.abs(o.x - this.catcher.x) <= this.catcherHalf + o.r * 0.6) {
          this.collect(o);
          continue;
        }
      }
      if (o.y - o.r > bottom + 20) this.kill(o);
    }
    this.objects = this.objects.filter((o) => !o.dead);
  }

  private kill(o: Falling): void {
    o.dead = true;
    o.root.destroy();
  }

  /* --------------------------- collection -------------------------- */

  private collect(o: Falling): void {
    if (o.kind === 'letter') {
      this.word += o.letter.toLowerCase();
      SFX.collect(this.combo);
      this.burst(o.x, o.y, o.isTrick ? COLORS.gold : COLORS.cyan, o.isTrick ? 14 : 8);
      this.popCatcher();
      this.renderWord();
    } else if (o.kind === 'hazard') {
      this.hitHazard(o);
    } else if (o.bonus) {
      this.applyBonus(o.bonus, o.x, o.y);
    }
    this.kill(o);
  }

  private hitHazard(o: Falling): void {
    this.hearts -= 1;
    SFX.hazard();
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(160, 90, 12, 40);
    this.burst(o.x, o.y, COLORS.hazard, 16);
    this.updateHud();
    this.tweens.add({ targets: this.heartsText, scale: 1.4, duration: 120, yoyo: true });
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.updateHud();
      this.endRun('hearts');
    }
  }

  private applyBonus(bonus: BonusType, x: number, y: number): void {
    SFX.bonus();
    let label: string;
    let color: number;
    if (bonus === 'heart') {
      this.hearts = Math.min(this.hearts + 1, 5);
      label = '+1 ♥';
      color = COLORS.heart;
    } else if (bonus === 'time') {
      this.timeLeftMs += 5000;
      label = '+5s';
      color = COLORS.time;
    } else if (bonus === 'back') {
      this.backs += 1;
      label = '+1 ⌫';
      color = COLORS.back;
    } else if (bonus === 'clear') {
      this.clears += 1;
      label = '+1 CLEAR';
      color = COLORS.clear;
    } else {
      this.score += 25;
      label = '+25';
      color = COLORS.gem;
    }
    this.burst(x, y, color, 12);
    this.floatText(x, y, label, color);
    this.updateHud();
    this.updateTimeText();
  }

  /* --------------------------- word logic -------------------------- */

  private deleteLetter(): void {
    if (!this.running || this.paused) return;
    if (this.word.length === 0) return;
    if (this.backs <= 0) {
      this.flashForge(COLORS.danger);
      return;
    }
    this.backs -= 1;
    this.word = this.word.slice(0, -1);
    SFX.click();
    this.renderWord();
    this.updateHud();
  }

  private clearWord(): void {
    if (!this.running || this.paused) return;
    if (this.word.length === 0) return;
    if (this.clears <= 0) {
      this.flashForge(COLORS.danger);
      return;
    }
    this.clears -= 1;
    this.word = '';
    SFX.click();
    this.renderWord();
    this.updateHud();
  }

  private submitWord(): void {
    if (!this.running || this.paused) return;
    const w = this.word;
    if (w.length < 3) {
      this.flashForge(COLORS.danger);
      this.floatText(this.layout.cx, this.layout.h - this.layout.bottomBarH - 10, '3+ letters!', COLORS.danger);
      return;
    }
    if (!dictReady()) {
      this.floatText(this.layout.cx, this.layout.h - this.layout.bottomBarH - 20, 'loading words…', COLORS.muted);
      return;
    }
    if (isWord(w)) {
      const isTrick = w === this.config.trickWord.toLowerCase() && !this.foundTrick;
      const res = scoreWord(w, {
        rule: this.config.rule,
        comboStreak: this.combo,
        dailyStreak: this.dailyStreak,
        isTrick,
      });
      this.score += res.points;
      this.wordsFound += 1;
      this.combo = nextCombo(this.combo, true, this.config.rule);
      if (w.length > this.longestWord.length) this.longestWord = w;
      if (res.points > this.bestWordScore) {
        this.bestWord = w;
        this.bestWordScore = res.points;
      }
      if (isTrick) {
        this.foundTrick = true;
        this.celebrateTrick(res.points);
      } else {
        SFX.submitGood(res.multiplier);
        this.floatText(this.layout.cx, this.layout.h - this.layout.bottomBarH - 20, `+${res.points}`, COLORS.success, res.tags[0]);
        this.flashForge(COLORS.success);
      }
      this.burstForge(isTrick ? COLORS.gold : COLORS.success, isTrick ? 26 : 14);
    } else {
      SFX.submitBad();
      this.flashForge(COLORS.danger);
      this.floatText(this.layout.cx, this.layout.h - this.layout.bottomBarH - 20, 'word not detected', COLORS.danger);
      this.updateHud();
      return;
    }
    this.word = '';
    this.renderWord();
    this.updateHud();
  }

  private celebrateTrick(points: number): void {
    SFX.trick();
    const L = this.layout;
    this.cameras.main.flash(300, 90, 70, 10);
    const banner = this.add
      .text(L.cx, L.field.cy, 'TRICK WORD!', textStyle(Math.round(46 * L.s), hex(COLORS.gold)))
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.3);
    const sub = this.add
      .text(L.cx, L.field.cy + 42 * L.s, `+${points}`, textStyle(Math.round(30 * L.s), hex(COLORS.text)))
      .setOrigin(0.5)
      .setDepth(70)
      .setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: 'Back.out' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({
      targets: [banner, sub],
      alpha: 0,
      duration: 500,
      delay: 1100,
      onComplete: () => {
        banner.destroy();
        sub.destroy();
      },
    });
    // gold shower
    for (let i = 0; i < 30; i++) {
      const p = this.add
        .image(L.cx + (Math.random() - 0.5) * 120, L.field.cy, TEX.dotGold)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(69)
        .setScale(0.5 + Math.random());
      this.tweens.add({
        targets: p,
        y: p.y + 200 + Math.random() * 200,
        x: p.x + (Math.random() - 0.5) * 300,
        alpha: 0,
        duration: 900 + Math.random() * 600,
        onComplete: () => p.destroy(),
      });
    }
    // update trick chip to solved
    this.trickChip.list.forEach((g) => {
      if (g instanceof Phaser.GameObjects.Text) g.setText('🎯 SOLVED');
    });
  }

  /* ------------------------------ hud ------------------------------ */

  private renderWord(): void {
    this.wordRow.removeAll(true);
    const L = this.layout;
    const size = clamp(30 * L.s, 24, 40);
    const gap = 6 * L.s;
    const letters = this.word.toUpperCase().split('');
    const maxTiles = Math.max(4, Math.floor((L.contentW - 40) / (size + gap)));
    const shown = letters.length > maxTiles ? letters.slice(letters.length - maxTiles) : letters;
    const truncated = letters.length > maxTiles;

    if (shown.length === 0) {
      const hint = this.add
        .text(0, 0, 'catch letters to spell a word', textStyle(Math.round(13 * L.s), hex(COLORS.muted), false))
        .setOrigin(0.5);
      this.wordRow.add(hint);
      return;
    }

    const totalW = shown.length * size + (shown.length - 1) * gap;
    let x = -totalW / 2 + size / 2;
    shown.forEach((ch, i) => {
      const tile = this.add.image(x, 0, TEX.tile).setDisplaySize(size, size);
      const t = this.add.text(x, 0, ch, textStyle(Math.round(size * 0.6), hex(COLORS.tileText))).setOrigin(0.5);
      this.wordRow.add([tile, t]);
      if (i === shown.length - 1 && !truncated) {
        tile.setScale((size / 120) * 0.4);
        this.tweens.add({ targets: tile, scaleX: size / 120, scaleY: size / 120, duration: 160, ease: 'Back.out' });
      }
      x += size + gap;
    });
  }

  private updateHud(): void {
    this.heartsText.setText('♥'.repeat(Math.max(0, this.hearts)) + '·'.repeat(Math.max(0, 3 - this.hearts)));
    this.scoreText.setText(String(Math.max(0, Math.round(this.score))));
    const mult = comboMultiplier(this.combo);
    this.comboText.setText(this.combo >= 1 ? `combo x${mult.toFixed(1)}` : '');
    this.deleteBtn.setLabel(`⌫ ${this.backs}`);
    this.deleteBtn.setEnabled(this.backs > 0);
    this.clearBtn.setLabel(`CLEAR ${this.clears}`);
    this.clearBtn.setEnabled(this.clears > 0);
  }

  private updateTimeText(): void {
    const total = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    this.timeText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    if (total > 10) this.timeText.setColor(hex(COLORS.text));
  }

  /* ---------------------------- effects ---------------------------- */

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random();
      const sp = 60 + Math.random() * 140;
      const p = this.add
        .image(x, y, TEX.dot)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(40)
        .setScale(0.5 + Math.random());
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * sp,
        y: y + Math.sin(a) * sp,
        alpha: 0,
        scale: 0,
        duration: 400 + Math.random() * 300,
        onComplete: () => p.destroy(),
      });
    }
    const ring = this.add
      .image(x, y, TEX.ring)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(40)
      .setDisplaySize(this.tileSize, this.tileSize);
    this.tweens.add({
      targets: ring,
      displayWidth: this.tileSize * 3,
      displayHeight: this.tileSize * 3,
      alpha: 0,
      duration: 340,
      onComplete: () => ring.destroy(),
    });
  }

  private burstForge(color: number, count: number): void {
    const L = this.layout;
    this.burst(L.cx, L.h - L.bottomBarH + 24 * L.s, color, count);
  }

  private popCatcher(): void {
    this.tweens.add({ targets: this.catcher, scaleY: 1.18, scaleX: 0.94, duration: 90, yoyo: true });
    this.catcherGlow.setAlpha(0.9);
    this.tweens.add({ targets: this.catcherGlow, alpha: 0.5, duration: 200 });
  }

  private floatText(x: number, y: number, text: string, color: number, sub?: string): void {
    const label = sub ? `${text}  ${sub}` : text;
    const t = this.add
      .text(x, y, label, textStyle(Math.round(22 * this.layout.s), hex(color)))
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private flashForge(color: number): void {
    const L = this.layout;
    const g = this.add.graphics().setDepth(25);
    g.fillStyle(color, 0.18);
    g.fillRoundedRect(L.cx - L.contentW / 2, L.h - L.bottomBarH, L.contentW, L.bottomBarH - 6, 18);
    this.tweens.add({ targets: g, alpha: 0, duration: 320, onComplete: () => g.destroy() });
  }

  /* ----------------------------- pause ----------------------------- */

  private togglePause(): void {
    if (!this.running) return;
    this.paused = !this.paused;
    SFX.click();
    if (this.paused) this.showPause();
    else this.hidePause();
  }

  private showPause(): void {
    const L = this.layout;
    const c = this.add.container(0, 0).setDepth(80);
    const g = this.add.graphics();
    g.fillStyle(COLORS.bgBottom, 0.82);
    g.fillRect(0, 0, L.w, L.h);
    const title = this.add.text(L.cx, L.h * 0.36, 'Paused', textStyle(40, hex(COLORS.cyan))).setOrigin(0.5);
    c.add([g, title]);
    const resume = makeButton(this, {
      label: 'Resume',
      width: 200,
      height: 56,
      color: COLORS.cyan,
      onClick: () => this.togglePause(),
    });
    resume.setPosition(L.cx, L.h * 0.5);
    const quit = makeButton(this, {
      label: 'Quit to Home',
      width: 200,
      height: 52,
      color: COLORS.muted,
      onClick: () => {
        this.running = false;
        this.scene.start('Home');
      },
    });
    quit.setPosition(L.cx, L.h * 0.5 + 70);
    c.add([resume.container, quit.container]);
    this.pauseOverlay = c;
  }

  private hidePause(): void {
    this.pauseOverlay?.destroy();
    this.pauseOverlay = null;
  }

  /* ------------------------------ end ------------------------------ */

  private endRun(reason: 'time' | 'hearts'): void {
    if (!this.running) return;
    this.running = false;
    for (const o of this.objects) o.root.destroy();
    this.objects = [];

    const result: RunResult = {
      id: this.makeRunId(),
      date: this.config.date,
      score: Math.max(0, Math.round(this.score)),
      longestWord: this.longestWord,
      wordsFound: this.wordsFound,
      foundTrick: this.foundTrick,
      bestWord: this.bestWord,
      bestWordScore: this.bestWordScore,
    };
    Session.lastRun = result;

    // A positive, score-focused finish — never framed as a loss.
    const L = this.layout;
    const banner = this.add
      .text(L.cx, L.field.cy, reason === 'time' ? "TIME'S UP!" : 'RUN COMPLETE!', textStyle(Math.round(52 * L.s), hex(COLORS.cyan)))
      .setOrigin(0.5)
      .setDepth(90)
      .setScale(0.4);
    this.tweens.add({ targets: banner, scale: 1, duration: 380, ease: 'Back.out' });
    this.cameras.main.flash(320, 90, 200, 255);
    this.time.delayedCall(900, () => this.scene.start('Results'));
  }

  private makeRunId(): string {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${this.config.date}-${Date.now().toString(36)}-${rand}`;
  }
}
