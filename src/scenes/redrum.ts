import type { Scene, SceneContext } from './types';
import { DISPLAY_FONT, clamp01 } from './palette';
import { drawLightning } from './shapes';

/**
 * Scene 5 — "Redrum": an original laser-eyed head, beat-synced lightning,
 * blood squirts and sticking splats, and the word REDRUM flipping over to
 * show MURDER. Everything punches hard on the kick.
 */

interface Squirt {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

interface Bolt {
  x: number;
  seed: number;
  life: number;
  fromEye: boolean;
}

interface Ring {
  r: number;
  alpha: number;
}

const MAX_SQUIRTS = 48;

export class RedrumScene implements Scene {
  readonly id = 'redrum';
  readonly name = 'Redrum';

  private kick = 0;
  private flip = 0;
  private squirts: Squirt[] = [];
  private bolts: Bolt[] = [];
  private rings: Ring[] = [];
  private splat: HTMLCanvasElement = document.createElement('canvas');
  private sctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private fadeAcc = 0;

  constructor() {
    this.squirts = Array.from({ length: MAX_SQUIRTS }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, life: 0,
    }));
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const next = document.createElement('canvas');
    next.width = Math.max(2, Math.floor(w));
    next.height = Math.max(2, Math.floor(h));
    const ctx = next.getContext('2d');
    if (!ctx) return;
    if (this.splat.width > 2) ctx.drawImage(this.splat, 0, 0, next.width, next.height);
    this.splat = next;
    this.sctx = ctx;
  }

  draw({ ctx, w, h, audio, t, dt }: SceneContext): void {
    if (w !== this.w || h !== this.h) this.resize(w, h);
    if (audio.beat) this.kick = 1;
    this.kick *= Math.exp(-dt * 6.5);
    const punch = 1 + this.kick * 0.8 + audio.bass * 0.35;
    this.flip += dt * (0.7 + audio.level * 1.6 + this.kick * 2.4);

    if (audio.beat) this.onBeat(w, h, audio.bass, audio.beatDetected);

    this.stepGore(dt, h);
    this.drawBackground(ctx, w, h, punch);
    this.drawLasers(ctx, w, h, t, punch);
    this.drawBolts(ctx, h, dt);
    this.drawRings(ctx, w, h, dt, punch);
    if (this.splat.width > 2) ctx.drawImage(this.splat, 0, 0, w, h);
    this.drawSquirts(ctx);
    this.drawHead(ctx, w, h, punch);
    this.drawWord(ctx, w, h, punch);
    this.drawBars(ctx, w, h, audio.freq, audio.bins, punch);
  }

  private onBeat(w: number, h: number, bass: number, detected: boolean): void {
    const cx = w / 2;
    const cy = h * 0.52;
    const power = 0.65 + bass * 0.7 + (detected ? 0.35 : 0);
    this.rings.push({ r: Math.min(w, h) * 0.12, alpha: 1 });
    if (this.rings.length > 4) this.rings.shift();

    const n = detected ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const slot = this.squirts.find((s) => !s.active) ?? this.squirts[i % MAX_SQUIRTS];
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (420 + Math.random() * 520) * power;
      slot.active = true;
      slot.x = cx + Math.cos(ang) * 20;
      slot.y = cy + 10;
      slot.vx = Math.cos(ang) * speed;
      slot.vy = Math.sin(ang) * speed - 180;
      slot.r = (8 + Math.random() * 14) * (0.7 + bass);
      slot.life = 0.7 + Math.random() * 0.45;
    }
    this.stamp(cx, cy + h * 0.08, (28 + bass * 50) * power, 7);

    this.bolts.push({
      x: w * (0.15 + Math.random() * 0.7),
      seed: Math.floor(Math.random() * 1e6),
      life: 0.22,
      fromEye: false,
    });
    if (detected) {
      this.bolts.push({
        x: cx,
        seed: Math.floor(Math.random() * 1e6),
        life: 0.18,
        fromEye: true,
      });
    }
    if (this.bolts.length > 4) this.bolts.splice(0, this.bolts.length - 4);
  }

  private stamp(x: number, y: number, r: number, droplets: number): void {
    const c = this.sctx;
    if (!c) return;
    c.fillStyle = '#c41018';
    c.beginPath();
    c.ellipse(x, y, r, r * 0.62, Math.random() * 0.6, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < droplets; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.4 + Math.random());
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r * (0.12 + Math.random() * 0.2), 0, Math.PI * 2);
      c.fill();
    }
  }

  private stepGore(dt: number, h: number): void {
    for (const s of this.squirts) {
      if (!s.active) continue;
      s.vy += 980 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life < 0.35 && s.life + dt >= 0.35) this.stamp(s.x, s.y, s.r * 1.4, 3);
      if (s.life <= 0 || s.y > h + 30) s.active = false;
    }
    this.fadeAcc += dt;
    if (this.fadeAcc > 0.5 && this.sctx) {
      this.fadeAcc = 0;
      const c = this.sctx;
      c.save();
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = 'rgba(0,0,0,0.94)';
      c.fillRect(0, 0, this.splat.width, this.splat.height);
      c.restore();
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, punch: number): void {
    ctx.fillStyle = '#070103';
    ctx.fillRect(0, 0, w, h);
    const glowR = Math.min(w, h) * (0.2 + (punch - 1) * 0.45);
    const g = ctx.createRadialGradient(w / 2, h * 0.52, glowR * 0.2, w / 2, h * 0.52, glowR * 2.2);
    g.addColorStop(0, `rgba(160,0,16,${0.35 + (punch - 1) * 0.4})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (this.kick > 0.45) {
      ctx.fillStyle = `rgba(180,0,16,${(this.kick - 0.45) * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawLasers(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    punch: number,
  ): void {
    const headR = Math.min(w, h) * 0.16 * (1 + this.kick * 0.55);
    const cx = w / 2;
    const cy = h * 0.52;
    const eyeY = cy - headR * 0.06;
    const reach = Math.max(w, h) * (0.45 + this.kick * 0.7);
    const width = 10 + this.kick * 36 + (punch - 1) * 8;
    const sweep = Math.sin(t * 1.6) * 0.22 + this.kick * 0.15;
    const eyes: [number, number][] = [
      [cx - headR * 0.4, eyeY],
      [cx + headR * 0.4, eyeY],
    ];
    ctx.lineCap = 'round';
    eyes.forEach(([ex, ey], side) => {
      const dir = side === 0 ? -1 : 1;
      const base = dir * (0.15 + sweep);
      this.strokeBeam(ctx, ex, ey, base, reach, width);
      const fans = 4;
      for (let i = 0; i < fans; i++) {
        const spread = dir * (0.45 + i * 0.28) + sweep * 0.4;
        const fanW = width * (0.35 + this.kick * 0.25);
        this.strokeBeam(ctx, ex, ey, spread, reach * (0.55 + this.kick * 0.45), fanW);
      }
    });
  }

  private strokeBeam(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    len: number,
    width: number,
  ): void {
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    ctx.strokeStyle = 'rgba(255,20,28,0.9)';
    ctx.lineWidth = Math.max(6, width);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff4ea';
    ctx.lineWidth = Math.max(2, width * 0.22);
    ctx.stroke();
  }

  private drawBolts(ctx: CanvasRenderingContext2D, h: number, dt: number): void {
    for (const bolt of this.bolts) {
      bolt.life -= dt;
      if (bolt.life <= 0) continue;
      ctx.globalAlpha = clamp01(bolt.life / 0.16);
      const rand = mulberry(bolt.seed);
      const y0 = bolt.fromEye ? h * 0.42 : -10;
      const y1 = bolt.fromEye ? h * 0.75 : h * (0.45 + rand() * 0.2);
      drawLightning(ctx, bolt.x, y0, y1, rand, Math.max(18, h * 0.02), '#ff2a2a');
      ctx.globalAlpha = 1;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  private drawRings(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dt: number,
    punch: number,
  ): void {
    const cx = w / 2;
    const cy = h * 0.52;
    for (const ring of this.rings) {
      ring.r += dt * Math.min(w, h) * (0.9 + punch * 0.35);
      ring.alpha -= dt * 1.5;
      if (ring.alpha <= 0) continue;
      ctx.strokeStyle = `rgba(220,10,24,${ring.alpha * 0.85})`;
      ctx.lineWidth = 6 + ring.alpha * 14 * punch;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.rings = this.rings.filter((r) => r.alpha > 0);
  }

  private drawSquirts(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#e10618';
    for (const s of this.squirts) {
      if (!s.active) continue;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * (1 + this.kick * 0.45), s.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D, w: number, h: number, punch: number): void {
    const headR = Math.min(w, h) * 0.16 * (1 + this.kick * 0.55);
    const cx = w / 2;
    const cy = h * 0.52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(punch > 1 ? 1 + (punch - 1) * 0.15 : 1, punch > 1 ? 1 + (punch - 1) * 0.15 : 1);

    ctx.fillStyle = '#14060c';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.15, headR * 1.15, headR * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(6, headR * 0.06);
    ctx.strokeStyle = '#3a0008';
    ctx.stroke();

    ctx.fillStyle = '#1c0810';
    ctx.beginPath();
    ctx.ellipse(0, 0, headR, headR * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff1a22';
    ctx.lineWidth = Math.max(4, headR * 0.045);
    ctx.stroke();

    const eyeR = headR * (0.22 + this.kick * 0.08);
    for (const side of [-1, 1]) {
      const ex = side * headR * 0.38;
      ctx.fillStyle = '#ff1a1a';
      ctx.beginPath();
      ctx.ellipse(ex, -headR * 0.05, eyeR * 1.15, eyeR * (0.7 + this.kick * 0.35), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6ea';
      ctx.beginPath();
      ctx.arc(ex, -headR * 0.05, eyeR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#140004';
      ctx.beginPath();
      ctx.arc(ex + side * eyeR * 0.08, -headR * 0.05, Math.max(3, eyeR * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#4a0008';
    ctx.lineWidth = Math.max(4, headR * 0.05);
    ctx.beginPath();
    ctx.moveTo(-headR * 0.28, headR * 0.42);
    for (let i = 0; i <= 6; i++) {
      const px = -headR * 0.28 + (i / 6) * headR * 0.56;
      const py = headR * 0.42 + (i % 2 === 0 ? 0 : headR * 0.1);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawWord(ctx: CanvasRenderingContext2D, w: number, h: number, punch: number): void {
    const turns = this.flip;
    const front = Math.floor(turns) % 2 === 0;
    const word = front ? 'REDRUM' : 'MURDER';
    const squash = Math.max(0.05, Math.abs(Math.cos(turns * Math.PI)));
    const size = Math.round(Math.min(w, h) * 0.14 * punch);
    ctx.save();
    ctx.translate(w / 2, h * 0.14);
    ctx.scale(squash, 1);
    ctx.font = `${size}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, size * 0.08);
    ctx.strokeStyle = '#140004';
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = front ? '#ff1a1a' : '#fff4ea';
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }

  private drawBars(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    freq: Float32Array,
    bins: number,
    punch: number,
  ): void {
    const count = 48;
    const bw = w / count;
    const strip = h * 0.22 * punch;
    for (let i = 0; i < count; i++) {
      const idx = Math.min(bins - 1, Math.floor(Math.pow(i / count, 1.5) * bins * 0.7));
      const v = freq[idx] ?? 0;
      const bh = Math.max(8, v * strip);
      ctx.fillStyle = i % 2 === 0 ? '#ff1a1a' : '#7a0610';
      ctx.fillRect(i * bw + 2, h - bh, Math.max(4, bw - 4), bh);
    }
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
