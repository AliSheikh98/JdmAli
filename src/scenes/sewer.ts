import type { Scene, SceneContext } from './types';
import { DISPLAY_FONT, PALETTE, rgba, mulberry32 } from './palette';
import { drawBat, drawPumpkin } from './shapes';

interface FlyingBat {
  z: number; // 1 = far (vanishing point), 0 = at camera
  angle: number;
  radius: number;
  flap: number;
  speed: number;
}

interface FloatingPumpkin {
  x: number; // 0..1 across the width
  z: number;
  bob: number;
  size: number;
}

/**
 * Scene 2 — "Down in the Sewer": a tunnel rushing toward the viewer, its
 * rings lit by the kick, pumpkins bobbing on a river of glowing ooze whose
 * surface is the live waveform, and bats pouring out of the dark.
 */
export class SewerScene implements Scene {
  readonly id = 'sewer';
  readonly name = 'Sewer';
  private progress = 0;
  private bats: FlyingBat[] = [];
  private pumpkins: FloatingPumpkin[] = [];
  private ringFlash: number[] = [];
  private flash = 0;
  private readonly rings = 14;

  resize(): void {
    const rand = mulberry32(42);
    this.bats = Array.from({ length: 12 }, () => ({
      z: rand(),
      angle: rand() * Math.PI * 2,
      radius: 0.15 + rand() * 0.5,
      flap: rand() * Math.PI * 2,
      speed: 0.12 + rand() * 0.2,
    }));
    this.pumpkins = Array.from({ length: 7 }, (_, i) => ({
      x: 0.12 + (i / 7) * 0.8 + (rand() - 0.5) * 0.08,
      z: rand(),
      bob: rand() * Math.PI * 2,
      size: 0.6 + rand() * 0.7,
    }));
    this.ringFlash = new Array(this.rings).fill(0);
  }

  draw({ ctx, w, h, audio, t, dt }: SceneContext): void {
    const speed = 0.25 + audio.level * 0.9 + audio.bass * 0.5;
    this.progress = (this.progress + dt * speed) % 1;
    if (audio.beat) {
      this.flash = Math.max(this.flash, audio.beatDetected ? 1 : 0.5);
      this.ringFlash[0] = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 3);

    ctx.fillStyle = PALETTE.black;
    ctx.fillRect(0, 0, w, h);

    const vx = w / 2;
    const vy = h * 0.45;
    const maxW = w * 0.95;
    const maxH = h * 1.0;

    // Tunnel rings (far to near). Each ring is a rounded rectangle; the
    // flash travels outward ring by ring on each beat.
    for (let i = this.rings - 1; i >= 0; i--) {
      // propagate flash towards the camera
      if (i > 0) this.ringFlash[i] = Math.max(this.ringFlash[i] * (1 - dt * 3), this.ringFlash[i - 1] * 0.86);
      else this.ringFlash[0] *= 1 - dt * 3;
    }
    for (let i = this.rings - 1; i >= 0; i--) {
      const zi = ((i + this.progress) / this.rings) ** 2.2;
      const z = Math.max(0.02, zi);
      const rw = maxW * z;
      const rh = maxH * z;
      const x = vx - rw / 2;
      const y = vy - rh / 2;
      const depthFade = 0.2 + z * 0.8;
      const f = this.ringFlash[i];
      const base = i % 2 === 0 ? PALETTE.green : PALETTE.purple;
      ctx.strokeStyle = rgba(f > 0.3 ? PALETTE.acid : base, depthFade * (0.35 + f * 0.65));
      ctx.lineWidth = 2 + z * 10 + f * 6 + audio.bass * 6 * z;
      ctx.beginPath();
      const rad = Math.min(rw, rh) * 0.35;
      ctx.roundRect(x, y, rw, rh, rad);
      ctx.stroke();
      // Brick ticks along the ring
      if (i % 3 === 0) {
        ctx.strokeStyle = rgba(PALETTE.orange, depthFade * 0.25);
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 8; k++) {
          const px = x + (rw / 8) * (k + 0.5);
          ctx.beginPath();
          ctx.moveTo(px, y);
          ctx.lineTo(px, y + rh * 0.03);
          ctx.stroke();
        }
      }
    }

