/**
 * SANGUINE_RUNNER — Multi-Layered Procedural WebAudio Manager with Mandatory Pitch Variation
 * Synthesizes heavy boomer-shooter gunshots, metallic katana slashes, gore bursts, and chimes.
 * Applies +-5% random pitch variation (0.95x to 1.05x) on every sound to prevent ear fatigue.
 * Headless-safe for automated Node.js verification suites.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;

    // Telemetry for automated verification tests
    this.stats = {
      totalSoundsPlayed: 0,
      lastPitchMultiplier: 1.0,
      pitchSamples: [],
      countsByType: {},
    };
  }

  /** Lazily initializes WebAudio context on first user interaction */
  _ensureContext() {
    if (!this.enabled) return false;
    if (typeof window === 'undefined') return false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.38;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  /**
   * Generates a randomized pitch multiplier in [1 - variance, 1 + variance] (default +-5%).
   * @param {number} [variance=0.05]
   */
  _nextPitchMultiplier(variance = 0.05) {
    const mult = 1.0 + (Math.random() * 2.0 - 1.0) * variance;
    this.stats.lastPitchMultiplier = mult;
    this.stats.totalSoundsPlayed++;
    if (this.stats.pitchSamples.length < 128) {
      this.stats.pitchSamples.push(mult);
    }
    return mult;
  }

  _recordSound(type, variance = 0.05) {
    this.stats.countsByType[type] = (this.stats.countsByType[type] || 0) + 1;
    return this._nextPitchMultiplier(variance);
  }

  /** Helper to create a short white/pink noise burst buffer */
  _createNoiseBuffer(durationSec = 0.15) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * durationSec));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.4));
    }
    return buffer;
  }

  /**
   * Casull (.454 Silver Auto) — Sharp metallic bark + high silver ring
   */
  playCasullShot() {
    const pitch = this._recordSound('casull_shot', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    // Layer 1: Sub-bass punch
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(145 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(38 * pitch, now + 0.11);
    subGain.gain.setValueAtTime(0.75, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    sub.connect(subGain).connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.12);

    // Layer 2: Gunpowder transient crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.14);
    noise.playbackRate.value = pitch;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400 * pitch;
    filter.Q.value = 1.2;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.65, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    noise.connect(filter).connect(nGain).connect(this.masterGain);
    noise.start(now);

    return pitch;
  }

  /**
   * The Jackal (13mm Armor-Piercing Cannon) — Heavy low-end boom + metallic breach clang
   */
  playJackalShot() {
    const pitch = this._recordSound('jackal_shot', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    // Layer 1: Heavy cannon sub-drop
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(115 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(26 * pitch, now + 0.18);
    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    sub.connect(subGain).connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.19);

    // Layer 2: Metallic mercury ring
    const ring = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ring.type = 'square';
    ring.frequency.setValueAtTime(620 * pitch, now);
    ring.frequency.exponentialRampToValueAtTime(210 * pitch, now + 0.12);
    ringGain.gain.setValueAtTime(0.28, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    ring.connect(ringGain).connect(this.masterGain);
    ring.start(now);
    ring.stop(now + 0.13);

    return pitch;
  }

  /**
   * Twin Cross-Burst (RMB Alt-Fire) — Thunderous synchronized dual rail blast
   */
  playTwinCrossBurst() {
    const pitch = this._recordSound('twin_cross_burst', 0.05);
    if (!this._ensureContext()) return pitch;
    this.playCasullShot();
    this.playJackalShot();
    return pitch;
  }

  /**
   * Occult Katana Slash — High-frequency blade whistle + crisp air shear
   */
  playKatanaSlash(comboIndex = 0) {
    const pitch = this._recordSound('katana_slash', 0.05) * (1.0 + comboIndex * 0.06);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    // Layer 1: Ultrasonic steel resonance sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(240 * pitch, now + 0.09);
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);

    // Layer 2: Air whoosh noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.09);
    noise.playbackRate.value = pitch;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 * pitch;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.38, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    noise.connect(hp).connect(nGain).connect(this.masterGain);
    noise.start(now);

    return pitch;
  }

  /**
   * Occult Katana RMB Blood-Dash Strike
   */
  playKatanaBloodDash() {
    const pitch = this._recordSound('katana_blood_dash', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(880 * pitch, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(90 * pitch, now + 0.18);
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);

    return pitch;
  }

  /**
   * Hitmarker & Critical / Stagger Break Feedback
   */
  playHitmarker(isCrit = false, isStaggerBreak = false) {
    const pitch = this._recordSound('hitmarker', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isCrit ? 'triangle' : 'sine';
    const baseFreq = isStaggerBreak ? 1320 : isCrit ? 960 : 520;
    osc.frequency.setValueAtTime(baseFreq * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55 * pitch, now + 0.065);
    gain.gain.setValueAtTime(isCrit ? 0.5 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.075);

    return pitch;
  }

  /**
   * Dismemberment / Gib Explosion Gore Sound
   */
  playGibExplosion() {
    const pitch = this._recordSound('gib_explosion', 0.06);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(32 * pitch, now + 0.16);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);

    return pitch;
  }

  /**
   * Slide Blood-Kick & Vampiric Execution
   */
  playMeleeImpact(isExecution = false) {
    const pitch = this._recordSound(isExecution ? 'execution' : 'slide_kick', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime((isExecution ? 440 : 180) * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(45 * pitch, now + 0.15);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);

    return pitch;
  }

  /**
   * Weapon Reload & Active Blood Reload Chime
   */
  playReload(isActiveSuccess = false) {
    const pitch = this._recordSound('reload', 0.05);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isActiveSuccess ? 'triangle' : 'square';
    osc.frequency.setValueAtTime((isActiveSuccess ? 880 : 340) * pitch, now);
    osc.frequency.exponentialRampToValueAtTime((isActiveSuccess ? 1320 : 220) * pitch, now + 0.09);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);

    return pitch;
  }

  /**
   * Subtle Pitch-Varied Footstep
   */
  playFootstep() {
    const pitch = this._recordSound('footstep', 0.06);
    if (!this._ensureContext()) return pitch;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(35 * pitch, now + 0.045);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);

    return pitch;
  }
}
