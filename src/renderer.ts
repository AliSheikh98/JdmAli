import type { AudioEngine } from './audio/engine';
import type { Scene, SceneContext } from './scenes';

/**
 * Drives the requestAnimationFrame loop, keeps the canvas sized to the
 * window (DPR-aware, capped for projector performance) and hands each frame
 * to the active scene.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scenes: Scene[];
  private readonly audio: AudioEngine;
  private index = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private frames = 0;
  private fpsTime = 0;
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
    window.addEventListener('resize', () => this.resize());
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

  sceneName(i: number): string {
    return this.scenes[i]?.name ?? `Scene ${i + 1}`;
  }

  setScene(i: number): void {
    const next = ((i % this.scenes.length) + this.scenes.length) % this.scenes.length;
    if (next === this.index && this.raf) return;
    this.index = next;
    this.scene.resize?.(this.w, this.h);
    this.scene.enter?.();
    this.onSceneChange?.(this.index, this.scene);
  }

  nextScene(): void {
    this.setScene(this.index + 1);
  }

  resize(): void {
    // 1080p projectors are DPR 1; cap higher-density laptop screens so the
    // fill-rate cost stays sane when previewing on the Retina panel.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    for (const s of this.scenes) s.resize?.(this.w, this.h);
  }

  start(): void {
    if (this.raf) return;
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
    const audio = this.audio.update();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sc: SceneContext = { ctx, w: this.w, h: this.h, audio, t: audio.time, dt: audio.dt };
    this.scene.draw(sc);

    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsTime));
      this.frames = 0;
      this.fpsTime = now;
      this.onFps?.(this.fps);
    }
  }
}
