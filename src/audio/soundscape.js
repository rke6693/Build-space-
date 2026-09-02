/**
 * Procedural Web Audio. No sample files ship with the game — the ambience,
 * rain, and every cue are synthesised on the fly, which keeps the whole
 * project to three PNGs and some text.
 */
export class Soundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.enabled = false;
    this.started = false;
    this.chimeTimer = null;
    this.ambientNodes = [];
    this.tension = 0;
  }

  /** Lazily builds the graph. Must be called from a user gesture on iOS. */
  async ensure() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.sfx = this.context.createGain();
      this.music.gain.value = 0.25;
      this.sfx.gain.value = 0.72;
      this.master.gain.value = 0;
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    if (!this.started) this.#startAmbient();
    return true;
  }

  async setEnabled(enabled) {
    if (enabled && !(await this.ensure())) return false;
    this.enabled = enabled;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(enabled ? 0.62 : 0, now + 0.16);
    }
    return true;
  }

  /** 0 = open marsh, 1 = the Pressure Chamber. Retunes the ambient bed. */
  setTension(value) {
    this.tension = Math.min(1, Math.max(0, value));
  }

  #startAmbient() {
    this.started = true;
    const now = this.context.currentTime;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 920;
    filter.Q.value = 0.5;
    filter.connect(this.music);

    for (const [index, frequency] of [110, 164.81, 220].entries()) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 3 - 3;
      gain.gain.value = index === 0 ? 0.038 : 0.018;
      oscillator.connect(gain).connect(filter);
      oscillator.start(now);
      this.ambientNodes.push(oscillator, gain);
    }

    const rainBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const rain = rainBuffer.getChannelData(0);
    for (let i = 0; i < rain.length; i += 1) rain[i] = Math.random() * 2 - 1;
    const rainSource = this.context.createBufferSource();
    const rainFilter = this.context.createBiquadFilter();
    const rainGain = this.context.createGain();
    rainSource.buffer = rainBuffer;
    rainSource.loop = true;
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1650;
    rainFilter.Q.value = 0.4;
    rainGain.gain.value = 0.018;
    rainSource.connect(rainFilter).connect(rainGain).connect(this.music);
    rainSource.start(now);
    this.ambientNodes.push(rainSource, rainFilter, rainGain);

    this.chimeTimer = window.setInterval(() => {
      if (!this.enabled) return;
      const notes = this.tension > 0.5 ? [146.83, 174.61, 220] : [329.63, 440, 493.88];
      notes.forEach((note, index) => this.tone(note, 0.75, "sine", 0.035, 1, index * 0.16));
    }, 6800);
  }

  tone(frequency, duration = 0.2, type = "sine", volume = 0.08, slide = 1, delay = 0) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noise(duration = 0.12, volume = 0.06, highpass = 400) {
    if (!this.enabled || !this.context) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.sfx);
    source.start();
  }

  play(name, amount = 1) {
    if (!this.enabled) return;
    const strength = Math.max(0.2, Math.min(1, amount));
    switch (name) {
      case "charge":
        this.tone(130, 0.12, "sine", 0.04, 1.3);
        break;
      case "jump":
        this.tone(165 + strength * 70, 0.28, "triangle", 0.11, 2.2);
        this.noise(0.08, 0.035, 1100);
        break;
      case "land":
        this.tone(110, 0.13, "sine", 0.07 * strength, 0.62);
        break;
      case "spring":
        this.tone(196, 0.34, "triangle", 0.1, 3.2);
        this.tone(392, 0.22, "sine", 0.05, 2.4, 0.05);
        this.noise(0.1, 0.03, 900);
        break;
      case "seed": {
        // The chain multiplier lifts the arpeggio a scale degree at a time.
        const step = Math.round(strength * 4);
        [523.25, 659.25, 783.99].forEach((note, index) => {
          this.tone(note * (1 + step * 0.06), 0.24, "sine", 0.055, 1.04, index * 0.055);
        });
        break;
      }
      case "squish":
        this.tone(145, 0.22, "triangle", 0.09, 0.55);
        this.noise(0.09, 0.045, 700);
        break;
      case "unlock":
        [220, 277.18, 329.63, 440].forEach((note, index) => this.tone(note, 0.4, "triangle", 0.05, 1.08, index * 0.08));
        break;
      case "hurt":
        this.tone(190, 0.34, "sawtooth", 0.07, 0.38);
        this.noise(0.18, 0.075, 350);
        break;
      case "slam":
        this.tone(72, 0.55, "sine", 0.18, 0.45);
        this.noise(0.28, 0.12, 90);
        break;
      case "bossHit":
        this.tone(440, 0.35, "square", 0.07, 0.5);
        this.tone(880, 0.22, "sine", 0.06, 1.4, 0.04);
        break;
      case "bossPhase":
        this.tone(98, 0.9, "sawtooth", 0.09, 0.6);
        this.tone(146.83, 0.7, "square", 0.05, 0.72, 0.08);
        this.noise(0.4, 0.06, 160);
        break;
      case "victory":
        [261.63, 329.63, 392, 523.25, 659.25].forEach((note, index) => this.tone(note, 0.9, "sine", 0.065, 1.01, index * 0.14));
        break;
      default:
        break;
    }
  }
}
