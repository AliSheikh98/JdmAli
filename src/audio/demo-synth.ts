/**
 * A tiny procedural "party beat" built from oscillators and noise so the
 * visualizer can be exercised with no microphone or audio file. Also handy
 * for soundchecking the projector before the music starts.
 */
export class DemoSynth {
  private readonly ctx: AudioContext;
  readonly output: GainNode;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private noiseBuffer: AudioBuffer;
  private bpm: number;

  constructor(ctx: AudioContext, bpm = 124) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.output = ctx.createGain();
    this.output.gain.value = 0.55;
    this.noiseBuffer = this.makeNoise();
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.output.disconnect();
  }

  private schedule(): void {
    const lookahead = 0.15;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const beat = step % 16; // 16 sixteenths per bar
    const bar = Math.floor(step / 16);

    // Kick on every quarter, plus a syncopated extra in bar 4
    if (beat % 4 === 0 || (bar === 3 && beat === 14)) this.kick(t);
    // Snare / clap on 2 and 4
    if (beat === 4 || beat === 12) this.snare(t);
    // Hi-hats on 8ths, open hat on the off-beat of 4
    if (beat % 2 === 0) this.hat(t, beat === 14 ? 0.18 : 0.05);
    // Spooky bass line: E minor pentatonic-ish
    const bassNotes = [41.2, 41.2, 49.0, 41.2, 55.0, 41.2, 36.7, 41.2];
    if (beat % 2 === 0) this.bass(t, bassNotes[(beat / 2) % 8] * (bar === 2 ? 1.5 : 1));
    // Theremin-style ghost lead every other bar
    if (bar % 2 === 1 && beat === 0) this.ghost(t);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(gain).connect(this.output);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private snare(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp).connect(gain).connect(this.output);
    src.start(t);
    src.stop(t + 0.2);
  }

  private hat(t: number, length: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(hp).connect(gain).connect(this.output);
    src.start(t);
    src.stop(t + length + 0.02);
  }

  private bass(t: number, freq: number): void {
    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.25);
    lp.Q.value = 6;
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(lp).connect(gain).connect(this.output);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private ghost(t: number): void {
    const osc = this.ctx.createOscillator();
    const vib = this.ctx.createOscillator();
    const vibGain = this.ctx.createGain();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.6);
    osc.frequency.linearRampToValueAtTime(587, t + 1.6);
    vib.frequency.value = 6;
    vibGain.gain.value = 12;
    vib.connect(vibGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(gain).connect(this.output);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 1.85);
    vib.stop(t + 1.85);
  }

  private makeNoise(): AudioBuffer {
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
