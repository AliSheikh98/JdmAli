import { BeatDetector } from './beat';
import { DemoSynth } from './demo-synth';
import type { AudioFrame, SourceKind } from './types';

const FFT_SIZE = 2048;
const MAX_FREQ_HZ = 16000;

// Band edges in Hz. "bass" is deliberately narrow (kick / bass guitar region)
// so it drives the beat detector without being polluted by vocals.
const BASS_HZ: [number, number] = [35, 160];
const MID_HZ: [number, number] = [160, 2000];
const TREBLE_HZ: [number, number] = [2000, 12000];

/**
 * Owns the AudioContext, the active input (mic / file / demo synth), the
 * analyser and the per-frame analysis (smoothing, auto-gain, beat tracking).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private inputGain: GainNode | null = null;
  private sourceNode: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private demo: DemoSynth | null = null;
  private fileSourceNode: MediaElementAudioSourceNode | null = null;
  private fileUrl: string | null = null;
  readonly audioElement: HTMLAudioElement = new Audio();

  private freqBytes = new Uint8Array(FFT_SIZE / 2);
  private waveBytes = new Uint8Array(FFT_SIZE);
  private smoothed = new Float32Array(FFT_SIZE / 2);
  private readonly beat = new BeatDetector();

  // Automatic gain: track a slowly decaying peak of the overall level and
  // normalise against it so quiet rooms and loud rooms both fill the screen.
  private peakTracker = 0.05;
  private noiseFloor = 0.0;
  private sensitivity = 1;

  private startTime = 0;
  private lastTime = 0;

  source: SourceKind = 'none';
  currentDeviceId: string | null = null;

  readonly frame: AudioFrame = {
    freq: new Float32Array(FFT_SIZE / 2),
    bins: FFT_SIZE / 2,
    wave: new Float32Array(FFT_SIZE),
    bass: 0,
    mid: 0,
    treble: 0,
    level: 0,
    rawLevel: 0,
    beat: false,
    beatDetected: false,
    pulse: 0,
    bpm: 0,
    bpmConfidence: 0,
    beatPhase: 0,
    autoGain: 1,
    time: 0,
    dt: 0,
  };

  constructor() {
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.loop = true;
    this.audioElement.preload = 'auto';
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  get isRunning(): boolean {
    return this.ctx !== null && this.source !== 'none';
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.1, value);
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      // Light built-in smoothing; we add our own attack/release on top.
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;
      this.inputGain = this.ctx.createGain();
      this.inputGain.gain.value = 1;
      this.inputGain.connect(this.analyser);
      this.startTime = performance.now() / 1000;
      this.lastTime = this.startTime;
      this.frame.bins = Math.min(
        FFT_SIZE / 2,
        Math.floor((MAX_FREQ_HZ / (this.ctx.sampleRate / 2)) * (FFT_SIZE / 2)),
      );
    }
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  // ------------------------------------------------------------------ inputs

  async listInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  /**
   * Pick the laptop's built-in microphone when no explicit device is chosen.
   * macOS labels it "MacBook ... Microphone (Built-in)"; fall back to the
   * system default device.
   */
  static pickDefaultInput(devices: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
    const builtIn = devices.find((d) => /built-?in|internal|macbook/i.test(d.label));
    if (builtIn) return builtIn;
    return devices.find((d) => d.deviceId === 'default') ?? devices[0];
  }

  async startMic(deviceId?: string | null): Promise<MediaDeviceInfo[]> {
    const ctx = await this.ensureContext();
    this.teardownSource();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone capture (getUserMedia).');
    }

    const constraintsFor = (id: string | null | undefined): MediaStreamConstraints => ({
      audio: {
        ...(id && id !== 'default' ? { deviceId: { exact: id } } : {}),
        // Music must come through un-processed: the browser's voice-call DSP
        // would otherwise treat the band as background noise and squash it.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
      video: false,
    });

    let chosenId = deviceId ?? null;
    let stream: MediaStream;
    try {
      // First call also unlocks device labels for enumerateDevices().
      stream = await navigator.mediaDevices.getUserMedia(constraintsFor(chosenId));
    } catch (err) {
      if (chosenId) {
        // Device may have disappeared; retry with the default device.
        chosenId = null;
        stream = await navigator.mediaDevices.getUserMedia(constraintsFor(null));
      } else {
        throw err;
      }
    }

    let devices = await this.listInputs();
    if (!chosenId) {
      const preferred = AudioEngine.pickDefaultInput(devices);
      const activeTrack = stream.getAudioTracks()[0];
      const activeId = activeTrack?.getSettings().deviceId;
      if (preferred && preferred.deviceId && preferred.deviceId !== activeId && preferred.deviceId !== 'default') {
        // We were given some other device by default; switch to the built-in mic.
        try {
          const swapped = await navigator.mediaDevices.getUserMedia(constraintsFor(preferred.deviceId));
          stream.getTracks().forEach((t) => t.stop());
          stream = swapped;
          chosenId = preferred.deviceId;
        } catch {
          chosenId = activeId ?? null;
        }
      } else {
        chosenId = activeId ?? preferred?.deviceId ?? null;
      }
      devices = await this.listInputs();
    }

    this.stream = stream;
    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.sourceNode.connect(this.inputGain!);
    this.source = 'mic';
    this.currentDeviceId = chosenId;
    this.resetAnalysis();
    return devices;
  }

  async startFile(file: File): Promise<void> {
    const ctx = await this.ensureContext();
    this.teardownSource();
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = URL.createObjectURL(file);
    this.audioElement.src = this.fileUrl;
    if (!this.fileSourceNode) {
      // createMediaElementSource may only be called once per element.
      this.fileSourceNode = ctx.createMediaElementSource(this.audioElement);
    }
    this.fileSourceNode.connect(this.inputGain!);
    this.fileSourceNode.connect(ctx.destination);
    this.sourceNode = this.fileSourceNode;
    this.source = 'file';
    this.resetAnalysis();
    await this.audioElement.play();
  }

  async toggleFilePlayback(): Promise<void> {
    if (this.source !== 'file') return;
    if (this.audioElement.paused) await this.audioElement.play();
    else this.audioElement.pause();
  }

  async startDemo(): Promise<void> {
    const ctx = await this.ensureContext();
    this.teardownSource();
    this.demo = new DemoSynth(ctx);
    this.demo.output.connect(this.inputGain!);
    this.demo.output.connect(ctx.destination);
    this.demo.start();
    this.sourceNode = this.demo.output;
    this.source = 'demo';
    this.resetAnalysis();
  }

  stop(): void {
    this.teardownSource();
    this.source = 'none';
  }

  private teardownSource(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.demo) {
      this.demo.stop();
      this.demo = null;
    }
    if (this.source === 'file') {
      this.audioElement.pause();
      this.fileSourceNode?.disconnect();
    }
    if (this.sourceNode && this.sourceNode !== this.fileSourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.sourceNode = null;
    this.currentDeviceId = null;
  }

  private resetAnalysis(): void {
    this.smoothed.fill(0);
    this.peakTracker = 0.05;
    this.noiseFloor = 0;
    this.beat.reset();
  }

  // ---------------------------------------------------------------- analysis

  /** Call once per animation frame. Returns the shared frame object. */
  update(): AudioFrame {
    const f = this.frame;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0.001, now - this.lastTime));
    this.lastTime = now;
    f.time = now - this.startTime;
    f.dt = dt;

    if (!this.analyser || this.source === 'none') {
      this.decayFrame(dt);
      return f;
    }

    this.analyser.getByteFrequencyData(this.freqBytes);
    this.analyser.getByteTimeDomainData(this.waveBytes);

    // Raw RMS of the waveform (pre-normalisation)
    let sumSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const v = (this.waveBytes[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / FFT_SIZE);
    f.rawLevel = rms;

    // Noise floor: very slow tracker of the quietest recent level so that
    // a silent room (fan hum, HVAC) does not register as signal.
    if (rms < this.noiseFloor || this.noiseFloor === 0) {
      this.noiseFloor = this.noiseFloor * 0.8 + rms * 0.2;
    } else {
      this.noiseFloor += (rms - this.noiseFloor) * dt * 0.02;
    }
    const signal = rms > Math.max(0.004, this.noiseFloor * 1.6);

    // Auto gain: fast attack on the peak, slow (≈4 s) release.
    const target = rms;
    if (target > this.peakTracker) {
      this.peakTracker += (target - this.peakTracker) * Math.min(1, dt * 12);
    } else if (signal) {
      this.peakTracker += (target - this.peakTracker) * Math.min(1, dt * 0.25);
    }
    this.peakTracker = Math.max(0.02, Math.min(1, this.peakTracker));
    const autoGain = Math.min(14, 0.6 / this.peakTracker) * this.sensitivity;
    f.autoGain = autoGain;

    // Smooth the spectrum with asymmetric attack/release, then normalise.
    const bins = f.bins;
    const attack = Math.min(1, dt * 28);
    const release = Math.min(1, dt * 9);
    // The byte spectrum is already dB-scaled 0..255; map 0..1 and apply gain
    // in a way that lifts quiet signals without clipping everything to 1.
    const gainCurve = Math.sqrt(autoGain);
    // Music has far less energy in the highs than the lows; tilt the spectrum
    // upward with frequency so hats/vocals/synths get visual weight too.
    const tilt = 3.0 / bins;
    for (let i = 0; i < bins; i++) {
      let v = this.freqBytes[i] / 255;
      v = Math.min(1, v * gainCurve * (1 + i * tilt));
      v = v * Math.sqrt(v); // perceptual curve: emphasise strong partials
      const prev = this.smoothed[i];
      this.smoothed[i] = v > prev ? prev + (v - prev) * attack : prev + (v - prev) * release;
      f.freq[i] = this.smoothed[i];
    }

    for (let i = 0; i < FFT_SIZE; i++) {
      f.wave[i] = clamp(((this.waveBytes[i] - 128) / 128) * autoGain * 0.5, -1, 1);
    }

    const binHz = this.sampleRate / FFT_SIZE;
    const bass = this.bandAverage(f.freq, BASS_HZ, binHz);
    const mid = this.bandAverage(f.freq, MID_HZ, binHz);
    const treble = this.bandAverage(f.freq, TREBLE_HZ, binHz);
    f.bass += (clamp(bass * 1.35, 0, 1) - f.bass) * Math.min(1, dt * 18);
    f.mid += (clamp(mid * 1.6, 0, 1) - f.mid) * Math.min(1, dt * 14);
    f.treble += (clamp(treble * 2.4, 0, 1) - f.treble) * Math.min(1, dt * 14);
    f.level = clamp(rms * autoGain * 1.2, 0, 1);

    // Beat detection uses the *instantaneous* low band (not the smoothed
    // display value) so onsets are not blurred away.
    let instBass = 0;
    let count = 0;
    const lo = Math.max(1, Math.floor(BASS_HZ[0] / binHz));
    const hi = Math.min(bins - 1, Math.ceil(BASS_HZ[1] / binHz));
    for (let i = lo; i <= hi; i++) {
      const v = Math.min(1, (this.freqBytes[i] / 255) * gainCurve);
      instBass += v * v;
      count++;
    }
    instBass = count ? instBass / count : 0;

    const b = this.beat.update(instBass, f.time, dt, signal);
    f.beat = b.beat;
    f.beatDetected = b.beatDetected;
    f.pulse = b.pulse;
    f.bpm = b.bpm;
    f.bpmConfidence = b.bpmConfidence;
    f.beatPhase = b.beatPhase;
    return f;
  }

  private decayFrame(dt: number): void {
    const f = this.frame;
    const k = Math.min(1, dt * 4);
    f.bass -= f.bass * k;
    f.mid -= f.mid * k;
    f.treble -= f.treble * k;
    f.level -= f.level * k;
    f.pulse -= f.pulse * k;
    f.beat = false;
    f.beatDetected = false;
    for (let i = 0; i < f.bins; i++) f.freq[i] -= f.freq[i] * k;
    for (let i = 0; i < f.wave.length; i++) f.wave[i] -= f.wave[i] * k;
  }

  private bandAverage(freq: Float32Array, [loHz, hiHz]: [number, number], binHz: number): number {
    const lo = Math.max(1, Math.floor(loHz / binHz));
    const hi = Math.min(this.frame.bins - 1, Math.ceil(hiHz / binHz));
    if (hi <= lo) return 0;
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += freq[i];
    return sum / (hi - lo + 1);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
