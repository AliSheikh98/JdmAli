export const PALETTE = {
  black: '#050308',
  night: '#0d0616',
  purple: '#8a2be2',
  purpleDeep: '#3b0a5e',
  orange: '#ff7a00',
  orangeHot: '#ffb347',
  acid: '#a8ff3e',
  green: '#39b54a',
  greenDark: '#1f6b2a',
  white: '#fff7e6',
} as const;

export interface Turtle {
  name: string;
  short: string;
  mask: string;
  glow: string;
}

/** The four brothers, by mask colour. Shapes are drawn procedurally. */
export const TURTLES: Turtle[] = [
  { name: 'Leonardo', short: 'LEO', mask: '#2f7cff', glow: 'rgba(47,124,255,0.55)' },
  { name: 'Donatello', short: 'DON', mask: '#9b4dff', glow: 'rgba(155,77,255,0.55)' },
  { name: 'Raphael', short: 'RAPH', mask: '#ff3b3b', glow: 'rgba(255,59,59,0.55)' },
  { name: 'Michelangelo', short: 'MIKEY', mask: '#ff8c1a', glow: 'rgba(255,140,26,0.55)' },
];

export const DISPLAY_FONT = "'Creepster', 'Bangers', Impact, 'Arial Black', sans-serif";

export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Deterministic pseudo-random generator so layouts are stable across frames. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
