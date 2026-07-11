/**
 * Reusable UI kit for a cohesive, polished look: an animated void backdrop,
 * neon buttons, and rounded panels. Shared by every scene.
 */
import * as Phaser from 'phaser';
import { COLORS, textStyle } from './theme';
import { TEX } from './textures';
import { SFX } from './audio';

/** Animated indigo void with parallax glow blobs and drifting light motes. */
export class Background {
  private gfx: Phaser.GameObjects.Graphics;
  private blobs: Phaser.GameObjects.Image[] = [];
  private motes: Phaser.GameObjects.Image[] = [];
  private w = 0;
  private h = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(-100);

    const blobDefs = [
      { color: COLORS.violetDeep, sx: 0.2, sy: 0.25 },
      { color: COLORS.cyanDeep, sx: 0.85, sy: 0.6 },
      { color: COLORS.violet, sx: 0.5, sy: 0.9 },
    ];
    for (const b of blobDefs) {
      const img = scene.add
        .image(0, 0, TEX.glow)
        .setTint(b.color)
        .setAlpha(0.18)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-99);
      img.setData('sx', b.sx);
      img.setData('sy', b.sy);
      this.blobs.push(img);
    }

    for (let i = 0; i < 26; i++) {
      const m = scene.add
        .image(0, 0, TEX.dot)
        .setDepth(-98)
        .setAlpha(0.12 + Math.random() * 0.3)
        .setBlendMode(Phaser.BlendModes.ADD);
      m.setData('speed', 6 + Math.random() * 22);
      m.setData('drift', (Math.random() - 0.5) * 10);
      this.motes.push(m);
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.gfx.clear();
    // Vertical gradient void
    this.gfx.fillGradientStyle(
      COLORS.bgTop,
      COLORS.bgTop,
      COLORS.bgBottom,
      COLORS.bgMid,
      1,
      1,
      1,
      1
    );
    this.gfx.fillRect(0, 0, w, h);
    for (const b of this.blobs) {
      b.setPosition(w * b.getData('sx'), h * b.getData('sy'));
      b.setDisplaySize(Math.max(w, h) * 0.9, Math.max(w, h) * 0.9);
    }
    for (const m of this.motes) {
      if (m.x === 0 && m.y === 0) {
        m.setPosition(Math.random() * w, Math.random() * h);
        m.setScale(0.4 + Math.random() * 1.1);
      }
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    for (const m of this.motes) {
      m.y += m.getData('speed') * dt;
      m.x += m.getData('drift') * dt;
      if (m.y > this.h + 10) {
        m.y = -10;
        m.x = Math.random() * this.w;
      }
      // Wrap horizontally so drifting motes wander instead of piling on one edge.
      if (m.x < -12) m.x = this.w + 12;
      else if (m.x > this.w + 12) m.x = -12;
    }
    // Slow parallax float of the glow blobs so every screen feels alive.
    const t = time / 1000;
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i]!;
      const sx = (b.getData('sx') as number) ?? 0.5;
      const sy = (b.getData('sy') as number) ?? 0.5;
      b.x = this.w * sx + Math.sin(t * 0.16 + i * 1.7) * this.w * 0.07;
      b.y = this.h * sy + Math.cos(t * 0.12 + i * 2.3) * this.h * 0.05;
    }
  }
}

/**
 * Lay content out in fixed "design" coordinates, then scale + center the whole
 * container to fit any viewport. The most reliable way to stay pixel-perfect
 * from a 360px phone to a widescreen monitor.
 */
export const centerFit = (
  obj: Phaser.GameObjects.Container,
  designW: number,
  designH: number,
  w: number,
  h: number,
  maxScale = 1.15,
  padFrac = 0.94
): number => {
  const s = Math.min((w * padFrac) / designW, (h * padFrac) / designH, maxScale);
  obj.setScale(s);
  obj.setPosition((w - designW * s) / 2, (h - designH * s) / 2);
  return s;
};

export type ButtonOpts = {
  label: string;
  width: number;
  height: number;
  color?: number;
  textColor?: string;
  fontSize?: number;
  onClick: () => void;
};

export type Button = {
  container: Phaser.GameObjects.Container;
  setEnabled: (on: boolean) => void;
  setLabel: (s: string) => void;
  setPosition: (x: number, y: number) => void;
};

/** A glowing, tactile rounded button. */
export const makeButton = (scene: Phaser.Scene, opts: ButtonOpts): Button => {
  const color = opts.color ?? COLORS.cyan;
  const w = opts.width;
  const h = opts.height;
  const c = scene.add.container(0, 0);

  const glow = scene.add
    .image(0, 0, TEX.glow)
    .setTint(color)
    .setAlpha(0.3)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDisplaySize(w * 1.3, h * 2.2);

  const bg = scene.add.graphics();
  const draw = (fill: number, a: number): void => {
    bg.clear();
    bg.fillStyle(fill, a);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.lineStyle(2, COLORS.white, 0.35);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  };
  draw(color, 0.95);

  const txt = scene.add
    .text(0, 0, opts.label, textStyle(opts.fontSize ?? 22, opts.textColor ?? '#08111f'))
    .setOrigin(0.5);

  c.add([glow, bg, txt]);
  // A dedicated, centered hit rectangle keeps the tap target exactly on top of
  // the visual button. Container hit-areas can drift out of alignment when the
  // button is nested inside other scaled/positioned containers — which was
  // making taps land on the wrong button (and the whole tap area feel offset).
  const hitPad = 8;
  const hit = scene.add
    .rectangle(0, 0, w + hitPad * 2, h + hitPad * 2, 0x000000, 0.001)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  c.add(hit);
  c.setSize(w, h);

  let enabled = true;
  hit.on('pointerover', () => {
    if (!enabled) return;
    glow.setAlpha(0.55);
  });
  hit.on('pointerout', () => {
    glow.setAlpha(0.3);
  });
  hit.on('pointerdown', () => {
    if (!enabled) return;
    scene.tweens.add({ targets: bg, scaleX: 0.96, scaleY: 0.9, duration: 80, yoyo: true, ease: 'Quad.out' });
    SFX.unlock();
    SFX.click();
    opts.onClick();
  });

  return {
    container: c,
    setEnabled: (on: boolean): void => {
      enabled = on;
      c.setAlpha(on ? 1 : 0.5);
      draw(on ? color : COLORS.muted, on ? 0.95 : 0.6);
    },
    setLabel: (s: string): void => {
      txt.setText(s);
    },
    setPosition: (x: number, y: number): void => {
      c.setPosition(x, y);
    },
  };
};

/** A rounded glass panel graphic (draw into a provided or new graphics). */
export const drawPanel = (
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: number; alpha?: number; edge?: number; radius?: number }
): void => {
  const fill = opts?.fill ?? COLORS.panel;
  const alpha = opts?.alpha ?? 0.82;
  const edge = opts?.edge ?? COLORS.panelEdge;
  const r = opts?.radius ?? 20;
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1.5, edge, 0.9);
  g.strokeRoundedRect(x, y, w, h, r);
};
