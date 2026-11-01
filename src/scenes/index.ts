import type { Scene } from './types';
import { TurtlesScene } from './turtles';
import { SewerScene } from './sewer';
import { SkylineScene } from './skyline';
import { OozeScene } from './ooze';

export function createScenes(): Scene[] {
  return [new TurtlesScene(), new SewerScene(), new SkylineScene(), new OozeScene()];
}

export type { Scene, SceneContext } from './types';
