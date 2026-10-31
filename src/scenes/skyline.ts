import type { Scene, SceneContext } from './types';
import { DISPLAY_FONT, PALETTE, TURTLES, rgba, mulberry32, clamp01 } from './palette';
import { drawBat, drawLightning, drawMoon, drawPumpkin, drawTurtleHead } from './shapes';

interface Building {
  x: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  binStart: number;
  binEnd: number;
  spire: boolean;
}

interface Bolt {
  x: number;
  seed: number;
  life: number;
}

interface SkyBat {
  x: number;
  y: number;
  speed: number;
  size: number;
  flap: number;
}

/**
 * Scene 3 — "Haunted City": a dark skyline whose windows light up with the
 * spectrum (left = bass, right = treble), lightning strikes on the beat, and
 * four small silhouettes keep watch from a rooftop.
 */
export class SkylineScene implements Scene {
  readonly id = 'skyline';
  readonly name = 'City';
  private buildings: Building[] = [];
  private bolts: Bolt[] = [];
  private bats: SkyBat[] = [];
  private flash = 0;
  private fogOffset = 0;
  private windowLevels = new Float32Array(0);

  resize(w: number, h: number): void {
    const rand = mulberry32(1031);
    this.buildings = [];
    let x = -10;
    while (x < w + 20) {
      const bw = w * (0.04 + rand() * 0.06);
      const bh = h * (0.18 + rand() * 0.42);
      const cols = Math.max(2, Math.floor(bw / (w * 0.012)));
      const rows = Math.max(3, Math.floor(bh / (h * 0.035)));
      this.buildings.push({ x, w: bw, h: bh, cols, rows, binStart: 0, binEnd: 0, spire: rand() < 0.3 });
      x += bw + rand() * w * 0.008;
    }
    // Assign each building a slice of the spectrum (log spaced)
    const n = this.buildings.length;
    this.buildings.forEach((b, i) => {
      b.binStart = Math.pow(i / n, 1.7);
      b.binEnd = Math.pow((i + 1) / n, 1.7);
    });
    let totalWindows = 0;
    for (const b of this.buildings) totalWindows += b.cols * b.rows;
    this.windowLevels = new Float32Array(totalWindows);
    this.bats = Array.from({ length: 12 }, () => ({
      x: rand() * w,
      y: h * (0.08 + rand() * 0.35),
      speed: 30 + rand() * 60,
      size: 10 + rand() * 18,
      flap: rand() * 10,
    }));
  }

