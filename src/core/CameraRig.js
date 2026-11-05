/**
 * SANGUINE_RUNNER — First-Person Procedural Camera Rig
 * Handles Mouse Look with soft zenith/nadir clamping, Dynamic Velocity FOV Warp,
 * Strafe/Slide/Wall-Run Roll Tilt, Lissajous Figure-8 Head-Bobbing, and Damped Landing Springs.
 */

import { Vec3, clamp, damp } from '../physics/Vec3.js';
import { MovementConfig, MovementState } from '../physics/MovementConfig.js';

const DEG2RAD = Math.PI / 180.0;
const MAX_PITCH_RAD = 89.0 * DEG2RAD;
const SOFT_CLAMP_START_RAD = 84.0 * DEG2RAD;

export class CameraRig {
  /**
   * @param {import('../physics/KinematicController.js').KinematicController} controller
   */
  constructor(controller) {
    this.controller = controller;
    this.cfg = controller.cfg;

    // Mouse look settings
    this.mouseSensitivity = 0.0021; // radians per pixel

    // Smoothed camera state
    this.currentEyeHeight = this.cfg.STANDING_EYE_HEIGHT;
    this.currentFov = this.cfg.BASE_FOV;
    this.currentRollRad = 0.0;
    this.currentPitchOffsetRad = 0.0;

    // Head-bob state
    this.bobPhase = 0.0;
    this.bobWeight = 0.0;
    this.bobOffsetX = 0.0;
    this.bobOffsetY = 0.0;

    // Second-order vertical & pitch spring for landing impact, jump punch, & mantle vault
    this.springPosY = 0.0;
    this.springVelY = 0.0;
    this.springPitch = 0.0;
    this.springPitchVel = 0.0;

    // Output world eye position & Euler angles (YXZ order)
    this.eyePosition = new Vec3();
    this.eulerYXZ = { pitch: 0, yaw: 0, roll: 0 };
  }

  /**
   * Applies raw mouse movement deltas with smooth resistance near +-89 deg pitch limits.
   * @param {number} deltaX Mouse X movement in pixels
   * @param {number} deltaY Mouse Y movement in pixels
   */
  applyMouseDelta(deltaX, deltaY) {
    this.controller.yaw -= deltaX * this.mouseSensitivity;

    // Keep yaw normalized in [-PI, PI]
    if (this.controller.yaw > Math.PI) this.controller.yaw -= Math.PI * 2;
    if (this.controller.yaw < -Math.PI) this.controller.yaw += Math.PI * 2;

    // Soft clamping near +-89 degrees so looking straight up/down feels cushioned, not brick-walled
    const rawPitchDelta = -deltaY * this.mouseSensitivity;
    const absPitch = Math.abs(this.controller.pitch);
    let pitchScale = 1.0;

    if (
      absPitch > SOFT_CLAMP_START_RAD &&
      Math.sign(rawPitchDelta) === Math.sign(this.controller.pitch)
    ) {
      const t = clamp(
        (absPitch - SOFT_CLAMP_START_RAD) / (MAX_PITCH_RAD - SOFT_CLAMP_START_RAD),
        0,
        1
      );
      pitchScale = 1.0 - t * 0.75;
    }

    this.controller.pitch = clamp(
      this.controller.pitch + rawPitchDelta * pitchScale,
      -MAX_PITCH_RAD,
      MAX_PITCH_RAD
    );
  }

