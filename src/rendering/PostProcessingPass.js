/**
 * SANGUINE_RUNNER — Phase 3: Gothic PSX / Boomer-Shooter Post-Processing Pipeline
 * Implements Section 6.2 of GAME_PLAN.md:
 *  - Ordered Bayer 4x4 Dithering matrix
 *  - 24-bit -> 15-bit (32 levels/channel) Palette Quantization
 *  - Low-Health / Blood-Starved Radial Chromatic Aberration & Blood Moon Pulse
 */

export const BAYER_4X4 = Object.freeze([
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
]);

export class PostProcessingPass {
  constructor({ overlayElement = null } = {}) {
    this.overlayElement = overlayElement;
    this.retroScaleFactor = 0.5;
    this.quantizationLevels = 32.0; // 15-bit color (5-bit per channel)
    this.chromaticAberrationIntensity = 0.0;
    this.bloodMoonTintIntensity = 0.0;
  }

  /**
   * Quantizes a normalized RGB channel [0, 1] using Ordered Bayer 4x4 dithering to 15-bit (32 levels).
   */
  quantizeChannelWithBayer(value01, x, y) {
    const bayerVal = BAYER_4X4[y & 3][x & 3];
    const dithered = value01 + (bayerVal - 0.5) / this.quantizationLevels;
    const quantized = Math.floor(dithered * this.quantizationLevels + 0.5) / this.quantizationLevels;
    return Math.max(0.0, Math.min(1.0, quantized));
  }

  /**
   * Computes low-health radial chromatic aberration offset (Section 6.2.5):
   * delta_uv = (uv - 0.5) * k_trauma * (1 - hpRatio)^2
   */
  computeChromaticAberration(hp, maxHp, isBloodMoonSurge = false) {
    const hpRatio = Math.max(0.0, Math.min(1.0, hp / Math.max(1, maxHp)));
    const lowHpFactor = hpRatio < 0.35 ? Math.pow((0.35 - hpRatio) / 0.35, 2) : 0.0;
    this.chromaticAberrationIntensity = lowHpFactor * 0.018 + (isBloodMoonSurge ? 0.004 : 0.0);
    this.bloodMoonTintIntensity = isBloodMoonSurge ? 0.25 : lowHpFactor * 0.35;

    if (this.overlayElement) {
      const alpha = this.bloodMoonTintIntensity.toFixed(3);
      this.overlayElement.style.boxShadow =
        this.chromaticAberrationIntensity > 0.001
          ? `inset 0 0 90px rgba(230, 0, 18, ${alpha})`
          : 'none';
    }

    return {
      chromaticAberrationIntensity: this.chromaticAberrationIntensity,
      bloodMoonTintIntensity: this.bloodMoonTintIntensity,
    };
  }
}
