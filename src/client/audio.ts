/**
 * Procedural sound — every effect is synthesized with the Web Audio API, so
 * there are zero audio files to ship and the palette stays cohesive. Lazily
 * initialized on the first user gesture (browser autoplay policy) and fully
 * mutable via a persisted toggle.
 */

const MUTE_KEY = 'wf:muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Create/resume the audio context. Call from a user-gesture handler. */
  unlock(): void {
    if (this.ctx || typeof window === 'undefined' || typeof window.AudioContext === 'undefined')
      return;
    this.ctx = new window.AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  toggle(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
    glideTo?: number
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.now();
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  /** Bright pluck when catching a letter; pitch rises with the combo. */
  collect(comboStep = 0): void {
    const base = 520 + Math.min(comboStep, 16) * 34;
    this.tone(base, 0.14, 'triangle', 0.28, 0, base * 1.5);
  }

  hazard(): void {
    this.noise(0.28, 0.4, 900);
    this.tone(150, 0.3, 'sawtooth', 0.22, 0, 60);
  }

  bonus(): void {
    this.tone(660, 0.1, 'sine', 0.25);
    this.tone(880, 0.1, 'sine', 0.22, 0.08);
    this.tone(1180, 0.14, 'sine', 0.2, 0.16);
  }

  submitGood(mult = 1): void {
    const root = 440 * (1 + Math.min(mult - 1, 1.2) * 0.25);
    this.tone(root, 0.16, 'triangle', 0.26);
    this.tone(root * 1.26, 0.18, 'triangle', 0.22, 0.06);
    this.tone(root * 1.5, 0.22, 'triangle', 0.2, 0.12);
  }

  submitBad(): void {
    this.tone(240, 0.18, 'sawtooth', 0.2, 0, 150);
    this.tone(180, 0.2, 'square', 0.14, 0.05, 120);
  }

  trick(): void {
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.24, i * 0.1));
    this.tone(1568, 0.5, 'sine', 0.2, 0.5);
  }

  tick(): void {
    this.tone(880, 0.06, 'square', 0.15);
  }

  levelStart(): void {
    this.tone(392, 0.18, 'triangle', 0.24);
    this.tone(523, 0.24, 'triangle', 0.22, 0.12);
  }

  click(): void {
    this.tone(660, 0.05, 'square', 0.16, 0, 880);
  }
}

export const SFX = new SoundEngine();
