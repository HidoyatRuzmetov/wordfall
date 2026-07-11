/**
 * WordFall visual identity — "reimagine the fall".
 *
 * Not space: a sleek neon void where luminous letter-tiles rain down. The
 * signature comes from glowing glyph tiles, jagged danger shards, and a calm
 * indigo gradient with drifting light — cohesive, distinctive, un-shooter-like.
 */

export const COLORS = {
  // Void backdrop
  bgTop: 0x191436,
  bgMid: 0x0d0a24,
  bgBottom: 0x05030f,
  bgTopCss: '#191436',
  bgBottomCss: '#05030f',

  // Core neon accents
  cyan: 0x53e0ff,
  cyanDeep: 0x2aa8dd,
  violet: 0x9a7bff,
  violetDeep: 0x6d4bd8,
  gold: 0xffd257,
  goldDeep: 0xf5a623,

  // Letter tile
  tileFace: 0x1b2450,
  tileFaceHi: 0x27336e,
  tileEdge: 0x5ad1ff,
  tileText: 0xf2f7ff,

  // Trick tile (special)
  trickEdge: 0xffd257,
  trickFace: 0x3a2f5e,

  // Hazard shard
  hazard: 0xff4066,
  hazardCore: 0x2a0713,
  hazardEdge: 0xff8a5c,
  toxic: 0xb6ff3b,

  // Bonuses
  heart: 0xff6b9d,
  time: 0x59f9c8,
  back: 0xa78bfa,
  clear: 0xeef1ff,
  gem: 0xffd257,

  // UI
  text: 0xeef1ff,
  textCss: '#eef1ff',
  muted: 0x9aa6d8,
  mutedCss: '#9aa6d8',
  panel: 0x120e2e,
  panelCss: '#120e2e',
  panelEdge: 0x2b2560,
  success: 0x57e08b,
  successCss: '#57e08b',
  danger: 0xff4066,
  dangerCss: '#ff4066',
  streak: 0xffb020,
  streakCss: '#ffb020',
  white: 0xffffff,
} as const;

/** Bold, clean system stack — the art carries the identity, not a webfont. */
export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, Roboto, sans-serif';
export const FONT_HEAVY = '"Trebuchet MS", "Segoe UI Black", "Segoe UI", system-ui, sans-serif';

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Render text at device-pixel density so glyphs stay crisp on mobile/retina. */
const TEXT_RESOLUTION = Math.min(
  3,
  Math.max(2, Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1))
);

/** Vary a base UI text style while keeping the WordFall look consistent. */
export const textStyle = (
  size: number,
  color: string = COLORS.textCss,
  heavy = true
): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: heavy ? FONT_HEAVY : FONT,
  fontSize: `${size}px`,
  color,
  fontStyle: heavy ? 'bold' : 'normal',
  resolution: TEXT_RESOLUTION,
});
