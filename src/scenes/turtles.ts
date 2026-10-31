import type { Scene, SceneContext } from './types';
import { DISPLAY_FONT, PALETTE, TURTLES, rgba, clamp01, mulberry32 } from './palette';
import { drawTurtleHead } from './shapes';

interface Spark {
  x: number;
  y: number;
  vy: number;
  size: number;
  phase: number;
}

/**
 * Scene 1 — "Heroes in a Half Shell": the four brothers, each owning a slice
 * of the spectrum. Radial bars and rings around each head react to their
 * band; the whole line-up pulses with the kick.
 */
export class TurtlesScene implements Scene {
  readonly id = 'turtles';
  readonly name = 'Turtles';
  private sparks: Spark[] = [];
  private flash = 0;
  private bandLevels = [0, 0, 0, 0];

  resize(w: number, h: number): void {
    const rand = mulberry32(7);
    this.sparks = Array.from({ length: 90 }, () => ({
      x: rand() * w,
      y: rand() * h,
      vy: 8 + rand() * 24,
      size: 1 + rand() * 2.5,
      phase: rand() * Math.PI * 2,
    }));
  }

  draw({ ctx, w, h, audio, t, dt }: SceneContext): void {
    if (audio.beat) this.flash = Math.max(this.flash, audio.beatDetected ? 1 : 0.6);
    this.flash = Math.max(0, this.flash - dt * 2.6);

    // Background
    const bg = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.1, w / 2, h * 0.55, h * 0.95);
    bg.addColorStop(0, `rgba(59,10,94,${0.45 + this.flash * 0.4})`);
    bg.addColorStop(1, PALETTE.black);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Rising ooze sparks
    ctx.fillStyle = rgba(PALETTE.acid, 0.6);
    for (const s of this.sparks) {
      s.y -= s.vy * dt * (1 + audio.level * 2);
      if (s.y < -10) {
        s.y = h + 10;
        s.x = Math.random() * w;
      }
      const a = 0.25 + 0.5 * Math.abs(Math.sin(t * 2 + s.phase));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 + audio.treble), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Spectrum split into four slices, one per turtle (low -> high)
    const bins = audio.bins;
    const sliceCount = 4;
    // Use a log-ish split so bass does not hog all the bins
    const edges = [0, Math.floor(bins * 0.04), Math.floor(bins * 0.12), Math.floor(bins * 0.35), bins];
    const headR = Math.min(w / 15, h / 9.5);
    const cy = h * 0.46;
    const barsPerTurtle = 48;

    for (let i = 0; i < sliceCount; i++) {
      const turtle = TURTLES[i];
      const cx = (w / (sliceCount * 2)) * (i * 2 + 1);
      const lo = edges[i];
      const hi = edges[i + 1];
      let energy = 0;
      const values: number[] = [];
      for (let b = 0; b < barsPerTurtle; b++) {
        const idx = Math.min(bins - 1, lo + Math.floor(((hi - lo) * b) / barsPerTurtle));
        const v = audio.freq[idx];
        values.push(v);
        energy += v;
      }
      energy /= barsPerTurtle;
      this.bandLevels[i] += (clamp01(energy * (1.1 + i * 0.3)) - this.bandLevels[i]) * Math.min(1, dt * 10);
      const band = this.bandLevels[i];

      // Radial bars around the head
      const innerR = headR * 1.3 + audio.pulse * headR * 0.12;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, (Math.PI * 2 * innerR) / barsPerTurtle * 0.5);
      for (let b = 0; b < barsPerTurtle; b++) {
        const a = (b / barsPerTurtle) * Math.PI * 2 - Math.PI / 2;
        const len = headR * 0.12 + values[b] * headR * 1.0;
        ctx.strokeStyle = rgba(turtle.mask, 0.35 + values[b] * 0.65);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
        ctx.lineTo(Math.cos(a) * (innerR + len), Math.sin(a) * (innerR + len));
        ctx.stroke();
      }
      // Bass rings
      for (let k = 0; k < 3; k++) {
        const rr = innerR * (1.1 + k * 0.2) + band * headR * (0.4 + k * 0.15) + audio.pulse * headR * 0.18;
        ctx.strokeStyle = rgba(k === 1 ? PALETTE.acid : turtle.mask, (0.35 - k * 0.09) * (0.4 + band));
        ctx.lineWidth = 2 + band * 5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      const scale = 1 + audio.pulse * 0.12 + band * 0.08;
      drawTurtleHead(ctx, cx, cy, headR * scale, {
        mask: turtle.mask,
        eyeOpen: 0.3 + band * 0.7 + audio.pulse * 0.3,
        tailWave: band,
        t,
        glow: turtle.glow,
        glowAmount: 0.3 + band * 0.7,
      });

      // Name plate
      ctx.save();
      ctx.font = `${Math.round(headR * 0.55)}px ${DISPLAY_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = turtle.mask;
      ctx.shadowColor = turtle.mask;
      ctx.shadowBlur = 12 + band * 20;
      ctx.fillText(turtle.short, cx, cy + headR * 2.2);
      ctx.restore();
    }

    // Bottom spectrum strip, coloured by turtle slice
    const stripH = h * 0.16;
    const barCount = 96;
    const bw = w / barCount;
    for (let b = 0; b < barCount; b++) {
      const idx = Math.min(bins - 1, Math.floor(Math.pow(b / barCount, 1.6) * bins * 0.8));
      const v = audio.freq[idx];
      const slice = idx < edges[1] ? 0 : idx < edges[2] ? 1 : idx < edges[3] ? 2 : 3;
      const color = TURTLES[slice].mask;
      const bh = v * stripH * (1 + audio.pulse * 0.2);
      const grad = ctx.createLinearGradient(0, h - bh, 0, h);
      grad.addColorStop(0, color);
      grad.addColorStop(1, rgba(PALETTE.orange, 0.2));
      ctx.fillStyle = grad;
      ctx.fillRect(b * bw + 1, h - bh, bw - 2, bh);
    }

    // Beat flash vignette
    if (this.flash > 0.01) {
      ctx.fillStyle = rgba(PALETTE.orange, this.flash * 0.12);
      ctx.fillRect(0, 0, w, h);
    }

    // Title
    ctx.save();
    ctx.font = `${Math.round(Math.min(w, h) * 0.07)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.orange;
    ctx.shadowColor = PALETTE.purple;
    ctx.shadowBlur = 18;
    ctx.fillText('HEROES IN A HALF SHELL', w / 2, h * 0.04);
    ctx.restore();
  }
}
