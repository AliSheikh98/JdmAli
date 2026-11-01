import type { AudioFrame } from '../audio/types';

/**
 * Corner webs and spiders. Legs are two-jointed and flex on the beat so the
 * limbs bounce with the music. Bodies stay in the corners and along the top
 * so the scenes underneath stay readable.
 */

interface Spider {
  x: number;
  y: number;
  /** Body length as a fraction of the shorter screen edge. */
  size: number;
  rot: number;
  phase: number;
  hang: boolean;
}

const SPIDERS: Spider[] = [
  { x: 0.07, y: 0.1, size: 0.055, rot: 0.5, phase: 0.2, hang: false },
  { x: 0.93, y: 0.11, size: 0.06, rot: 2.5, phase: 1.1, hang: false },
  { x: 0.08, y: 0.9, size: 0.05, rot: -0.55, phase: 2.0, hang: false },
  { x: 0.92, y: 0.88, size: 0.058, rot: 3.6, phase: 0.7, hang: false },
  { x: 0.5, y: 0.14, size: 0.04, rot: 0.15, phase: 1.6, hang: true },
  { x: 0.28, y: 0.06, size: 0.032, rot: 0.9, phase: 2.6, hang: false },
  { x: 0.74, y: 0.07, size: 0.034, rot: 2.2, phase: 3.3, hang: false },
];

const SPREAD = [-1.15, -0.38, 0.4, 1.12];

export function drawSpiders(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  audio: AudioFrame,
  t: number,
): void {
  const lift = Math.min(1.15, audio.pulse * 1.25 + audio.bass * 0.4);
  drawWebs(ctx, w, h, t);
  for (const spider of SPIDERS) {
    const size = Math.min(w, h) * spider.size;
    const sway = spider.hang ? Math.sin(t * 0.7 + spider.phase) * size * 0.8 : 0;
    const x = spider.x * w + sway;
    const hop = lift * size * 0.45;
    const y = spider.y * h - hop;
    if (spider.hang) {
      ctx.strokeStyle = 'rgba(214, 206, 190, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - sway * 0.15, 0);
      ctx.lineTo(x, y - size);
      ctx.stroke();
    }
    drawSpider(ctx, x, y, size, spider.rot + sway * 0.004, lift, spider.phase);
  }
}

function drawWebs(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const r = Math.min(w, h) * 0.3;
  const drift = Math.sin(t * 0.35) * 0.03;
  drawCornerWeb(ctx, 0, 0, r, 0 + drift);
  drawCornerWeb(ctx, w, 0, r * 0.92, Math.PI / 2 + drift);
  drawCornerWeb(ctx, 0, h, r * 0.78, -Math.PI / 2 - drift);
  drawCornerWeb(ctx, w, h, r * 0.84, Math.PI - drift);
}

function drawCornerWeb(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rot: number): void {
  const spokes = 7;
  const rings = 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(206, 196, 176, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = (i / (spokes - 1)) * (Math.PI / 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let ring = 1; ring <= rings; ring++) {
    const rr = (ring / rings) ** 1.15 * radius;
    for (let i = 0; i < spokes; i++) {
      const a = (i / (spokes - 1)) * (Math.PI / 2);
      const sag = ring % 2 === 0 ? 0.97 : 1;
      const px = Math.cos(a) * rr * sag;
      const py = Math.sin(a) * rr * sag;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(230, 222, 206, 0.7)';
  for (let i = 1; i < spokes; i += 2) {
    const a = (i / (spokes - 1)) * (Math.PI / 2);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSpider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  lift: number,
  phase: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#140c10';
  ctx.lineWidth = Math.max(2.5, size * 0.13);
  ctx.beginPath();

  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const spread = SPREAD[k];
    const base = side === 1 ? spread : Math.PI - spread;
    const wobble = Math.sin(phase + k * 1.15) * 0.06;
    const flex = lift * (0.42 + k * 0.08);
    const a1 = base + wobble - side * flex;
    const femur = size * (1.55 + k * 0.14);
    const kx = Math.cos(a1) * femur;
    const ky = Math.sin(a1) * femur;
    const bend = 0.75 + flex * 1.35;
    const a2 = a1 + side * bend;
    const tibia = size * (1.7 + k * 0.1);
    const fx = kx + Math.cos(a2) * tibia;
    const fy = ky + Math.sin(a2) * tibia;
    ctx.moveTo(side * size * 0.2, size * 0.05);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
  }
  ctx.stroke();

  ctx.fillStyle = '#10080c';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.35, size * 0.55, size * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.strokeStyle = '#3a2428';
  ctx.stroke();

  ctx.fillStyle = '#1a1014';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.28, size * 0.38, size * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 28, 36, 0.85)';
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(-size * 0.16, size * 0.15);
  ctx.lineTo(0, size * 0.42);
  ctx.lineTo(size * 0.16, size * 0.15);
  ctx.stroke();

  ctx.fillStyle = '#e6d2c4';
  for (let i = 0; i < 4; i++) {
    const ex = (i - 1.5) * size * 0.12;
    ctx.beginPath();
    ctx.arc(ex, -size * 0.4, Math.max(1.4, size * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
