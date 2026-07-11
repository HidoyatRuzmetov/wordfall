/**
 * Dynamic, mobile-first responsive layout.
 *
 * Every scene calls computeLayout(width, height) on create and on resize. It
 * detects portrait (mobile) vs landscape (desktop/expanded) and returns a
 * consistent set of zones + a UI scale factor so the same scenes render well
 * from a 360px phone to a widescreen monitor.
 */

export type LayoutMode = 'portrait' | 'landscape';

export type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

export type Layout = {
  w: number;
  h: number;
  mode: LayoutMode;
  isPortrait: boolean;
  s: number; // UI scale factor (relative to a 420x760 reference)
  pad: number;
  topBarH: number;
  bottomBarH: number;
  field: Rect; // the falling playfield
  contentW: number; // max width for centered UI cards
  cx: number;
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const computeLayout = (width: number, height: number): Layout => {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const isPortrait = h >= w * 0.95;
  const mode: LayoutMode = isPortrait ? 'portrait' : 'landscape';

  // Scale UI relative to a 420 x 760 reference phone, gently clamped.
  const s = clamp(Math.min(w / 420, h / 760), 0.72, 2.0);

  const pad = Math.round(14 * s);
  const topBarH = Math.round((isPortrait ? 66 : 60) * s);
  const bottomBarH = Math.round((isPortrait ? 128 : 110) * s);

  // The falling field: full width on mobile, a centered column on desktop so
  // letters never spread across an unplayable width.
  const fieldW = isPortrait ? w : Math.min(w * 0.6, 640);
  const fieldX = (w - fieldW) / 2;
  const fieldY = topBarH;
  const fieldH = Math.max(200, h - topBarH - bottomBarH);

  const contentW = Math.min(w - pad * 2, isPortrait ? 520 : 720);

  return {
    w,
    h,
    mode,
    isPortrait,
    s,
    pad,
    topBarH,
    bottomBarH,
    field: {
      x: fieldX,
      y: fieldY,
      w: fieldW,
      h: fieldH,
      cx: fieldX + fieldW / 2,
      cy: fieldY + fieldH / 2,
    },
    contentW,
    cx: w / 2,
  };
};
