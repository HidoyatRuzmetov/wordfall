/**
 * Procedural art for WordFall. Everything is generated at runtime — no sprite
 * sheets — which keeps the bundle tiny and gives the game a cohesive,
 * hand-made neon identity (glowing glyph tiles, jagged danger shards, a prism
 * catcher, soft particles). Generated once in Boot and shared across scenes.
 */
import { COLORS } from './theme';

const TILE = 120; // base tile texture size (scaled down in play)

/** Soft radial dot via a canvas gradient — used for glows, particles, bloom. */
const softDot = (
  scene: Phaser.Scene,
  key: string,
  size: number,
  color: number,
  innerAlpha = 1
): void => {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return;
  const ctx = canvas.context;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const rgb = hexToRgb(color);
  g.addColorStop(0, `rgba(${rgb},${innerAlpha})`);
  g.addColorStop(0.4, `rgba(${rgb},${innerAlpha * 0.55})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
};

const hexToRgb = (n: number): string => {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `${r},${g},${b}`;
};

/** A glossy rounded letter-tile face with a neon rim (letter drawn at runtime). */
const makeTile = (
  scene: Phaser.Scene,
  key: string,
  face: number,
  faceHi: number,
  edge: number
): void => {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const s = TILE;
  const r = 26;
  const m = 8;
  // Outer soft edge
  g.fillStyle(edge, 0.18);
  g.fillRoundedRect(m - 4, m - 4, s - (m - 4) * 2, s - (m - 4) * 2, r + 4);
  // Face
  g.fillStyle(face, 1);
  g.fillRoundedRect(m, m, s - m * 2, s - m * 2, r);
  // Top gloss highlight
  g.fillStyle(faceHi, 0.85);
  g.fillRoundedRect(m + 6, m + 6, s - m * 2 - 12, (s - m * 2) * 0.42, r - 6);
  // Neon rim
  g.lineStyle(5, edge, 1);
  g.strokeRoundedRect(m, m, s - m * 2, s - m * 2, r);
  // Inner rim sheen
  g.lineStyle(2, COLORS.white, 0.25);
  g.strokeRoundedRect(m + 5, m + 5, s - m * 2 - 10, s - m * 2 - 10, r - 5);
  g.generateTexture(key, s, s);
  g.destroy();
};

/** A jagged, cracked danger shard — angular silhouette, unmistakably hostile. */
const makeHazard = (scene: Phaser.Scene, key: string): void => {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const s = TILE;
  const c = s / 2;
  const spikes = 11;
  const outer = c - 10;
  const inner = outer * 0.62;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push({ x: c + Math.cos(a) * rad, y: c + Math.sin(a) * rad });
  }
  // Glow
  g.fillStyle(COLORS.hazard, 0.22);
  g.fillCircle(c, c, outer + 6);
  // Body
  g.fillStyle(COLORS.hazard, 1);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.fillPath();
  // Dark unstable core
  g.fillStyle(COLORS.hazardCore, 1);
  g.fillCircle(c, c, inner * 0.72);
  // Hot inner ring
  g.lineStyle(3, COLORS.hazardEdge, 0.95);
  g.strokeCircle(c, c, inner * 0.72);
  // Cracks
  g.lineStyle(3, COLORS.hazardEdge, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + 0.5;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * outer * 0.9, c + Math.sin(a) * outer * 0.9);
    g.strokePath();
  }
  // Spiky outline
  g.lineStyle(3, COLORS.hazardEdge, 0.8);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.strokePath();
  g.generateTexture(key, s, s);
  g.destroy();
};

/** The prism catcher: a sleek horizontal gem the player steers to collect. */
const makeCatcher = (scene: Phaser.Scene, key: string): void => {
  if (scene.textures.exists(key)) return;
  const w = 260;
  const h = 92;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Under-glow
  g.fillStyle(COLORS.cyan, 0.16);
  g.fillEllipse(w / 2, h / 2 + 10, w, h);
  // Body — hexagonal prism
  const pts = [
    { x: 26, y: h / 2 },
    { x: 64, y: 14 },
    { x: w - 64, y: 14 },
    { x: w - 26, y: h / 2 },
    { x: w - 64, y: h - 14 },
    { x: 64, y: h - 14 },
  ];
  g.fillStyle(COLORS.violetDeep, 1);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.fillPath();
  // Bright catch-surface (top facet)
  g.fillStyle(COLORS.cyan, 0.9);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  g.lineTo(pts[1]!.x, pts[1]!.y);
  g.lineTo(pts[2]!.x, pts[2]!.y);
  g.lineTo(pts[3]!.x, pts[3]!.y);
  g.lineTo(w / 2, h / 2);
  g.closePath();
  g.fillPath();
  // Rim
  g.lineStyle(4, COLORS.cyan, 1);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.strokePath();
  // Core sparkle
  g.fillStyle(COLORS.white, 0.9);
  g.fillCircle(w / 2, h / 2, 6);
  g.generateTexture(key, w, h);
  g.destroy();
};

/** Small bonus orb with an inner icon glyph drawn as simple vector shapes. */
const makeBonus = (scene: Phaser.Scene, key: string, color: number, glyph: string): void => {
  if (scene.textures.exists(key)) return;
  const s = 96;
  const c = s / 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 0.22);
  g.fillCircle(c, c, c - 4);
  g.fillStyle(color, 1);
  g.fillCircle(c, c, c - 16);
  g.lineStyle(4, COLORS.white, 0.85);
  g.strokeCircle(c, c, c - 16);
  g.fillStyle(COLORS.white, 1);
  g.lineStyle(6, COLORS.white, 1);
  const r = 16;
  if (glyph === 'heart') {
    g.fillCircle(c - 7, c - 4, 8);
    g.fillCircle(c + 7, c - 4, 8);
    g.fillTriangle(c - 15, c - 1, c + 15, c - 1, c, c + 18);
  } else if (glyph === 'time') {
    g.strokeCircle(c, c, r);
    g.lineBetween(c, c, c, c - r + 3);
    g.lineBetween(c, c, c + r - 6, c);
  } else if (glyph === 'back') {
    // A clear left "delete / backspace" arrow.
    g.fillStyle(COLORS.white, 1);
    g.fillTriangle(c - r, c, c - 2, c - r + 3, c - 2, c + r - 3);
    g.fillRect(c - 4, c - 5, r + 2, 10);
  } else if (glyph === 'clear') {
    g.lineBetween(c - r, c - r, c + r, c + r);
    g.lineBetween(c + r, c - r, c - r, c + r);
  } else {
    // gem
    g.fillStyle(COLORS.white, 0.95);
    g.fillTriangle(c, c - r, c - r, c, c + r, c);
    g.fillTriangle(c, c + r, c - r, c, c + r, c);
  }
  g.generateTexture(key, s, s);
  g.destroy();
};

/** A thin ring for shockwaves / pulses. */
const makeRing = (scene: Phaser.Scene, key: string, color: number): void => {
  if (scene.textures.exists(key)) return;
  const s = 128;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(8, color, 1);
  g.strokeCircle(s / 2, s / 2, s / 2 - 8);
  g.generateTexture(key, s, s);
  g.destroy();
};

export const TEX = {
  tile: 'wf-tile',
  trickTile: 'wf-tile-trick',
  hazard: 'wf-hazard',
  catcher: 'wf-catcher',
  glow: 'wf-glow',
  glowGold: 'wf-glow-gold',
  glowRed: 'wf-glow-red',
  dot: 'wf-dot',
  dotGold: 'wf-dot-gold',
  ring: 'wf-ring',
  bonusHeart: 'wf-b-heart',
  bonusTime: 'wf-b-time',
  bonusBack: 'wf-b-back',
  bonusClear: 'wf-b-clear',
  bonusGem: 'wf-b-gem',
} as const;

/** Generate every WordFall texture. Safe to call more than once. */
export const generateTextures = (scene: Phaser.Scene): void => {
  makeTile(scene, TEX.tile, COLORS.tileFace, COLORS.tileFaceHi, COLORS.tileEdge);
  makeTile(scene, TEX.trickTile, COLORS.trickFace, COLORS.tileFaceHi, COLORS.trickEdge);
  makeHazard(scene, TEX.hazard);
  makeCatcher(scene, TEX.catcher);
  softDot(scene, TEX.glow, 220, COLORS.cyan, 0.9);
  softDot(scene, TEX.glowGold, 220, COLORS.gold, 0.9);
  softDot(scene, TEX.glowRed, 220, COLORS.hazard, 0.9);
  softDot(scene, TEX.dot, 32, COLORS.cyan);
  softDot(scene, TEX.dotGold, 32, COLORS.gold);
  makeRing(scene, TEX.ring, COLORS.cyan);
  makeBonus(scene, TEX.bonusHeart, COLORS.heart, 'heart');
  makeBonus(scene, TEX.bonusTime, COLORS.time, 'time');
  makeBonus(scene, TEX.bonusBack, COLORS.back, 'back');
  makeBonus(scene, TEX.bonusClear, COLORS.clear, 'clear');
  makeBonus(scene, TEX.bonusGem, COLORS.gem, 'gem');
};
