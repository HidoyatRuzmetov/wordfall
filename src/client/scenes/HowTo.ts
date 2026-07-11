import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, textStyle, hex } from '../theme';
import { TEX } from '../textures';
import { makeButton, drawPanel, centerFit } from '../ui';
import { SFX } from '../audio';

const DESIGN_W = 470;
const DESIGN_H = 690;

type OverlayData = { parent?: string };

/** First-run tutorial overlay — learn by seeing, then play. */
export class HowTo extends Scene {
  private parentKey = 'Home';
  private content: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('HowTo');
  }

  create(data: OverlayData): void {
    this.parentKey = data.parent ?? 'Home';
    const { width, height } = this.scale;

    const dim = this.add.graphics();
    dim.fillStyle(COLORS.bgBottom, 0.78);
    dim.fillRect(0, 0, width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);

    this.build();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
  }

  private onResize(g: Phaser.Structs.Size): void {
    if (this.content) centerFit(this.content, DESIGN_W, DESIGN_H, g.width, g.height);
  }

  private build(): void {
    const c = this.add.container(0, 0);
    this.content = c;

    const g = this.add.graphics();
    drawPanel(g, 0, 0, DESIGN_W, DESIGN_H, { alpha: 0.98, edge: COLORS.cyanDeep, radius: 26 });
    c.add(g);

    c.add(this.add.text(DESIGN_W / 2, 38, 'How to play', textStyle(30, hex(COLORS.cyan))).setOrigin(0.5));
    c.add(
      this.add
        .text(DESIGN_W / 2, 70, 'catch letters, build words, dodge the shards', textStyle(14, hex(COLORS.muted), false))
        .setOrigin(0.5)
    );

    const steps: { icon: () => Phaser.GameObjects.Image | Phaser.GameObjects.Container; text: string }[] = [
      {
        icon: () => this.iconImg(TEX.catcher, 54, 22),
        text: 'Drag anywhere or use the arrow keys to slide your prism and catch the falling letters.',
      },
      {
        icon: () => this.letterIcon('W'),
        text: 'Each letter you catch is added to your word. Tap SUBMIT to bank it. Longer and rarer words score more.',
      },
      {
        icon: () => this.iconImg(TEX.bonusBack, 42, 42),
        text: 'Caught a letter you do not want? The backspace button deletes the last one. Deletes are limited; grab backspace orbs for more.',
      },
      {
        icon: () => this.iconImg(TEX.bonusClear, 42, 42),
        text: 'The CLEAR button wipes your whole current word. You start with 5 clears; clear orbs add another.',
      },
      {
        icon: () => this.iconImg(TEX.trickTile, 42, 42),
        text: 'Glowing yellow tiles are Trick-Word letters. Unscramble the daily Trick Word shown up top and spell it mid-run for a big bonus.',
      },
      {
        icon: () => this.iconImg(TEX.hazard, 42, 42),
        text: 'Dodge the jagged red shards. Each one costs a heart, and the run ends early if your hearts run out.',
      },
      {
        icon: () => this.iconImg(TEX.bonusGem, 42, 42),
        text: 'Yellow gem orbs give instant bonus points.',
      },
      {
        icon: () => this.iconImg(TEX.bonusTime, 42, 42),
        text: 'Other glowing orbs can give extra time, a heart, or more deletes. Keep your daily streak alive for a small score boost.',
      },
    ];

    let y = 108;
    for (const s of steps) {
      const icon = s.icon();
      icon.setPosition(42, y + 18);
      c.add(icon);
      const t = this.add
        .text(78, y, s.text, textStyle(14, hex(COLORS.text), false))
        .setWordWrapWidth(DESIGN_W - 104);
      c.add(t);
      y += Math.max(48, t.height + 16);
    }

    const btn = makeButton(this, {
      label: 'Got it — let’s fall!',
      width: 260,
      height: 56,
      color: COLORS.cyan,
      fontSize: 22,
      onClick: () => this.close(),
    });
    btn.setPosition(DESIGN_W / 2, DESIGN_H - 42);
    c.add(btn.container);

    const fit = centerFit(c, DESIGN_W, DESIGN_H, this.scale.width, this.scale.height);
    c.setScale(fit * 0.9);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, scale: fit, duration: 220, ease: 'Back.out' });
  }

  private iconImg(tex: string, w: number, h: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, tex).setDisplaySize(w, h);
  }

  private letterIcon(ch: string, color: number = COLORS.tileText): Phaser.GameObjects.Container {
    const cc = this.add.container(0, 0);
    const tile = this.add.image(0, 0, TEX.tile).setDisplaySize(42, 42);
    const t = this.add.text(0, 0, ch, textStyle(22, hex(color))).setOrigin(0.5);
    cc.add([tile, t]);
    return cc;
  }

  private close(): void {
    SFX.click();
    try {
      localStorage.setItem('wf:seenHowto', '1');
    } catch {
      /* ignore */
    }
    this.scene.resume(this.parentKey);
    this.scene.stop();
  }
}
