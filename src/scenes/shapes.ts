/**
 * Original, procedurally drawn silhouettes. Nothing here is traced from or
 * embeds any third-party artwork: a round green head with a knotted mask,
 * a classic jack-o'-lantern, a simple bat, a jagged lightning bolt.
 */
import { PALETTE, rgba } from './palette';

export interface TurtleHeadOptions {
  /** Mask colour. */
  mask: string;
  /** 0..1, how wide the eyes open (beat reactive). */
  eyeOpen?: number;
  /** 0..1, how much the mask tails whip around. */
  tailWave?: number;
  /** Seconds, used to animate tails. */
  t?: number;
  /** Glow colour behind the head. */
  glow?: string;
  /** 0..1 intensity of the glow. */
  glowAmount?: number;
}

export function drawTurtleHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  opts: TurtleHeadOptions,
): void {
  const eyeOpen = opts.eyeOpen ?? 0.6;
  const tailWave = opts.tailWave ?? 0.3;
  const t = opts.t ?? 0;

  ctx.save();
  ctx.translate(x, y);

  if (opts.glow && (opts.glowAmount ?? 0) > 0.01) {
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.2);
    g.addColorStop(0, opts.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = opts.glowAmount ?? 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Mask tails (behind the head), two ribbons trailing to the right
  ctx.strokeStyle = opts.mask;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.22;
  for (let i = 0; i < 2; i++) {
    const dir = i === 0 ? -1 : 1;
    const phase = t * 4 + i * 1.7;
    ctx.beginPath();
    ctx.moveTo(r * 0.75, -r * 0.05 + dir * r * 0.1);
    const len = r * (1.5 + tailWave * 0.6);
    const cx1 = r * 1.3;
    const cy1 = dir * r * 0.25 + Math.sin(phase) * r * 0.25 * (0.3 + tailWave);
    const cx2 = r * 1.9;
    const cy2 = dir * r * 0.75 + Math.cos(phase * 1.3) * r * 0.35 * (0.3 + tailWave);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, r * 0.75 + len, dir * r * 0.9 + Math.sin(phase * 0.8) * r * 0.3);
    ctx.stroke();
  }

  // Head: slightly squashed circle with a jaw bump
  ctx.fillStyle = PALETTE.green;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f9a3f';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.42, r * 0.78, r * 0.5, 0, 0, Math.PI);
  ctx.fill();
  // Head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.45, r * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Mask band across the eyes
  ctx.fillStyle = opts.mask;
  ctx.beginPath();
  ctx.moveTo(-r * 1.02, -r * 0.35);
  ctx.quadraticCurveTo(0, -r * 0.5, r * 1.02, -r * 0.35);
  ctx.lineTo(r * 1.02, r * 0.12);
  ctx.quadraticCurveTo(0, r * 0.28, -r * 1.02, r * 0.12);
  ctx.closePath();
  ctx.fill();

  // Knot at the right
  ctx.beginPath();
  ctx.ellipse(r * 0.88, -r * 0.08, r * 0.2, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes: white almonds in the mask, narrowing when eyeOpen is low
  const eyeH = r * (0.06 + 0.2 * eyeOpen);
  ctx.fillStyle = PALETTE.white;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.16, -r * 0.1);
    ctx.quadraticCurveTo(side * r * 0.42, -r * 0.1 - eyeH, side * r * 0.66, -r * 0.08);
    ctx.quadraticCurveTo(side * r * 0.42, -r * 0.08 + eyeH * 0.8, side * r * 0.16, -r * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  // Mouth: a determined line with a hint of a smirk
  ctx.strokeStyle = '#143d1b';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.55);
  ctx.quadraticCurveTo(0, r * 0.68 + eyeOpen * r * 0.05, r * 0.42, r * 0.52);
  ctx.stroke();

  ctx.restore();
}

/** Hexagonal shell plate pattern, used as a decorative emblem. */
export function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#5a3b1e';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b1a0b';
  ctx.lineWidth = r * 0.08;
  const hex = (cx: number, cy: number, s: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = cx + Math.cos(a) * s;
      const py = cy + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#7a5230';
    ctx.fill();
    ctx.stroke();
  };
  hex(0, 0, r * 0.36);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    hex(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.7, r * 0.3);
  }
  ctx.restore();
}

