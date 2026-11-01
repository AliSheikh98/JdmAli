import type { AudioEngine } from './audio/engine';
import { HorrorOverlay } from './fx/horror';
import { drawSpiders } from './fx/spiders';
import type { Scene, SceneContext } from './scenes';

/** Backing-store multipliers offered in the control panel and `?scale=`. */
export const RENDER_SCALES = [0.5, 1, 1.5, 2] as const;

export function snapRenderScale(value: number): number {
  let best: number = RENDER_SCALES[0];
  for (const scale of RENDER_SCALES) {
    if (Math.abs(scale - value) < Math.abs(best - value)) best = scale;
  }
  return best;
}

/**
 * Drives the requestAnimationFrame loop. The canvas backing store is the
 * window size times devicePixelRatio times the render scale, and the context
 * is scaled so scenes keep drawing in CSS pixels. A 1920×1080 backing can be
 * forced for wireless casts that report a soft or odd resolution.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scenes: Scene[];
  private readonly audio: AudioEngine;
  readonly horror = new HorrorOverlay();
  private index = 0;
  private w = 0;
  private h = 0;
  private sx = 1;
  private sy = 1;
  private appliedDpr = 1;
  private renderScale = 1;
  private force1080 = false;
  private raf = 0;
  private frames = 0;
  private fpsTime = 0;
  private dwell = 0;
  /** Scenes advance on their own so the party never has to pick one. */
  private readonly dwellEvery = 40;
  fps = 0;
  onSceneChange: ((index: number, scene: Scene) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, scenes: Scene[], audio: AudioEngine) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.scenes = scenes;
    this.audio = audio;
    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', resize);
    this.resize();
  }

  get scene(): Scene {
    return this.scenes[this.index];
  }

  get sceneIndex(): number {
    return this.index;
  }

  get sceneCount(): number {
    return this.scenes.length;
  }

  get scale(): number {
    return this.renderScale;
  }

  get hd(): boolean {
    return this.force1080;
  }

  sceneName(i: number): string {
    return this.scenes[i]?.name ?? `Scene ${i + 1}`;
  }

  setRenderScale(value: number): void {
    this.renderScale = snapRenderScale(value);
    this.resize();
  }

  setForce1080(on: boolean): void {
    this.force1080 = on;
    this.resize();
  }

  setScene(i: number): void {
    const next = ((i % this.scenes.length) + this.scenes.length) % this.scenes.length;
    if (next === this.index && this.raf) return;
    this.dwell = 0;
    this.index = next;
    this.scene.resize?.(this.w, this.h);
    this.scene.enter?.();
    this.onSceneChange?.(this.index, this.scene);
  }

  nextScene(): void {
    this.setScene(this.index + 1);
  }

  resize(): void {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = window.devicePixelRatio || 1;
    this.appliedDpr = dpr;
    if (this.force1080) {
      this.canvas.width = 1920;
      this.canvas.height = 1080;
      this.sx = 1920 / cssW;
      this.sy = 1080 / cssH;
    } else {
      const scale = dpr * this.renderScale;
      this.sx = scale;
      this.sy = scale;
      this.canvas.width = Math.max(1, Math.floor(cssW * scale));
      this.canvas.height = Math.max(1, Math.floor(cssH * scale));
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.w = cssW;
    this.h = cssH;
    for (const s of this.scenes) s.resize?.(cssW, cssH);
    this.horror.resize(cssW, cssH);
  }

  start(): void {
    if (this.raf) return;
    this.resize();
    this.scene.resize?.(this.w, this.h);
    this.scene.enter?.();
    this.onSceneChange?.(this.index, this.scene);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(now: number): void {
    const dpr = window.devicePixelRatio || 1;
    if (!this.force1080 && Math.abs(dpr - this.appliedDpr) > 0.01) this.resize();

    const audio = this.audio.update();
    this.horror.update(audio, this.w, this.h);

    const ctx = this.ctx;
    ctx.setTransform(this.sx, 0, 0, this.sy, 0, 0);
    const sc: SceneContext = { ctx, w: this.w, h: this.h, audio, t: audio.time, dt: audio.dt };
    this.scene.draw(sc);
    this.horror.drawAtmosphere(ctx, this.w, this.h, audio.time);
    drawSpiders(ctx, this.w, this.h, audio, audio.time);
    this.horror.drawGrade(ctx, this.w, this.h, audio.time);

    this.dwell += audio.dt;
    if (this.dwell >= this.dwellEvery) {
      this.dwell = 0;
      this.nextScene();
    }

    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsTime));
      this.frames = 0;
      this.fpsTime = now;
      this.onFps?.(this.fps);
    }
  }
}