    // Vanishing-point glow pulsing with the bass
    const glowR = h * (0.06 + audio.bass * 0.18 + audio.pulse * 0.08);
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, glowR * 3);
    g.addColorStop(0, rgba(PALETTE.acid, 0.9));
    g.addColorStop(0.3, rgba(PALETTE.green, 0.5));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(vx, vy, glowR * 3, 0, Math.PI * 2);
    ctx.fill();

    // Ooze river: waveform as the surface
    const waterTop = h * 0.7;
    const wave = audio.wave;
    const n = wave.length;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const amp = h * 0.05 + audio.level * h * 0.1;
    for (let i = 0; i <= 160; i++) {
      const x = (i / 160) * w;
      const sample = wave[Math.floor((i / 160) * (n - 1))];
      const y = waterTop + sample * amp + Math.sin(i * 0.3 + t * 2) * 3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const water = ctx.createLinearGradient(0, waterTop - amp, 0, h);
    water.addColorStop(0, rgba(PALETTE.acid, 0.85));
    water.addColorStop(0.25, rgba(PALETTE.green, 0.75));
    water.addColorStop(1, rgba(PALETTE.greenDark, 0.9));
    ctx.fillStyle = water;
    ctx.fill();
    // Two strokes (wide translucent + thin bright) stand in for a glow;
    // shadowBlur across the full width is too costly at 1080p.
    ctx.strokeStyle = rgba(PALETTE.acid, 0.35);
    ctx.lineWidth = 10 + audio.level * 14;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.acid;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Floating pumpkins drift toward the camera
    for (const p of this.pumpkins) {
      p.z -= dt * speed * 0.25;
      if (p.z < 0) {
        p.z = 1;
        p.x = 0.1 + Math.random() * 0.8;
      }
      const z = p.z;
      const scale = 0.08 + (1 - z) * 0.9;
      const x = vx + (p.x - 0.5) * w * scale * 1.1;
      const y = waterTop + (h - waterTop) * (1 - z) * 0.9 + Math.sin(t * 2 + p.bob) * 4 * scale - 10;
      const r = h * 0.07 * p.size * scale;
      if (r > 2) drawPumpkin(ctx, x, y, r, 0.4 + audio.mid * 0.6 + audio.pulse * 0.4, t);
    }

    // Bats flying out of the tunnel
    for (const b of this.bats) {
      b.z -= dt * (b.speed + audio.treble * 0.5 + speed * 0.1);
      b.flap += dt * (10 + audio.treble * 16);
      if (b.z < -0.05) {
        b.z = 1;
        b.angle = Math.random() * Math.PI * 2;
      }
      const z = Math.max(0.01, b.z);
      const spread = (1 - z) * h * 0.65 * b.radius + 10;
      const x = vx + Math.cos(b.angle + t * 0.3) * spread * (w / h);
      const y = vy + Math.sin(b.angle + t * 0.3) * spread - (1 - z) * h * 0.1;
      const size = 6 + (1 - z) * (1 - z) * h * 0.09;
      drawBat(ctx, x, y, size, b.flap, z > 0.6 ? '#3b2748' : '#0a0410');
    }

    // Beat flash
    if (this.flash > 0.01) {
      ctx.fillStyle = rgba(PALETTE.acid, this.flash * 0.1);
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.font = `${Math.round(Math.min(w, h) * 0.065)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.acid;
    ctx.shadowColor = PALETTE.green;
    ctx.shadowBlur = 16;
    ctx.fillText('DOWN IN THE SEWER', w / 2, h * 0.04);
    ctx.restore();
  }
}
