import type { AudioFrame } from '../audio/types';

export interface SceneContext {
  ctx: CanvasRenderingContext2D;
  /** Logical width/height in CSS pixels (already DPR-scaled by the renderer). */
  w: number;
  h: number;
  audio: AudioFrame;
  /** Seconds since start. */
  t: number;
  dt: number;
}

export interface Scene {
  readonly id: string;
  readonly name: string;
  /** Called when the canvas size changes or the scene is first shown. */
  resize?(w: number, h: number): void;
  /** Called when the scene becomes active. */
  enter?(): void;
  draw(sc: SceneContext): void;
}
