import './style.css';
import { AudioEngine } from './audio/engine';
import { Renderer } from './renderer';
import { createScenes } from './scenes';
import { Controls } from './ui/controls';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const audio = new AudioEngine();
const renderer = new Renderer(canvas, createScenes(), audio);

// Optional URL parameters for kiosk / automation use, e.g. ?scene=3&source=demo&scale=1.5&force1080=1
// (auto-start only works when the browser allows audio without a gesture).
const params = new URLSearchParams(location.search);
const scaleParam = Number(params.get('scale') ?? params.get('renderScale'));
if (scaleParam > 0) renderer.setRenderScale(scaleParam);
if (params.get('force1080') === '1' || params.get('hd') === '1' || params.get('backing') === '1080') {
  renderer.setForce1080(true);
}
const sceneParam = Number(params.get('scene'));
if (sceneParam >= 1 && sceneParam <= renderer.sceneCount) renderer.setScene(sceneParam - 1);

const controls = new Controls(audio, renderer);
const sourceParam = params.get('source');
if (sourceParam === 'demo' || sourceParam === 'mic') {
  void controls.start(sourceParam);
}

// Expose for debugging from the devtools console.
(window as unknown as { shellraiser: unknown }).shellraiser = { audio, renderer, controls };