export function drawPumpkin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  glow: number,
  t = 0,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Inner candle glow
  if (glow > 0.02) {
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2);
    g.addColorStop(0, rgba(PALETTE.orangeHot, 0.5 * glow));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stem
  ctx.fillStyle = '#3d6b2a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.8);
  ctx.quadraticCurveTo(r * 0.05, -r * 1.25, r * 0.28, -r * 1.15);
  ctx.lineTo(r * 0.22, -r * 0.78);
  ctx.closePath();
  ctx.fill();

  // Body: overlapping lobes
  ctx.fillStyle = PALETTE.orange;
  for (const lx of [-0.5, 0.5, -0.25, 0.25, 0]) {
    ctx.beginPath();
    ctx.ellipse(lx * r, 0, r * 0.55, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,40,0,0.55)';
  ctx.lineWidth = r * 0.05;
  for (const lx of [-0.5, -0.25, 0.25, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(lx * r, 0, r * 0.55, r * 0.85, 0, -Math.PI / 2, Math.PI / 2, lx < 0);
    ctx.stroke();
  }

  // Face: carved triangles, lit by the candle (flicker)
  const flick = 0.75 + 0.25 * Math.sin(t * 17 + x) * Math.sin(t * 7.3);
  ctx.fillStyle = `rgba(255,${Math.floor(170 + 60 * glow)},${Math.floor(40 * glow)},${0.55 + 0.45 * glow * flick})`;
  const tri = (cx: number, cy: number, s: number, flip = false) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + (flip ? s : -s));
    ctx.lineTo(cx - s, cy + (flip ? -s * 0.6 : s * 0.6));
    ctx.lineTo(cx + s, cy + (flip ? -s * 0.6 : s * 0.6));
    ctx.closePath();
    ctx.fill();
  };
  tri(-r * 0.32, -r * 0.18, r * 0.2);
  tri(r * 0.32, -r * 0.18, r * 0.2);
  tri(0, r * 0.08, r * 0.1, true);
  // Jagged mouth
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.3);
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const px = -r * 0.5 + (i / teeth) * r;
    const py = r * 0.3 + (i % 2 === 0 ? 0 : r * 0.14) + Math.sin((i / teeth) * Math.PI) * r * 0.1;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(r * 0.5, r * 0.55);
  for (let i = teeth; i >= 0; i--) {
    const px = -r * 0.5 + (i / teeth) * r;
    const py = r * 0.55 - (i % 2 === 0 ? r * 0.12 : 0) + Math.sin((i / teeth) * Math.PI) * r * 0.12;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawBat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flap: number,
  color = '#120818',
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  const wingLift = Math.sin(flap) * size * 0.45;
  ctx.beginPath();
  // Body
  ctx.ellipse(0, 0, size * 0.16, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.2);
  ctx.lineTo(-size * 0.06, -size * 0.42);
  ctx.lineTo(0, -size * 0.22);
  ctx.lineTo(size * 0.06, -size * 0.42);
  ctx.lineTo(size * 0.12, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  // Wings
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * size * 0.1, -size * 0.05);
    ctx.quadraticCurveTo(side * size * 0.45, -size * 0.45 - wingLift, side * size, -size * 0.25 - wingLift * 1.4);
    ctx.quadraticCurveTo(side * size * 0.8, size * 0.05 - wingLift * 0.4, side * size * 0.66, size * 0.15 - wingLift * 0.3);
    ctx.quadraticCurveTo(side * size * 0.5, size * 0.0 - wingLift * 0.2, side * size * 0.36, size * 0.22 - wingLift * 0.1);
    ctx.quadraticCurveTo(side * size * 0.2, size * 0.1, side * size * 0.1, size * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A branching lightning bolt from (x0,y0) down to y1. */
export function drawLightning(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  y1: number,
  rand: () => number,
  width: number,
  color = PALETTE.acid,
  depth = 0,
): void {
  const segments = 10 + Math.floor(rand() * 6);
  const pts: [number, number][] = [[x0, y0]];
  let x = x0;
  const dy = (y1 - y0) / segments;
  for (let i = 1; i <= segments; i++) {
    x += (rand() - 0.5) * width * 2.2;
    pts.push([x, y0 + dy * i]);
    if (depth < 2 && rand() < 0.22) {
      drawLightning(ctx, x, y0 + dy * i, y0 + dy * i + (y1 - y0) * 0.3 * rand(), rand, width * 0.6, color, depth + 1);
    }
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes: [number, string][] = [
    [width * 0.55, rgba(color, 0.25)],
    [width * 0.25, rgba(color, 0.8)],
    [width * 0.08, '#ffffff'],
  ];
  for (const [lw, stroke] of passes) {
    ctx.lineWidth = Math.max(1, lw / (depth + 1));
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glow: number): void {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3);
  g.addColorStop(0, rgba(PALETTE.orangeHot, 0.35 + glow * 0.3));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd58a';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,140,60,0.35)';
  for (const [cx, cy, cr] of [
    [-0.3, -0.2, 0.18],
    [0.25, 0.1, 0.12],
    [0.05, 0.45, 0.22],
    [-0.45, 0.4, 0.1],
  ]) {
    ctx.beginPath();
    ctx.arc(x + cx * r, y + cy * r, cr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
