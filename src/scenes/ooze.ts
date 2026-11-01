import type { Scene, SceneContext } from './types';
import { PALETTE, paintTitle, rgba, mulberry32 } from './palette';
import { drawShell } from './shapes';

interface Particle {
  angle: number;
  radius: number; // 0..1 of max radius
  speed: number;
  size: number;
  hue: number; // 0..1 across the palette
  arm: number;
}

interface Ripple {
  r: number;
  alpha: number;
}

interface FogBlob {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
}

const OOZE_COLORS = [PALETTE.acid, PALETTE.greenDark, PALETTE.blood, PALETTE.purpleDeep];

/**
 * Scene 4 — "Mutagen Vortex": a swirling galaxy of ooze particles whose arms
 * twist with the spectrum, a waveform halo, drifting fog and beat ripples
 * radiating from a pulsing shell at the centre.
 */
export class OozeScene implements Scene {
  readonly id = 'ooze';
  readonly name = 'Ooze';
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private fog: FogBlob[] = [];
  private rotation = 0;
  private flash = 0;

  resize(w: number, h: number): void {
    const rand = mulberry32(2024);
    this.particles = Array.from({ length: 340 }, (_, i) => ({
      angle: rand() * Math.PI * 2,
      radius: Math.pow(rand(), 0.7),
      speed: 0.2 + rand() * 0.6,
      size: 1.5 + rand() * 3.5,
      hue: rand(),
      arm: i % 3,
    }));
    this.fog = Array.from({ length: 6 }, (_, i) => ({
      x: rand() * w,
      y: rand() * h,
      r: h * (0.2 + rand() * 0.3),
      vx: (rand() - 0.5) * 20,
      vy: (rand() - 0.5) * 12,
      color: i % 2 ? PALETTE.purpleDeep : PALETTE.greenDark,
    }));
  }

  enter(): void {
    this.ripples = [];
  }

  draw({ ctx, w, h, audio, dt }: SceneContext): void {
    if (audio.beat) {
      this.ripples.push({ r: 0, alpha: audio.beatDetected ? 1 : 0.5 });
      if (this.ripples.length > 8) this.ripples.shift();
      this.flash = Math.max(this.flash, audio.beatDetected ? 1 : 0.4);
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.rotation += dt * (0.25 + audio.level * 1.2 + audio.bass * 0.8);

    // Motion-blur trail instead of a hard clear
    ctx.fillStyle = 'rgba(4,1,6,0.38)';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.46;

    // Fog
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fog) {
      f.x += f.vx * dt * (1 + audio.level);
      f.y += f.vy * dt * (1 + audio.level);
      if (f.x < -f.r) f.x = w + f.r;
      if (f.x > w + f.r) f.x = -f.r;
      if (f.y < -f.r) f.y = h + f.r;
      if (f.y > h + f.r) f.y = -f.r;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1 + audio.mid * 0.3));
      g.addColorStop(0, rgba(f.color, 0.18 + audio.level * 0.1));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles in a 3-arm spiral; each arm reads a different band
    const bands = [audio.bass, audio.mid, audio.treble];
    for (const p of this.particles) {
      const band = bands[p.arm];
      p.angle += dt * p.speed * (0.4 + band * 1.6) * (p.arm === 1 ? -1 : 1);
      p.radius += dt * 0.05 * (0.3 + band);
      if (p.radius > 1) p.radius = 0.03;
      const binIdx = Math.min(audio.bins - 1, Math.floor(p.radius * p.radius * audio.bins * 0.5));
      const fv = audio.freq[binIdx];
      const twist = p.radius * 5 + this.rotation + (p.arm * Math.PI * 2) / 3;
      const a = p.angle * 0.25 + twist;
      const r = p.radius * maxR * (1 + fv * 0.35 + audio.pulse * 0.08);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.78;
      const color = OOZE_COLORS[Math.floor(p.hue * OOZE_COLORS.length) % OOZE_COLORS.length];
      const size = p.size * (0.6 + fv * 1.8 + audio.pulse * 0.5);
      ctx.fillStyle = rgba(color, 0.35 + fv * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Beat ripples
    for (const rp of this.ripples) {
      rp.r += dt * maxR * 1.8;
      rp.alpha -= dt * 1.4;
      if (rp.alpha <= 0) continue;
      ctx.strokeStyle = rgba(PALETTE.acid, rp.alpha * 0.8);
      ctx.lineWidth = 4 + rp.alpha * 8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rp.r, rp.r * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.ripples = this.ripples.filter((r) => r.alpha > 0);

    // Waveform halo around the centre
    const haloR = maxR * 0.3 + audio.bass * maxR * 0.1;
    const n = audio.wave.length;
    ctx.beginPath();
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2 + this.rotation * 0.3;
      const s = audio.wave[Math.floor((i / 256) * (n - 1))];
      const r = haloR + s * maxR * 0.16;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(PALETTE.acid, 0.35);
    ctx.lineWidth = 14 + audio.level * 10;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.acid;
    ctx.lineWidth = 5 + audio.level * 4;
    ctx.stroke();

    // Central shell emblem pulsing with the kick
    const shellR = maxR * (0.14 + audio.bass * 0.05 + audio.pulse * 0.05);
    const glow = ctx.createRadialGradient(cx, cy, shellR * 0.5, cx, cy, shellR * 2.5);
    glow.addColorStop(0, rgba(PALETTE.orange, 0.45 + this.flash * 0.4));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, shellR * 2.5, 0, Math.PI * 2);
    ctx.fill();
    drawShell(ctx, cx, cy, shellR, 0.95, audio.time);

    // Corner-mounted spectrum arcs for extra motion
    const arcBars = 48;
    for (let i = 0; i < arcBars; i++) {
      const idx = Math.min(audio.bins - 1, Math.floor(Math.pow(i / arcBars, 1.6) * audio.bins * 0.6));
      const v = audio.freq[idx];
      const a0 = -Math.PI / 2 + (i / arcBars) * Math.PI * 2;
      const r0 = maxR * 1.02;
      ctx.strokeStyle = rgba(i % 2 ? PALETTE.purple : PALETTE.orange, 0.25 + v * 0.7);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * r0 * 1.4, cy + Math.sin(a0) * r0);
      ctx.lineTo(cx + Math.cos(a0) * (r0 * 1.4 + v * maxR * 0.25), cy + Math.sin(a0) * (r0 + v * maxR * 0.25));
      ctx.stroke();
    }

    if (this.flash > 0.01) {
      ctx.fillStyle = rgba(PALETTE.blood, this.flash * 0.14);
      ctx.fillRect(0, 0, w, h);
    }

    paintTitle(ctx, 'MUTAGEN VORTEX', w, h, PALETTE.acid);
  }
}
