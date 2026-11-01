import type { AudioEngine } from '../audio/engine';
import type { SourceKind } from '../audio/types';
import type { Renderer } from '../renderer';

const IDLE_HIDE_MS = 3000;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export class Controls {
  private readonly audio: AudioEngine;
  private readonly renderer: Renderer;
  private readonly gate = $<HTMLElement>('gate');
  private readonly gateError = $<HTMLParagraphElement>('gate-error');
  private readonly sceneButtons = $<HTMLDivElement>('scene-buttons');
  private readonly sourceSelect = $<HTMLSelectElement>('source-select');
  private readonly deviceGroup = $<HTMLDivElement>('device-group');
  private readonly deviceSelect = $<HTMLSelectElement>('device-select');
  private readonly fileGroup = $<HTMLDivElement>('file-group');
  private readonly fileInput = $<HTMLInputElement>('file-input');
  private readonly fileName = $<HTMLSpanElement>('file-name');
  private readonly gainSlider = $<HTMLInputElement>('gain');
  private readonly gainValue = $<HTMLSpanElement>('gain-value');
  private readonly renderScale = $<HTMLSelectElement>('render-scale');
  private readonly force1080 = $<HTMLInputElement>('force-1080');
  private readonly fpsLabel = $<HTMLSpanElement>('fps');
  private readonly toast = $<HTMLDivElement>('toast');
  private idleTimer = 0;
  private toastTimer = 0;
  private uiHidden = false;

  constructor(audio: AudioEngine, renderer: Renderer) {
    this.audio = audio;
    this.renderer = renderer;
    document.body.classList.add('gate-open');
    this.buildSceneButtons();
    this.bindGate();
    this.bindPanel();
    this.bindKeyboard();
    this.bindIdle();
    this.syncShowControls();
    renderer.onSceneChange = (i) => this.highlightScene(i);
    renderer.onFps = (fps) => {
      const bpm = this.audio.frame.bpm;
      this.fpsLabel.textContent = bpm > 0 ? `${fps} fps · ${Math.round(bpm)} bpm` : `${fps} fps`;
    };
  }

  // ------------------------------------------------------------- scenes

  private buildSceneButtons(): void {
    this.sceneButtons.innerHTML = '';
    for (let i = 0; i < this.renderer.sceneCount; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small scene-btn';
      btn.dataset.index = String(i);
      btn.textContent = `${i + 1} · ${this.renderer.sceneName(i)}`;
      btn.addEventListener('click', () => this.renderer.setScene(i));
      this.sceneButtons.appendChild(btn);
    }
    this.highlightScene(this.renderer.sceneIndex);
  }

  private highlightScene(i: number): void {
    this.sceneButtons.querySelectorAll<HTMLButtonElement>('.scene-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.index) === i);
    });
    if (!document.body.classList.contains('gate-open')) {
      this.showToast(`${i + 1} · ${this.renderer.scene.name}`);
    }
  }

  // --------------------------------------------------------------- gate

  private bindGate(): void {
    $('gate-mic').addEventListener('click', () => void this.start('mic'));
    $('gate-demo').addEventListener('click', () => void this.start('demo'));
    $('gate-file').addEventListener('click', () => {
      this.fileInput.click();
    });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) void this.start('file', file);
    });
  }

  async start(kind: SourceKind, file?: File): Promise<void> {
    this.gateError.hidden = true;
    try {
      if (kind === 'mic') {
        const devices = await this.audio.startMic(this.deviceSelect.value || null);
        this.populateDevices(devices);
        this.showToast('Listening to the room');
      } else if (kind === 'file') {
        if (!file) throw new Error('Choose an audio file first.');
        await this.audio.startFile(file);
        this.fileName.textContent = file.name;
        this.showToast(`Playing ${file.name}`);
      } else if (kind === 'demo') {
        await this.audio.startDemo();
        this.showToast('Demo beat');
      }
      this.sourceSelect.value = kind;
      this.updateSourceVisibility();
      this.closeGate();
      this.renderer.start();
    } catch (err) {
      const message = this.describeError(err);
      this.gateError.textContent = message;
      this.gateError.hidden = false;
      this.gate.classList.remove('hidden');
      document.body.classList.add('gate-open');
      console.error(err);
    }
  }

  private describeError(err: unknown): string {
    const e = err as { name?: string; message?: string };
    switch (e?.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access was blocked. In Chrome click the lock icon in the address bar and allow the microphone; in Safari use Safari ▸ Settings for This Website. Then click Start again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone was found. Check System Settings ▸ Sound ▸ Input on the Mac, or start the demo beat instead.';
      case 'NotReadableError':
        return 'The microphone is busy in another app. Close it (or pick a different input) and try again.';
      case 'OverconstrainedError':
        return 'The selected input device is not available. Pick another device.';
      default:
        return e?.message ?? 'Could not start audio.';
    }
  }

  private closeGate(): void {
    this.gate.classList.add('hidden');
    document.body.classList.remove('gate-open');
    this.resetIdle();
  }

  // -------------------------------------------------------------- panel

  private bindPanel(): void {
    this.sourceSelect.addEventListener('change', () => {
      const kind = this.sourceSelect.value as SourceKind;
      this.updateSourceVisibility();
      if (kind === 'mic') void this.start('mic');
      else if (kind === 'demo') void this.start('demo');
      else if (kind === 'file') {
        const file = this.fileInput.files?.[0];
        if (file) void this.start('file', file);
        else this.fileInput.click();
      }
    });
    this.deviceSelect.addEventListener('change', () => {
      if (this.sourceSelect.value === 'mic') void this.start('mic');
    });
    $('file-play').addEventListener('click', () => void this.audio.toggleFilePlayback());
    this.gainSlider.addEventListener('input', () => {
      const v = Number(this.gainSlider.value);
      this.audio.setSensitivity(v);
      this.gainValue.textContent = `${v.toFixed(1)}×`;
    });
    $('fullscreen').addEventListener('click', () => void this.toggleFullscreen());
    $('hide-ui').addEventListener('click', () => this.toggleUi());
    this.renderScale.addEventListener('change', () => {
      this.renderer.setRenderScale(Number(this.renderScale.value));
    });
    this.force1080.addEventListener('change', () => {
      this.renderer.setForce1080(this.force1080.checked);
    });
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        void this.audio.listInputs().then((d) => this.populateDevices(d));
      });
    }
  }

  private updateSourceVisibility(): void {
    const kind = this.sourceSelect.value;
    this.deviceGroup.hidden = kind !== 'mic';
    this.fileGroup.hidden = kind !== 'file';
  }

  private populateDevices(devices: MediaDeviceInfo[]): void {
    const current = this.audio.currentDeviceId;
    this.deviceSelect.innerHTML = '';
    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'System default';
      this.deviceSelect.appendChild(opt);
      return;
    }
    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Input ${i + 1}`;
      if (d.deviceId === current) opt.selected = true;
      this.deviceSelect.appendChild(opt);
    });
  }

  // ----------------------------------------------------------- keyboard

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.renderer.sceneCount) {
        this.renderer.setScene(n - 1);
        return;
      }
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'arrowright':
          e.preventDefault();
          this.renderer.nextScene();
          break;
        case 'arrowleft':
          this.renderer.setScene(this.renderer.sceneIndex - 1);
          break;
        case 'f':
          void this.toggleFullscreen();
          break;
        case 'h':
          this.toggleUi();
          break;
        case 'escape':
          if (this.uiHidden) this.toggleUi();
          break;
      }
    });
  }

  async toggleFullscreen(): Promise<void> {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else {
        await el.webkitRequestFullscreen?.();
      }
    } catch (err) {
      this.showToast('Fullscreen blocked — use the browser menu');
      console.warn(err);
    }
  }

  private syncShowControls(): void {
    const scale = String(this.renderer.scale);
    if ([...this.renderScale.options].some((o) => o.value === scale)) this.renderScale.value = scale;
    this.force1080.checked = this.renderer.hd;
  }

  private toggleUi(): void {
    this.uiHidden = !this.uiHidden;
    document.body.classList.toggle('ui-hidden', this.uiHidden);
    if (!this.uiHidden) this.resetIdle();
  }

  // ---------------------------------------------------------------- idle

  private bindIdle(): void {
    const wake = () => this.resetIdle();
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('mousedown', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    // Keyboard shortcuts deliberately do not wake the panel: switching scenes
    // from the laptop should not flash the controls on the projector wall.
    this.resetIdle();
  }

  private resetIdle(): void {
    document.body.classList.remove('idle');
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!document.body.classList.contains('gate-open')) document.body.classList.add('idle');
    }, IDLE_HIDE_MS);
  }

  // --------------------------------------------------------------- toast

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1400);
  }
}
