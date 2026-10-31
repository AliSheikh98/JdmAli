export type SourceKind = 'none' | 'mic' | 'file' | 'demo';

/** One frame of analysed audio, produced once per animation frame. */
export interface AudioFrame {
  /** Smoothed, auto-gain-normalised magnitude per bin, 0..1. Length = `bins`. */
  freq: Float32Array;
  /** Number of useful bins in `freq` (bins above ~16 kHz are discarded). */
  bins: number;
  /** Time-domain waveform, -1..1, auto-gain-normalised. */
  wave: Float32Array;
  /** Band energies 0..1 (normalised against the rolling peak). */
  bass: number;
  mid: number;
  treble: number;
  /** Overall normalised loudness 0..1. */
  level: number;
  /** Un-normalised RMS of the waveform, useful for "is there any signal?" checks. */
  rawLevel: number;
  /** True on the frame a beat (detected or predicted) occurs. */
  beat: boolean;
  /** True only for beats detected from the signal, not predicted from tempo. */
  beatDetected: boolean;
  /** Decaying 1 -> 0 envelope restarted on every beat. */
  pulse: number;
  /** Estimated tempo in BPM, 0 when unknown. */
  bpm: number;
  /** Confidence 0..1 in the BPM estimate. */
  bpmConfidence: number;
  /** 0..1 phase within the current beat period (0 = on the beat). */
  beatPhase: number;
  /** Current automatic gain multiplier applied to the analysis. */
  autoGain: number;
  /** Seconds since the engine started. */
  time: number;
  /** Seconds since the previous frame. */
  dt: number;
}
