/**
 * Energy-based onset detection on the low band with an adaptive threshold,
 * plus a lightweight tempo (BPM) estimator used to keep pulses steady when
 * ambient room audio makes individual kicks hard to pick out.
 */

export interface BeatState {
  beat: boolean;
  beatDetected: boolean;
  pulse: number;
  bpm: number;
  bpmConfidence: number;
  beatPhase: number;
}

const HISTORY_SECONDS = 1.2;
const MIN_BEAT_INTERVAL = 0.22; // ~270 BPM upper bound on detections
const MIN_BPM = 60;
const MAX_BPM = 190;
const PULSE_DECAY = 3.2; // per second (exponential)

export class BeatDetector {
  private history: number[] = [];
  private historyTimes: number[] = [];
  private previousEnergy = 0;
  private lastBeatTime = -10;
  private lastDetectedTime = -10;
  private intervals: number[] = [];
  private predictedNext = 0;
  private sinceStart = 0;
  private predictedBeats = 0;

  state: BeatState = {
    beat: false,
    beatDetected: false,
    pulse: 0,
    bpm: 0,
    bpmConfidence: 0,
    beatPhase: 0,
  };

  reset(): void {
    this.history = [];
    this.historyTimes = [];
    this.previousEnergy = 0;
    this.lastBeatTime = -10;
    this.lastDetectedTime = -10;
    this.intervals = [];
    this.predictedNext = 0;
    this.sinceStart = 0;
    this.predictedBeats = 0;
    this.state = { beat: false, beatDetected: false, pulse: 0, bpm: 0, bpmConfidence: 0, beatPhase: 0 };
  }

  /**
   * @param energy  normalised low-band energy for this frame (0..~1.5)
   * @param time    seconds
   * @param dt      seconds since last frame
   * @param signal  whether there is any meaningful input at all
   */
  update(energy: number, time: number, dt: number, signal: boolean): BeatState {
    this.sinceStart += dt;
    const s = this.state;
    s.beat = false;
    s.beatDetected = false;
    s.pulse = Math.max(0, s.pulse - s.pulse * PULSE_DECAY * dt);

    // Rolling history of recent low-band energy
    this.history.push(energy);
    this.historyTimes.push(time);
    while (this.historyTimes.length && time - this.historyTimes[0] > HISTORY_SECONDS) {
      this.history.shift();
      this.historyTimes.shift();
    }

    const n = this.history.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.history[i];
    mean /= Math.max(1, n);
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const d = this.history[i] - mean;
      variance += d * d;
    }
    variance /= Math.max(1, n);

    // Adaptive threshold: noisier (higher variance) signals need a bigger
    // jump to count as a beat; steady signals can trigger on smaller jumps.
    // Variance here is on 0..1 normalised energy so scale accordingly.
    const c = clamp(1.55 - variance * 12, 1.18, 1.6);
    const rising = energy > this.previousEnergy * 1.02;
    const loudEnough = energy > 0.08;
    const refractory = time - this.lastBeatTime > MIN_BEAT_INTERVAL;

    let detected = false;
    if (signal && n > 10 && rising && loudEnough && refractory && energy > mean * c) {
      detected = true;
    }
    this.previousEnergy = energy;

    if (detected) {
      const sinceLast = time - this.lastDetectedTime;
      if (sinceLast > 60 / MAX_BPM * 0.9 && sinceLast < 60 / MIN_BPM * 1.1) {
        this.intervals.push(sinceLast);
        if (this.intervals.length > 24) this.intervals.shift();
      } else if (sinceLast > 2.5) {
        // Long silence: forget the old tempo
        this.intervals = [];
      }
      this.lastDetectedTime = time;
      this.lastBeatTime = time;
      this.predictedBeats = 0;
      s.beat = true;
      s.beatDetected = true;
      s.pulse = 1;
      this.estimateTempo();
    }

    // Predict the next beat from tempo if detection goes quiet for a moment
    // (e.g. a breakdown or the kick being masked by crowd noise). Only a few
    // predictions in a row are allowed so we don't keep pulsing in silence.
    const period = s.bpm > 0 ? 60 / s.bpm : 0;
    if (period > 0) {
      this.predictedNext = this.lastBeatTime + period;
      if (
        signal &&
        !detected &&
        s.bpmConfidence > 0.45 &&
        this.predictedBeats < 4 &&
        time >= this.predictedNext + period * 0.08
      ) {
        this.lastBeatTime = this.predictedNext;
        this.predictedBeats++;
        s.beat = true;
        s.pulse = Math.max(s.pulse, 0.75);
      }
      s.beatPhase = clamp(((time - this.lastBeatTime) % period) / period, 0, 1);
    } else {
      s.beatPhase = 0;
    }

    if (!signal) {
      s.bpmConfidence = Math.max(0, s.bpmConfidence - dt * 0.4);
    }

    return s;
  }

  private estimateTempo(): void {
    const s = this.state;
    const iv = this.intervals;
    if (iv.length < 4) {
      if (iv.length === 0) {
        s.bpm = 0;
        s.bpmConfidence = 0;
      }
      return;
    }
    // Fold intervals into the 60..190 BPM range so half/double-time
    // detections agree, then take the median of the largest cluster.
    const folded = iv.map((x) => {
      let p = x;
      while (60 / p > MAX_BPM) p *= 2;
      while (60 / p < MIN_BPM) p /= 2;
      return p;
    });
    folded.sort((a, b) => a - b);
    let bestStart = 0;
    let bestCount = 0;
    for (let i = 0; i < folded.length; i++) {
      let j = i;
      while (j < folded.length && folded[j] - folded[i] < folded[i] * 0.09) j++;
      if (j - i > bestCount) {
        bestCount = j - i;
        bestStart = i;
      }
    }
    const cluster = folded.slice(bestStart, bestStart + bestCount);
    const median = cluster[Math.floor(cluster.length / 2)];
    const newBpm = 60 / median;
    s.bpm = s.bpm > 0 ? s.bpm * 0.6 + newBpm * 0.4 : newBpm;
    s.bpmConfidence = clamp(bestCount / folded.length, 0, 1) * clamp(folded.length / 12, 0.3, 1);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