  /**
   * Updates procedural camera effects every frame.
   * @param {number} dt Render frame delta time in seconds
   * @param {number} alpha Fixed-step interpolation factor [0..1]
   * @param {Object} input Current input state (for strafe tilt)
   */
  update(dt, alpha, input = { moveRight: 0 }) {
    const ctrl = this.controller;
    const state = ctrl.state;
    const hSpeed = ctrl.getHorizontalSpeed();

    // 1. Trigger impulse springs on controller state events
    if (ctrl.justLanded) {
      const impact = clamp(ctrl.lastLandingImpactVy / 18.0, 0.15, 1.4);
      this.springVelY -= impact * 2.4;
      this.springPitchVel -= impact * 1.1;
    }
    if (ctrl.justJumped) {
      this.springVelY += 0.85;
      this.springPitchVel += 0.45;
    }
    if (ctrl.justMantled) {
      this.springVelY -= 1.3;
      this.springPitchVel -= 1.6;
    }

    // 2. Step Second-Order Damped Springs (Landing dip & pitch punch)
    const springStiffness = 180.0;
    const springDamping = 19.0;
    const safeDt = Math.min(dt, 0.05);

    const accelY = -springStiffness * this.springPosY - springDamping * this.springVelY;
    this.springVelY += accelY * safeDt;
    this.springPosY = clamp(this.springPosY + this.springVelY * safeDt, -0.32, 0.20);

    const accelPitch = -springStiffness * this.springPitch - springDamping * this.springPitchVel;
    this.springPitchVel += accelPitch * safeDt;
    this.springPitch = clamp(this.springPitch + this.springPitchVel * safeDt, -0.12, 0.12);

    // 3. Smooth Eye-Height Transition (Standing 1.65m <-> Sliding 0.78m)
    const targetEyeHeight =
      state === MovementState.SLIDE
        ? this.cfg.SLIDING_EYE_HEIGHT
        : this.cfg.STANDING_EYE_HEIGHT;
    this.currentEyeHeight = damp(this.currentEyeHeight, targetEyeHeight, 18.0, safeDt);

    // 4. Dynamic Velocity FOV Warp (95 deg -> 113 deg)
    const speedOverBase = Math.max(0, hSpeed - this.cfg.FOV_SPEED_START);
    const fovFactor = clamp(speedOverBase / this.cfg.FOV_SPEED_RANGE, 0.0, 1.0);
    let targetFov = this.cfg.BASE_FOV + (this.cfg.MAX_FOV - this.cfg.BASE_FOV) * fovFactor;

    if (state === MovementState.SLIDE) targetFov += 2.5;
    else if (state === MovementState.WALL_RUN) targetFov += 3.0;

    this.currentFov = damp(this.currentFov, clamp(targetFov, this.cfg.BASE_FOV, 116.0), 12.0, safeDt);

    // 5. Camera Roll / Tilt (Wall-Run Tilt, Slide Tilt, & Strafe Tilt)
    let targetRollDeg = 0.0;
    if (state === MovementState.WALL_RUN) {
      // Tilt away from the wall: Left wall (-1) -> tilt right (-12.5 deg in right-hand Z roll)
      targetRollDeg = ctrl.wallSide * this.cfg.WALL_RUN_TILT_DEG;
    } else if (state === MovementState.SLIDE) {
      const strafeBias = input.moveRight ? -input.moveRight * 1.8 : 1.0;
      targetRollDeg = this.cfg.SLIDE_TILT_DEG * (strafeBias !== 0 ? strafeBias : 1.0);
    } else {
      // Subtle strafe tilt when pressing A / D
      targetRollDeg = -(input.moveRight || 0) * this.cfg.STRAFE_TILT_DEG;
    }
    this.currentRollRad = damp(this.currentRollRad, targetRollDeg * DEG2RAD, 14.0, safeDt);

    // 6. Subtle Lissajous Figure-8 Head-Bobbing (active strictly in grounded RUN)
    const isRunningOnGround = state === MovementState.RUN && ctrl.grounded && hSpeed > 1.5;
    const targetBobWeight = isRunningOnGround
      ? clamp(hSpeed / this.cfg.RUN_SPEED, 0.2, 1.25)
      : 0.0;
    this.bobWeight = damp(this.bobWeight, targetBobWeight, 14.0, safeDt);

    if (this.bobWeight > 0.01) {
      this.bobPhase += hSpeed * this.cfg.HEAD_BOB_FREQ * safeDt;
      this.bobOffsetX = Math.cos(this.bobPhase * 0.5) * this.cfg.HEAD_BOB_AMP_X * this.bobWeight;
      this.bobOffsetY = Math.sin(this.bobPhase) * this.cfg.HEAD_BOB_AMP_Y * this.bobWeight;
    } else {
      this.bobOffsetX = damp(this.bobOffsetX, 0, 14.0, safeDt);
      this.bobOffsetY = damp(this.bobOffsetY, 0, 14.0, safeDt);
    }

    // 7. Compute Final Interpolated World Eye Position & Orientation
    const interpFeet = ctrl.getInterpolatedPosition(alpha);
    const right = ctrl.getRightXZ();

    this.eyePosition.set(
      interpFeet.x + right.x * this.bobOffsetX,
      interpFeet.y + this.currentEyeHeight + this.bobOffsetY + this.springPosY,
      interpFeet.z + right.z * this.bobOffsetX
    );

    this.eulerYXZ.yaw = ctrl.yaw;
    this.eulerYXZ.pitch = clamp(ctrl.pitch + this.springPitch, -MAX_PITCH_RAD, MAX_PITCH_RAD);
    this.eulerYXZ.roll = this.currentRollRad;
  }
}