  draw({ ctx, w, h, audio, t, dt }: SceneContext): void {
    if (audio.beatDetected || (audio.beat && audio.bass > 0.5)) {
      this.flash = Math.max(this.flash, audio.beatDetected ? 1 : 0.5);
      if (audio.beatDetected && (audio.bass > 0.35 || Math.random() < 0.4)) {
        this.bolts.push({ x: w * (0.1 + Math.random() * 0.8), seed: Math.floor(Math.random() * 1e6), life: 0.28 });
        if (this.bolts.length > 3) this.bolts.shift();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.fogOffset += dt * (8 + audio.level * 20);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `rgb(${Math.floor(12 + this.flash * 60)},${Math.floor(4 + this.flash * 40)},${Math.floor(24 + this.flash * 90)})`);
    sky.addColorStop(0.55, `rgb(${Math.floor(59 + this.flash * 50)},${Math.floor(10 + this.flash * 40)},${Math.floor(94 + this.flash * 60)})`);
    sky.addColorStop(1, '#1a0a26');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Stars, twinkling to treble
    const rand = mulberry32(9);
    ctx.fillStyle = PALETTE.white;
    for (let i = 0; i < 70; i++) {
      const sx = rand() * w;
      const sy = rand() * h * 0.5;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (1 + rand() * 3) + rand() * 6));
      ctx.globalAlpha = tw * (0.4 + audio.treble * 0.6);
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    drawMoon(ctx, w * 0.8, h * 0.2, h * 0.09 + audio.bass * h * 0.015, audio.pulse);

    // Spectrum "aurora" behind the skyline
    const barCount = 80;
    const bw = w / barCount;
    for (let b = 0; b < barCount; b++) {
      const idx = Math.min(audio.bins - 1, Math.floor(Math.pow(b / barCount, 1.7) * audio.bins));
      const v = audio.freq[idx];
      const bh = v * h * 0.45;
      const grad = ctx.createLinearGradient(0, h * 0.78 - bh, 0, h * 0.78);
      grad.addColorStop(0, rgba(PALETTE.acid, 0));
      grad.addColorStop(1, rgba(b % 2 ? PALETTE.purple : PALETTE.orange, 0.35 + v * 0.4));
      ctx.fillStyle = grad;
      ctx.fillRect(b * bw, h * 0.78 - bh, bw + 1, bh);
    }

    // Lightning bolts
    for (const bolt of this.bolts) {
      bolt.life -= dt;
      if (bolt.life <= 0) continue;
      const r = mulberry32(bolt.seed);
      ctx.globalAlpha = clamp01(bolt.life / 0.2);
      drawLightning(ctx, bolt.x, -10, h * (0.5 + r() * 0.25), r, w * 0.02);
      ctx.globalAlpha = 1;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // Bats across the sky
    for (const bat of this.bats) {
      bat.x += dt * (bat.speed + audio.mid * 80);
      bat.flap += dt * (9 + audio.treble * 12);
      bat.y += Math.sin(t * 1.5 + bat.x * 0.01) * dt * 20;
      if (bat.x > w + 40) {
        bat.x = -40;
        bat.y = h * (0.08 + Math.random() * 0.35);
      }
      drawBat(ctx, bat.x, bat.y, bat.size, bat.flap, '#0a0410');
    }

    // Buildings with spectrum-lit windows
    const ground = h * 0.78;
    let wi = 0;
    for (const b of this.buildings) {
      const top = ground - b.h;
      ctx.fillStyle = '#07040c';
      ctx.fillRect(b.x, top, b.w, b.h + h);
      if (b.spire) {
        ctx.beginPath();
        ctx.moveTo(b.x + b.w * 0.3, top);
        ctx.lineTo(b.x + b.w * 0.5, top - h * 0.08);
        ctx.lineTo(b.x + b.w * 0.7, top);
        ctx.closePath();
        ctx.fill();
      }
      const lo = Math.floor(b.binStart * audio.bins);
      const hi = Math.max(lo + 1, Math.floor(b.binEnd * audio.bins));
      let e = 0;
      for (let i = lo; i < hi; i++) e += audio.freq[i];
      e /= hi - lo;
      const litRows = e * b.rows * 1.6;
      const winW = (b.w / b.cols) * 0.5;
      const winH = (b.h / b.rows) * 0.5;
      for (let r = 0; r < b.rows; r++) {
        const rowFromBottom = b.rows - 1 - r;
        const target = clamp01(litRows - rowFromBottom);
        for (let c = 0; c < b.cols; c++) {
          const li = wi++;
          const prev = this.windowLevels[li];
          this.windowLevels[li] = prev + (target - prev) * Math.min(1, dt * (target > prev ? 20 : 5));
          const lv = this.windowLevels[li];
          if (lv < 0.03) continue;
          const wx = b.x + (b.w / b.cols) * (c + 0.25);
          const wy = top + (b.h / b.rows) * (r + 0.25);
          ctx.fillStyle = rgba(rowFromBottom % 3 === 2 ? PALETTE.acid : PALETTE.orange, 0.25 + lv * 0.75);
          ctx.fillRect(wx, wy, winW, winH);
        }
      }
    }

    // Rooftop watchers: four small silhouettes on the tallest building
    const tallest = this.buildings.reduce((a, b) => (b.h > a.h ? b : a), this.buildings[0]);
    if (tallest) {
      const top = ground - tallest.h;
      const rr = Math.max(10, Math.min(h * 0.04, tallest.w * 0.16));
      for (let i = 0; i < 4; i++) {
        const cx = tallest.x + tallest.w * (0.2 + i * 0.2);
        drawTurtleHead(ctx, cx, top - rr * 1.4 - audio.pulse * rr * 0.5, rr, {
          mask: TURTLES[i].mask,
          eyeOpen: 0.5 + audio.pulse * 0.5,
          tailWave: audio.level,
          t,
        });
      }
    }

    // Street-level fog
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const fy = ground - h * 0.04 + i * h * 0.05;
      const g = ctx.createLinearGradient(0, fy - h * 0.08, 0, fy + h * 0.08);
      g.addColorStop(0, 'rgba(120,80,160,0)');
      g.addColorStop(0.5, `rgba(120,80,160,${0.12 + audio.level * 0.1})`);
      g.addColorStop(1, 'rgba(120,80,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) {
        const y = fy + Math.sin(x * 0.01 + this.fogOffset * 0.05 * (i + 1) + i) * h * 0.02;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Street with pumpkins along the curb
    ctx.fillStyle = '#0b0612';
    ctx.fillRect(0, ground, w, h - ground);
    for (let i = 0; i < 6; i++) {
      const px = w * (0.08 + i * 0.17) + Math.sin(i) * 20;
      drawPumpkin(ctx, px, ground + h * 0.1, h * 0.045, 0.5 + audio.bass * 0.5 + audio.pulse * 0.5, t + i);
    }

    // Lightning flash overlay
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(230,220,255,${this.flash * 0.18})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.font = `${Math.round(Math.min(w, h) * 0.065)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.orangeHot;
    ctx.shadowColor = PALETTE.orange;
    ctx.shadowBlur = 16;
    ctx.fillText('HAUNTED CITY', w / 2, h * 0.04);
    ctx.restore();
  }
}
