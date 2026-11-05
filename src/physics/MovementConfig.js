/**
 * SANGUINE_RUNNER — Master Kinematic Tuning Constants & State Definitions
 * Matches Section 2.2 & 2.3 of GAME_PLAN.md.
 */

export const MovementState = Object.freeze({
  IDLE: 'IDLE',
  RUN: 'RUN',
  SLIDE: 'SLIDE',
  WALL_RUN: 'WALL_RUN',
  AIR: 'AIR',
  MANTLE: 'MANTLE',
});

export const WallSide = Object.freeze({
  NONE: 0,
  LEFT: -1,
  RIGHT: 1,
});

export const MovementConfig = {
  // Fixed Timestep Simulation
  TICK_RATE: 120,
  DT: 1.0 / 120.0,

  // Player Capsule Dimensions (meters)
  CAPSULE_RADIUS: 0.42,
  STANDING_HEIGHT: 1.80,
  SLIDING_HEIGHT: 0.90,
  STANDING_EYE_HEIGHT: 1.65,
  SLIDING_EYE_HEIGHT: 0.78,
  STEP_HEIGHT: 0.48,

  // Gravity & Jumping
  GRAVITY: -28.0,               // m/s^2 (snappy, non-floaty fall arc)
  JUMP_VELOCITY: 10.5,          // m/s (apex ~1.97m)
  COYOTE_TIME: 0.12,            // 120ms grace window after walking off a ledge
  JUMP_BUFFER: 0.12,            // 120ms input buffer before touching ground
  BHOP_FRICTION_GRACE_TICKS: 2, // 2 ticks (16.6ms) friction bypass for lossless bunny-hopping

  // Ground Movement (Zero-Floatiness Snappy Accel/Decel)
  RUN_SPEED: 12.5,              // m/s base sprint/run speed
  WALK_SPEED: 7.8,              // m/s precision walk speed
  GROUND_ACCEL: 15.0,           // s^-1 reaches max speed in ~65ms
  GROUND_FRICTION: 8.5,         // s^-1 while running
  IDLE_FRICTION: 16.5,          // s^-1 instant crisp stop when releasing WASD
  STOP_SPEED: 5.0,              // m/s control speed floor so low-speed deceleration is instant
  ZERO_VELOCITY_EPSILON: 0.25,  // m/s snap-to-zero threshold

  // Air Control & Quake/Source Dot-Product Air-Strafing
  AIR_WISH_SPEED: 12.5,         // m/s standard directional air control
  AIR_ACCEL: 2.8,               // s^-1 standard air steering
  AIR_STRAFE_WISH_SPEED: 2.35,  // m/s Quake-style air-strafe cap along wish vector
  AIR_STRAFE_ACCEL: 36.0,       // s^-1 tangential momentum gain when turning + strafing
  SOFT_SPEED_CAP: 28.0,         // m/s horizontal soft cap before quadratic air bleed
  AIR_DRAG_OVER_CAP: 0.85,

  // Ground Sliding & Slope Momentum
  SLIDE_MIN_ENTRY_SPEED: 6.0,   // m/s minimum speed required to enter slide
  SLIDE_EXIT_SPEED: 4.8,        // m/s speed below which slide transitions back to RUN
  SLIDE_IMPULSE: 4.8,           // m/s flat-ground initial slide boost
  SLIDE_BOOST_COOLDOWN: 0.65,   // s cooldown between flat-ground slide impulses
  SLIDE_FRICTION: 0.65,         // s^-1 ultra-low friction during slide
  SLOPE_GRAVITY: 34.0,          // m/s^2 downhill slope acceleration scalar
  SLIDE_STEER_ACCEL: 5.5,       // s^-1 lateral steering control while sliding
  SLIDE_JUMP_HORIZ_BOOST: 2.2,  // m/s extra forward speed on Slide-Jump
  SLIDE_JUMP_EXCESS_TRANSFER: 0.15,

  // Wall-Running & Dynamic Wall-Kick
  WALL_RAY_DISTANCE: 0.88,      // m lateral raycast fan reach
  WALL_MIN_SPEED: 7.0,          // m/s minimum horizontal speed to attach
  WALL_LOCK_MIN_SPEED: 14.5,    // m/s minimum locked speed along wall tangent
  WALL_SUCTION_FORCE: 2.5,      // m/s inward velocity bias to stay glued to walls
  WALL_MAX_DURATION: 1.50,      // s max wall-run duration before drop
  WALL_APEX_FLOAT_VY: 1.8,      // m/s initial upward float upon attaching
  WALL_DECAY_GRAVITY: 8.5,      // m/s quadratic vertical decay scalar
  WALL_NORMAL_MAX_Y: 0.25,      // |n_y| < 0.25 to qualify as vertical wall
  WALL_SAME_NORMAL_DOT: 0.92,   // prevents re-grabbing the exact same wall plane immediately
  WALL_REATTACH_COOLDOWN: 0.18, // s minimum delay before grabbing another wall
  WALL_KICK_UP_VELOCITY: 10.2,  // m/s upward impulse on wall-jump
  WALL_KICK_MIN_HORIZ: 16.2,    // m/s minimum horizontal speed on wall-jump
  WALL_KICK_SPEED_ADD: 2.6,     // m/s added to current horizontal speed on wall-jump
  WALL_KICK_NORMAL_WEIGHT: 0.55,// 55% wall normal + 45% (tangent + look direction)

  // Mantling / Ledge Grabbing
  MANTLE_REACH: 0.95,           // m forward probe length
  MANTLE_LOW_RAY_HEIGHT: 1.05,  // m chest probe height
  MANTLE_HIGH_RAY_HEIGHT: 2.15, // m head clearance probe height
  MANTLE_DURATION: 0.16,        // s (160ms) fast Bezier vault
  MANTLE_EXIT_MIN_SPEED: 11.2,  // m/s forward momentum surge exiting mantle

  // Camera & Game Feel
  BASE_FOV: 95.0,               // deg
  MAX_FOV: 113.0,               // deg at high speed
  FOV_SPEED_START: 12.5,        // m/s
  FOV_SPEED_RANGE: 17.5,        // m/s (full warp at 30 m/s)
  STRAFE_TILT_DEG: 2.2,         // deg camera roll when strafing A/D
  SLIDE_TILT_DEG: 4.5,          // deg camera roll while sliding
  WALL_RUN_TILT_DEG: 12.5,      // deg camera roll away from wall
  HEAD_BOB_FREQ: 1.85,          // steps per meter
  HEAD_BOB_AMP_Y: 0.042,        // m vertical bob amplitude
  HEAD_BOB_AMP_X: 0.028,        // m horizontal sway amplitude
};
