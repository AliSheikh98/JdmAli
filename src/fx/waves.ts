import type { AudioFrame } from '../audio/types';

/**
 * Big scratchy sine waves drawn over every scene. The smooth sine follows
 * the beat; a coarse jagged offset (not fine noise) tears the line so it
 * reads like a scratched waveform on a projector.
 */

interface WaveSpec {
  y: number;
  color: string;
  cycles: number;
  amp: number;
  scratch: number;
  phase: number;
  width: number;
}

const WAVES: WaveSpec[] = [
  { y: 0.32, color: '#ff2430', cycles: 1.5, amp: 0.16, scratch: 34, phase: 0.4, width: 16 },
  { y: 0.5, color: '#fff6ea', cycles: 2.2, amp: 0.22, scratch: 46, phase: 1.7, width: 22 },
  { y: 0.68, color: '#b6ff3a', cycles: 1.15, amp: 0.18, scratch: 38, phase: 2.8, width: 16 },
];

export function drawScratchWaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  audio: AudioFrame,
  t: number,
): void {
  const punch = 0.45 + audio.level * 0.7 + audio.bass * 0.55 + audio.pulse * 0.9;
  const samples = audio.wave;
  const steps = 90;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const wave of WAVES) {
    const amp = h * wave.amp * punch;
    const scratch = wave.scratch * (0.45 + audio.treble * 1.1 + audio.pulse * 0.6);
    const speed = 1.1 + audio.level * 1.8;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const sample = samples[Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))] ?? 0;
      const sine = Math.sin(u * Math.PI * 2 * wave.cycles + t * speed + wave.phase);
      const tear = jagged(i, t + wave.phase) * scratch;
      const y = h * wave.y + sine * amp + sample * amp * 0.85 + tear;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = wave.color;
    ctx.lineWidth = wave.width + 6 + audio.pulse * 10;
    ctx.stroke();
  }
}

/** Coarse tear: one jagged value held across a few samples, then a jump. */
function jagged(i: number, t: number): number {
  const bucket = Math.floor(i / 3);
  const tick = Math.floor(t * 14);
  const n = Math.sin(bucket * 12.9898 + tick * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}
