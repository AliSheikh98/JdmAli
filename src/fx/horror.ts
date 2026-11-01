import type { AudioFrame } from '../audio/types';

/**
 * Shared scare pass used by every scene: beat flicker, a heavy vignette,
 * coarse (blocky) film grain, VHS tracking tears, creeping fog, glowing
 * eyes in the dark, dripping ooze/blood, and a short jump-scare on strong
 * onsets. The scare is rate-limited so it cannot strobe.
 *
 * Grain and tears are a handful of large marks, not per-pixel noise.
 */

interface Drip {
  x: number;
  y: number;
  vy: number;
  w: number;
  len: number;
  color: string;
}

interface Eye {
  x: number;
  y: number;
  size: number;
  phase: number;
  vx: number;
}

interface Fog {
  x: number;
  y: number;
  r: number;
  vx: number;
  alpha: number;
}

const SCARE_GAP = 7.5;
const SCARE_HOLD = 0.12;

export class HorrorOverlay {
  /** 1 while a jump-scare is on screen, else 0. */
  scare = 0;

  private drips: Drip[] = [];
  private eyes: Eye[] = [];
  private fog: Fog[] = [];
  private flicker = 1;
  private glitch = 0;
  private scareLock = 2.5;
  private w = 1;
  private h = 1;
  private pulse = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drips = Array.from({ length: 18 }, () => this.freshDrip(true));
    this.eyes = Array.from({ length: 4 }, (_, i) => ({
      x: w * (0.12 + i * 0.22),
      y: h * (0.12 + (i % 2) * 0.14),
      size: h * (0.012 + (i % 3) * 0.004),
      phase: i * 1.7,
      vx: 12 + i * 4,
    }));
    this.fog = Array.from({ length: 4 }, (_, i) => ({
      x: (i / 3) * w,
      y: h * (0.55 + (i % 3) * 0.12),
      r: h * (0.22 + (i % 3) * 0.08),
      vx: (i % 2 === 0 ? 1 : -1) * (10 + i * 3),
      alpha: 0.1 + (i % 3) * 0.03,
    }));
  }

  update(audio: AudioFrame, w: number, h: number): void {
    const dt = audio.dt;
    if (w !== this.w || h !== this.h) this.resize(w, h);
    this.pulse = audio.pulse;

    if (audio.beat) this.flicker = audio.beatDetected ? 0.42 + Math.random() * 0.2 : 0.72;
    const wobble = 0.94 + Math.sin(audio.time * 29) * 0.035 + Math.sin(audio.time * 11) * 0.02;
    this.flicker += (wobble - this.flicker) * Math.min(1, dt * 7);

    if (audio.beat && Math.random() < 0.16) this.glitch = 0.1 + Math.random() * 0.12;
    this.glitch = Math.max(0, this.glitch - dt * 1.4);

    this.scareLock -= dt;
    const strong = audio.beatDetected && audio.bass > 0.58 && audio.level > 0.42 && audio.time > 4;
    if (strong && this.scareLock <= 0 && this.scare <= 0 && Math.random() < 0.5) {
      this.scare = 1;
      this.scareLock = SCARE_GAP;
    }
    if (this.scare > 0) {
      this.scare = Math.max(0, this.scare - dt / SCARE_HOLD);
    }

    for (const d of this.drips) {
      d.y += d.vy * dt * (0.65 + audio.level * 0.7);
      if (d.y > h + 20) Object.assign(d, this.freshDrip(false));
    }
    for (const e of this.eyes) {
      e.x += e.vx * dt * 0.15;
      if (e.x > w * 0.92) e.vx = -Math.abs(e.vx);
      if (e.x < w * 0.08) e.vx = Math.abs(e.vx);
    }
    for (const f of this.fog) {
      f.x += f.vx * dt * (0.6 + audio.level);
      if (f.x < -f.r) f.x = w + f.r;
      if (f.x > w + f.r) f.x = -f.r;
    }
  }

  /** Fog, eyes, drips, beat blackout, jump-scare. Skip while a brawl covers the frame. */
  drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    this.drawFog(ctx, w, h, t);
    this.drawEyes(ctx, t);
    this.drawDrips(ctx);
    const darkness = Math.max(0, 1 - this.flicker);
    if (darkness > 0.03) {
      ctx.fillStyle = `rgba(0,0,0,${darkness * 0.62})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.scare > 0.02) this.drawScare(ctx, w, h);
  }

  /**
   * Coarse grain, a few VHS bands, and an edge vignette.
   * The vignette is a border stroke so the centre of the frame is not re-blended.
   */
  drawGrade(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.fillStyle = '#0a0608';
    const step = 24;
    for (let y = 10; y < h; y += step) {
      ctx.globalAlpha = 0.22;
      ctx.fillRect(0, y, w, 3);
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 14; i++) {
      const n = Math.sin(i * 12.9898 + t * 9) * 43758.5453;
      const r = n - Math.floor(n);
      const n2 = Math.sin(i * 78.233 + t * 13) * 24634.6345;
      const r2 = n2 - Math.floor(n2);
      const size = 10 + r * 26;
      ctx.globalAlpha = 0.08 + r2 * 0.16;
      ctx.fillStyle = r2 > 0.5 ? '#f2e6d8' : '#050208';
      ctx.fillRect(r * w, r2 * h, size, size * 0.6);
    }
    ctx.globalAlpha = 1;

    if (this.glitch > 0.01) {
      for (let i = 0; i < 3; i++) {
        const y = ((t * 180 + i * 137) % (h + 40)) - 20;
        const shift = (i - 1) * 18 * this.glitch * 8;
        ctx.fillStyle = i === 1 ? `rgba(255,20,40,${this.glitch * 0.55})` : `rgba(0,255,240,${this.glitch * 0.28})`;
        ctx.fillRect(shift, y, w, 8 + i * 6);
      }
    }

    const edge = Math.min(w, h) * 0.16;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = edge;
    ctx.strokeRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(90,0,12,${0.18 + this.pulse * 0.35})`;
    ctx.lineWidth = Math.max(18, edge * 0.28);
    ctx.strokeRect(edge * 0.15, edge * 0.15, w - edge * 0.3, h - edge * 0.3);
  }

  private freshDrip(anywhere: boolean): Drip {
    const green = Math.random() < 0.28;
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : -10 - Math.random() * 40,
      vy: 70 + Math.random() * 130,
      w: 4 + Math.random() * 5,
      len: 14 + Math.random() * 28,
      color: green ? '#3dcc45' : '#c41018',
    };
  }

  private drawFog(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const rise = h * (0.78 + 0.04 * Math.sin(t * 0.17));
    const band = ctx.createLinearGradient(0, rise, 0, h);
    band.addColorStop(0, 'rgba(40,6,10,0)');
    band.addColorStop(1, 'rgba(28,4,8,0.45)');
    ctx.fillStyle = band;
    ctx.fillRect(0, rise, w, h - rise);

    ctx.fillStyle = '#4a1418';
    for (const f of this.fog) {
      const y = f.y + Math.sin(t * 0.23 + f.x * 0.01) * h * 0.02;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.ellipse(f.x, y, f.r, f.r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawEyes(ctx: CanvasRenderingContext2D, t: number): void {
    for (const e of this.eyes) {
      const blink = Math.sin(t * 0.85 + e.phase);
      const lid = blink > 0.93 ? 0.08 : 1;
      const open = (0.45 + 0.55 * Math.max(0, Math.sin(t * 0.6 + e.phase))) * lid;
      const eh = Math.max(1.5, e.size * open);
      for (const side of [-1, 1]) {
        const x = e.x + side * e.size * 1.55;
        ctx.fillStyle = 'rgba(255,24,32,0.95)';
        ctx.beginPath();
        ctx.ellipse(x, e.y, Math.max(4, e.size * 0.7), eh * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff0f0';
        ctx.beginPath();
        ctx.ellipse(x, e.y, Math.max(2, e.size * 0.28), Math.max(2, eh * 0.45), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0000';
        ctx.beginPath();
        ctx.arc(x + side * e.size * 0.05, e.y, Math.max(2, e.size * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawDrips(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round';
    for (const d of this.drips) {
      ctx.strokeStyle = '#140206';
      ctx.lineWidth = d.w + 3;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y + d.len, d.w * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawScare(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = this.scare;
    if (a > 0.72) {
      ctx.fillStyle = `rgba(255,250,245,${(a - 0.72) / 0.28})`;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.fillStyle = `rgba(6,0,0,${0.88 * Math.min(1, a * 1.4)})`;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.48;
    const r = Math.min(w, h) * 0.28;
    ctx.fillStyle = '#123018';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(6, r * 0.05);
    ctx.strokeStyle = '#050805';
    ctx.stroke();
    for (const side of [-1, 1]) {
      const x = cx + side * r * 0.38;
      const y = cy - r * 0.08;
      ctx.fillStyle = '#ff1a1a';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.22, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6ea';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#140004';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1a0508';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.42, cy + r * 0.28);
    for (let i = 0; i <= 7; i++) {
      const px = cx - r * 0.42 + (i / 7) * r * 0.84;
      const py = cy + r * 0.28 + (i % 2 === 0 ? 0 : r * 0.16);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}
