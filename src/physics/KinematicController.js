/**
 * SANGUINE_RUNNER — 120Hz Hierarchical Finite State Machine (HFSM) Kinematic Controller
 * Implements IDLE, RUN, SLIDE, WALL_RUN, AIR, and MANTLE states with Quake/Source
 * air-strafing, bhop friction bypass, slope slide momentum, lateral raycast wall-running,
 * dynamic wall-kick impulse transfer, and 3-ray Bezier ledge mantling.
 */

import { Vec3, clamp, lerp } from './Vec3.js';
import { MovementConfig, MovementState, WallSide } from './MovementConfig.js';

export class KinematicController {
  /**
   * @param {import('./CollisionWorld.js').CollisionWorld} world
   * @param {Vec3} [spawnPos]
   */
  constructor(world, spawnPos = new Vec3(0, 1.0, 0)) {
    this.world = world;
    this.cfg = { ...MovementConfig };

    // Transform & Velocity State (current and previous tick for render interpolation)
    this.position = spawnPos.clone();
    this.prevPosition = spawnPos.clone();
    this.velocity = new Vec3(0, 0, 0);

    // Look Orientation (radians)
    this.yaw = 0;   // 0 = looking along -Z
    this.pitch = 0;

    // HFSM State
    this.state = MovementState.IDLE;
    this.prevState = MovementState.IDLE;
    this.grounded = false;
    this.wasGrounded = false;
    this.groundNormal = new Vec3(0, 1, 0);

    // Timers & Counters
    this.coyoteTimer = 0.0;
    this.jumpBufferTimer = 0.0;
    this.groundedTicks = 0;
    this.slideBoostCooldown = 0.0;
    this.slideDuration = 0.0;

    // Wall-Run State
    this.wallSide = WallSide.NONE;
    this.wallNormal = new Vec3(0, 0, 0);
    this.wallTangent = new Vec3(0, 0, -1);
    this.lastWallNormal = new Vec3(0, 0, 0);
    this.wallRunTimer = 0.0;
    this.wallReattachTimer = 0.0;
    this.wallLockedSpeed = 0.0;

    // Mantle State (Quadratic Bezier Curve)
    this.mantleTimer = 0.0;
    this.mantleStart = new Vec3();
    this.mantleControl = new Vec3();
    this.mantleTarget = new Vec3();
    this.mantleForward = new Vec3();
    this.mantlePreservedSpeed = 0.0;

    // Telemetry & Event Callbacks for Camera Rig & HUD
    this.peakHorizontalSpeed = 0.0;
    this.bhopChainCount = 0;
    this.lastLandingImpactVy = 0.0;
    this.justJumped = false;
    this.justSlideJumped = false;
    this.justWallKicked = false;
    this.justMantled = false;
    this.justLanded = false;
    this.justUsedJumpPad = false;

    // Course Milestone Flags (for live verification HUD)
    this.milestones = {
      sprintReached: false,
      slideExecuted: false,
      slideJumpBhop: false,
      slopeBoost20: false,
      wallRunLocked: false,
      wallKickExecuted: false,
      ledgeMantled: false,
    };
  }

  /** Reset controller to a target spawn position and yaw */
  respawn(pos = new Vec3(0, 1.0, 0), yaw = 0) {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.state = MovementState.IDLE;
    this.grounded = false;
    this.wasGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallSide = WallSide.NONE;
    this.lastWallNormal.set(0, 0, 0);
    this.bhopChainCount = 0;
  }

  /** Normalized horizontal camera forward vector (-sin(yaw), 0, -cos(yaw)) */
  getForwardXZ(out = new Vec3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /** Normalized horizontal camera right vector (cos(yaw), 0, -sin(yaw)) */
  getRightXZ(out = new Vec3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  /** Current horizontal speed ||v_xz|| in m/s */
  getHorizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Current collider height based on state */
  getColliderHeight() {
    if (this.state === MovementState.SLIDE || this.state === MovementState.MANTLE) {
      return this.cfg.SLIDING_HEIGHT;
    }
    return this.cfg.STANDING_HEIGHT;
  }

  /**
   * Executes one deterministic 120Hz physics tick.
   * @param {Object} input
   * @param {number} input.moveForward -1 (S) to +1 (W)
   * @param {number} input.moveRight -1 (A) to +1 (D)
   * @param {boolean} input.jumpPressed True on the frame Space was pressed
   * @param {boolean} input.jumpHeld True while Space is held (allows auto-bhop if held or buffered)
   * @param {boolean} input.slideHeld True while Shift/Ctrl/C is held
   * @param {boolean} input.slidePressed True on frame Shift/Ctrl/C was pressed
   * @param {boolean} input.walkHeld Optional precision walk modifier
   * @param {number} [dt] Fixed timestep (default 1/120)
   */
  step(input, dt = this.cfg.DT) {
    this.prevPosition.copy(this.position);
    this.prevState = this.state;

    // Reset per-tick event triggers
    this.justJumped = false;
    this.justSlideJumped = false;
    this.justWallKicked = false;
    this.justMantled = false;
    this.justLanded = false;
    this.justUsedJumpPad = false;

    // 1. Update Timers
    if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.slideBoostCooldown > 0) this.slideBoostCooldown = Math.max(0, this.slideBoostCooldown - dt);
    if (this.wallReattachTimer > 0) this.wallReattachTimer = Math.max(0, this.wallReattachTimer - dt);

    if (input.jumpPressed) {
      this.jumpBufferTimer = this.cfg.JUMP_BUFFER;
    }

    // 2. Compute Horizontal Wish Direction from WASD & Camera Yaw
    const forward = this.getForwardXZ();
    const right = this.getRightXZ();
    const wishDir = new Vec3(
      forward.x * (input.moveForward || 0) + right.x * (input.moveRight || 0),
      0,
      forward.z * (input.moveForward || 0) + right.z * (input.moveRight || 0)
    );
    const hasMoveInput = wishDir.lengthSq() > 1e-4;
    if (hasMoveInput) {
      wishDir.normalize();
    }

    // 3. Handle Active MANTLE State (Non-blocking 160ms Bezier Ledge Vault)
    if (this.state === MovementState.MANTLE) {
      this._stepMantle(dt);
      this._updateTelemetry();
      return;
    }

    // 4. Evaluate State Transitions Before Velocity Integration
    this._evaluateStateTransitions(input, wishDir, hasMoveInput);

    // 5. Execute State-Specific Velocity Math
    switch (this.state) {
      case MovementState.IDLE:
      case MovementState.RUN:
        this._stepGroundMovement(input, wishDir, hasMoveInput, dt);
        break;
      case MovementState.SLIDE:
        this._stepSlideMovement(input, wishDir, hasMoveInput, dt);
        break;
      case MovementState.WALL_RUN:
        this._stepWallRunMovement(input, wishDir, hasMoveInput, dt);
        break;
      case MovementState.AIR:
      default:
        this._stepAirMovement(input, wishDir, hasMoveInput, dt);
        break;
    }

    // 6. Collide-and-Slide Capsule Resolution against CollisionWorld
    const preLandingVy = this.velocity.y;
    const height = this.getColliderHeight();
    const collisionResult = this.world.moveAndSlideCapsule(
      this.position,
      this.velocity,
      this.cfg.CAPSULE_RADIUS,
      height,
      this.cfg.STEP_HEIGHT,
      this.grounded,
      dt
    );

    this.wasGrounded = this.grounded;
    this.grounded = collisionResult.grounded;
    this.groundNormal.copy(collisionResult.groundNormal);

    // 7. Handle Jump Pad (Sanguine Geyser) Launch
    if (collisionResult.triggeredJumpPad) {
      const imp = collisionResult.triggeredJumpPad.jumpPadImpulse;
      if (imp) {
        if (imp.vx !== undefined && imp.vx !== 0) this.velocity.x = imp.vx;
        if (imp.vz !== undefined && imp.vz !== 0) this.velocity.z = imp.vz;
        this.velocity.y = imp.vy || 21.0;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.state = MovementState.AIR;
        this.wallSide = WallSide.NONE;
        this.lastWallNormal.set(0, 0, 0);
        this.justUsedJumpPad = true;
      }
    }

    // 8. Post-Collision Landing / Ledge Exit Handling
    if (this.grounded) {
      this.coyoteTimer = this.cfg.COYOTE_TIME;
      this.lastWallNormal.set(0, 0, 0); // Reset wall lock on touching ground
      this.wallSide = WallSide.NONE;

      if (!this.wasGrounded) {
        this.groundedTicks = 0;
        this.justLanded = true;
        this.lastLandingImpactVy = Math.abs(Math.min(0, preLandingVy));

        // Transition on landing: Slide-Hop Queue vs Run/Idle
        if (input.slideHeld && this.getHorizontalSpeed() >= this.cfg.SLIDE_MIN_ENTRY_SPEED) {
          this._enterSlide(true); // Grant slide impulse if off cooldown and preserve air speed
        } else if (this.state === MovementState.AIR || this.state === MovementState.WALL_RUN) {
          this.state = hasMoveInput ? MovementState.RUN : MovementState.IDLE;
        }
      } else {
        this.groundedTicks++;
      }
    } else {
      // Left the ground
      if (this.wasGrounded && this.state !== MovementState.WALL_RUN && this.state !== MovementState.MANTLE) {
        this.state = MovementState.AIR;
      }
      this.groundedTicks = 0;
    }

    // 9. Check Ledge Grab / Mantle Probe when Airborne or Wall-Running
    if (
      (this.state === MovementState.AIR || this.state === MovementState.WALL_RUN) &&
      (input.moveForward > 0 || input.jumpHeld) &&
      this.velocity.y < 8.5
    ) {
      this._tryStartMantle(forward);
    }

    // 10. Update Telemetry & Course Milestones
    this._updateTelemetry();
  }

  /**
   * Evaluates transitions between IDLE, RUN, SLIDE, WALL_RUN, and AIR.
   */
  _evaluateStateTransitions(input, wishDir, hasMoveInput) {
    const hSpeed = this.getHorizontalSpeed();

    // Ensure any ungrounded non-wallrun/non-mantle state is AIR so gravity applies immediately
    if (!this.grounded && this.state !== MovementState.WALL_RUN && this.state !== MovementState.MANTLE) {
      this.state = MovementState.AIR;
    }

    // A. Grounded transitions
    if (this.grounded && this.state !== MovementState.WALL_RUN) {
      // Check Jump (Ground Jump or Slide-Jump!) — if sliding under a low arch, keep jump buffered until clear!
      if (this.jumpBufferTimer > 0) {
        const hasJumpClearance =
          this.state !== MovementState.SLIDE ||
          this.world.canStandUp(this.position, this.cfg.CAPSULE_RADIUS, this.cfg.STANDING_HEIGHT);
        if (hasJumpClearance) {
          this._performGroundOrSlideJump();
          return;
        }
      }

      if (this.state === MovementState.SLIDE) {
        // Stay in slide if crouch is held and speed is above exit threshold (or ceiling forces crouch)
        const canStand = this.world.canStandUp(
          this.position,
          this.cfg.CAPSULE_RADIUS,
          this.cfg.STANDING_HEIGHT
        );
        const wantsExit = !input.slideHeld || hSpeed < this.cfg.SLIDE_EXIT_SPEED;
        if (wantsExit && canStand) {
          this.state = hasMoveInput ? MovementState.RUN : MovementState.IDLE;
        }
      } else {
        // Check entry into SLIDE
        if (
          (input.slidePressed || input.slideHeld) &&
          hSpeed >= this.cfg.SLIDE_MIN_ENTRY_SPEED
        ) {
          this._enterSlide(true);
          return;
        }
        // Toggle between RUN and IDLE
        if (hasMoveInput || hSpeed > 0.5) {
          this.state = MovementState.RUN;
        } else {
          this.state = MovementState.IDLE;
        }
      }
      return;
    }

    // B. Airborne Coyote Jump check
    if (this.state === MovementState.AIR && this.coyoteTimer > 0 && this.jumpBufferTimer > 0) {
      this._performGroundOrSlideJump();
      return;
    }

    // C. Airborne -> Wall-Run attachment check
    if (this.state === MovementState.AIR && this.wallReattachTimer <= 0 && !input.slideHeld) {
      if (this._tryAttachWallRun()) {
        return;
      }
    }
  }

  /**
   * Enters the SLIDE state, applying flat-ground impulse if off cooldown.
   */
  _enterSlide(allowFlatBoost) {
    this.state = MovementState.SLIDE;
    this.slideDuration = 0.0;
    this.milestones.slideExecuted = true;

    const hSpeed = this.getHorizontalSpeed();
    if (allowFlatBoost && this.slideBoostCooldown <= 0 && hSpeed > 0.1) {
      const inv = 1.0 / hSpeed;
      const dirX = this.velocity.x * inv;
      const dirZ = this.velocity.z * inv;
      this.velocity.x += dirX * this.cfg.SLIDE_IMPULSE;
      this.velocity.z += dirZ * this.cfg.SLIDE_IMPULSE;
      this.slideBoostCooldown = this.cfg.SLIDE_BOOST_COOLDOWN;
    }
  }

  /**
   * Executes either a normal Ground/Coyote Jump or a momentum-amplifying Slide-Jump.
   */
  _performGroundOrSlideJump() {
    const wasSliding = this.state === MovementState.SLIDE;
    const hSpeed = this.getHorizontalSpeed();

    this.velocity.y = this.cfg.JUMP_VELOCITY;
    this.grounded = false;
    this.coyoteTimer = 0.0;
    this.jumpBufferTimer = 0.0;
    this.state = MovementState.AIR;
    this.justJumped = true;

    if (wasSliding && hSpeed > 0.5) {
      // Slide-Jump conversion: +2.2 m/s + 15% of excess slide velocity
      const inv = 1.0 / hSpeed;
      const dirX = this.velocity.x * inv;
      const dirZ = this.velocity.z * inv;
      const excess = Math.max(0, hSpeed - this.cfg.RUN_SPEED);
      const boost = this.cfg.SLIDE_JUMP_HORIZ_BOOST + excess * this.cfg.SLIDE_JUMP_EXCESS_TRANSFER;

      this.velocity.x += dirX * boost;
      this.velocity.z += dirZ * boost;
      this.justSlideJumped = true;
      this.bhopChainCount++;
      if (this.getHorizontalSpeed() >= 16.0) {
        this.milestones.slideJumpBhop = true;
      }
    } else if (this.groundedTicks <= this.cfg.BHOP_FRICTION_GRACE_TICKS + 1 && hSpeed > this.cfg.RUN_SPEED * 0.95) {
      this.bhopChainCount++;
    } else {
      this.bhopChainCount = 1;
    }
  }

  /**
   * Section 2.2.A & 2.2.B: Ground Friction (with Bhop Grace Window) & Snappy Acceleration.
   */
  _stepGroundMovement(input, wishDir, hasMoveInput, dt) {
    const hSpeed = this.getHorizontalSpeed();

    // Skip ground friction during the 2-tick Bhop Grace Window if a jump is queued/held
    const inBhopWindow =
      this.groundedTicks < this.cfg.BHOP_FRICTION_GRACE_TICKS &&
      (this.jumpBufferTimer > 0 || input.jumpHeld);

    if (!inBhopWindow && hSpeed > 0) {
      const frictionCoeff = hasMoveInput ? this.cfg.GROUND_FRICTION : this.cfg.IDLE_FRICTION;
      const control = Math.max(hSpeed, this.cfg.STOP_SPEED);
      const newSpeed = Math.max(0, hSpeed - control * frictionCoeff * dt);

      if (newSpeed < this.cfg.ZERO_VELOCITY_EPSILON && !hasMoveInput) {
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.bhopChainCount = 0;
      } else {
        const scale = newSpeed / hSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    // Apply dot-product acceleration along wishDir
    if (hasMoveInput) {
      const wishSpeed = input.walkHeld ? this.cfg.WALK_SPEED : this.cfg.RUN_SPEED;
      this._accelerateHorizontal(wishDir, wishSpeed, this.cfg.GROUND_ACCEL, dt);
      if (this.getHorizontalSpeed() >= this.cfg.RUN_SPEED * 0.96) {
        this.milestones.sprintReached = true;
      }
    }

    // Follow ground/slope tangent plane smoothly
    if (this.velocity.y <= 0 && this.groundNormal.y > 0.65) {
      const n = this.groundNormal;
      this.velocity.y = -(this.velocity.x * n.x + this.velocity.z * n.z) / n.y - 0.5;
    }
  }

  /**
   * Section 2.2.C: Ground Sliding & Downhill Slope Acceleration Math.
   */
  _stepSlideMovement(input, wishDir, hasMoveInput, dt) {
    this.slideDuration += dt;

    // 1. Low Slide Friction: v <- v * (1 - mu_slide * dt)
    const frictionFactor = Math.max(0, 1.0 - this.cfg.SLIDE_FRICTION * dt);
    this.velocity.x *= frictionFactor;
    this.velocity.z *= frictionFactor;

    // 2. Slope Gravity Acceleration along downward slope tangent
    const n = this.groundNormal;
    if (n.y < 0.998 && n.y >= 0.65) {
      const sinTheta = Math.sqrt(Math.max(0, 1.0 - n.y * n.y));
      const hNormLen = Math.hypot(n.x, n.z);
      if (hNormLen > 1e-6) {
        // Downhill horizontal unit vector is (n.x / hNormLen, n.z / hNormLen)
        const downDirX = n.x / hNormLen;
        const downDirZ = n.z / hNormLen;
        const slopeAccel = this.cfg.SLOPE_GRAVITY * sinTheta;
        this.velocity.x += downDirX * slopeAccel * dt;
        this.velocity.z += downDirZ * slopeAccel * dt;
      }
    }

    // 3. Subtle lateral steering while sliding (without robbing forward momentum)
    if (hasMoveInput) {
      const hSpeed = this.getHorizontalSpeed();
      if (hSpeed > 0.5) {
        this._accelerateHorizontal(wishDir, Math.min(hSpeed, this.cfg.RUN_SPEED), this.cfg.SLIDE_STEER_ACCEL, dt);
      }
    }

    if (this.getHorizontalSpeed() >= 20.0) {
      this.milestones.slopeBoost20 = true;
    }

    // Apply soft speed cap drag above 28.0 m/s during downhill slides
    const hSpeed = this.getHorizontalSpeed();
    if (hSpeed > this.cfg.SOFT_SPEED_CAP) {
      const excessRatio = (hSpeed - this.cfg.SOFT_SPEED_CAP) / this.cfg.SOFT_SPEED_CAP;
      const drag = Math.max(0.75, 1.0 - 2.2 * excessRatio * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }

    // Keep velocity vector parallel to the slope plane so high-speed downhill slides stay glued
    if (this.velocity.y <= 0 && n.y > 0.65) {
      this.velocity.y = -(this.velocity.x * n.x + this.velocity.z * n.z) / n.y - 0.8;
    }
  }

  /**
   * Section 2.2.B: Airborne Movement with Quake/Source Dot-Product Air-Strafing.
   */
  _stepAirMovement(input, wishDir, hasMoveInput, dt) {
    if (hasMoveInput) {
      // Pass 1: Standard directional air control (allows smooth air adjustment below base speed)
      this._accelerateHorizontal(wishDir, this.cfg.AIR_WISH_SPEED, this.cfg.AIR_ACCEL, dt);

      // Pass 2: Quake/Source Air-Strafe Acceleration (builds speed when turning + strafing)
      this._accelerateHorizontal(wishDir, this.cfg.AIR_STRAFE_WISH_SPEED, this.cfg.AIR_STRAFE_ACCEL, dt);
    }

    // Horizontal Speed Soft Cap quadratic drag above 28.0 m/s
    const hSpeed = this.getHorizontalSpeed();
    if (hSpeed > this.cfg.SOFT_SPEED_CAP) {
      const excessRatio = (hSpeed - this.cfg.SOFT_SPEED_CAP) / this.cfg.SOFT_SPEED_CAP;
      const drag = Math.max(0.8, 1.0 - this.cfg.AIR_DRAG_OVER_CAP * excessRatio * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }

    // Apply snappy gravity
    this.velocity.y += this.cfg.GRAVITY * dt;
  }

  /**
   * Section 2.2.D: 5-Ray Lateral Wall-Run Detection, Velocity Lock, Vertical Decay, & Wall-Kick.
   */
  _tryAttachWallRun() {
    const hSpeed = this.getHorizontalSpeed();
    if (hSpeed < this.cfg.WALL_MIN_SPEED) return false;

    const forward = this.getForwardXZ();
    const right = this.getRightXZ();

    // Waist-height ray origin
    const rayOrigin = new Vec3(this.position.x, this.position.y + 0.90, this.position.z);
    const cos25 = Math.cos((25 * Math.PI) / 180);
    const sin25 = Math.sin((25 * Math.PI) / 180);

    // 4-ray lateral fan: Left (-90 deg, -65 deg) and Right (+90 deg, +65 deg)
    const candidateRays = [
      {
        side: WallSide.LEFT,
        dir: new Vec3(-right.x, 0, -right.z).normalize(),
      },
      {
        side: WallSide.LEFT,
        dir: new Vec3(
          -right.x * cos25 + forward.x * sin25,
          0,
          -right.z * cos25 + forward.z * sin25
        ).normalize(),
      },
      {
        side: WallSide.RIGHT,
        dir: new Vec3(right.x, 0, right.z).normalize(),
      },
      {
        side: WallSide.RIGHT,
        dir: new Vec3(
          right.x * cos25 + forward.x * sin25,
          0,
          right.z * cos25 + forward.z * sin25
        ).normalize(),
      },
    ];

    let bestHit = null;
    let bestSide = WallSide.NONE;

    for (let i = 0; i < candidateRays.length; i++) {
      const ray = candidateRays[i];
      const hit = this.world.raycast(rayOrigin, ray.dir, this.cfg.WALL_RAY_DISTANCE);
      if (!hit.hit) continue;

      // 1. Must be a near-vertical wall (|n_y| < 0.25)
      if (Math.abs(hit.normal.y) >= this.cfg.WALL_NORMAL_MAX_Y) continue;

      // 2. Must not be looking straight into or away from the wall (|f_xz . n_wall| < 0.82)
      const wallN = new Vec3(hit.normal.x, 0, hit.normal.z).normalize();
      if (Math.abs(forward.dot(wallN)) >= 0.82) continue;

      // 3. Must not be the exact same wall plane we just kicked off from
      if (
        this.lastWallNormal.lengthSq() > 0.5 &&
        wallN.dot(this.lastWallNormal) > this.cfg.WALL_SAME_NORMAL_DOT
      ) {
        continue;
      }

      if (!bestHit || hit.distance < bestHit.distance) {
        bestHit = hit;
        bestSide = ray.side;
      }
    }

    if (!bestHit) return false;

    // Attach to Wall-Run!
    this.state = MovementState.WALL_RUN;
    this.wallSide = bestSide;
    this.wallNormal.set(bestHit.normal.x, 0, bestHit.normal.z).normalize();
    this.wallRunTimer = 0.0;
    this.coyoteTimer = 0.0;

    // Project horizontal velocity onto wall tangent t_wall
    const vxz = new Vec3(this.velocity.x, 0, this.velocity.z);
    const vn = vxz.dot(this.wallNormal);
    this.wallTangent.copy(vxz).addScaled(this.wallNormal, -vn);
    if (this.wallTangent.lengthSq() < 1e-4) {
      // Fallback to camera forward projected onto wall
      const fn = forward.dot(this.wallNormal);
      this.wallTangent.copy(forward).addScaled(this.wallNormal, -fn);
    }
    this.wallTangent.normalize();

    // Horizontal Velocity Lock: max(||v_xz||, 14.5 m/s)
    this.wallLockedSpeed = Math.max(hSpeed, this.cfg.WALL_LOCK_MIN_SPEED);
    this.velocity.x = this.wallTangent.x * this.wallLockedSpeed;
    this.velocity.z = this.wallTangent.z * this.wallLockedSpeed;

    // Initial upward apex float on attachment
    this.velocity.y = Math.max(this.velocity.y * 0.35, this.cfg.WALL_APEX_FLOAT_VY);
    this.milestones.wallRunLocked = true;
    return true;
  }

  /**
   * Executes one physics tick in `WALL_RUN` state.
   */
  _stepWallRunMovement(input, wishDir, hasMoveInput, dt) {
    this.wallRunTimer += dt;

    // 1. Check Dynamic Wall-Jump Kick (`Space` pressed or buffered)
    if (input.jumpPressed || this.jumpBufferTimer > 0) {
      this._performWallJumpKick();
      return;
    }

    // 2. Check voluntary drop off wall (`Slide/Crouch` pressed or backward input)
    if (input.slidePressed || input.moveForward < -0.5 || this.wallRunTimer >= this.cfg.WALL_MAX_DURATION) {
      this._exitWallRun(true);
      return;
    }

    // 3. Re-verify wall contact via raycast along -wallNormal
    const rayOrigin = new Vec3(this.position.x, this.position.y + 0.90, this.position.z);
    const intoWallDir = new Vec3(-this.wallNormal.x, 0, -this.wallNormal.z).normalize();
    const wallCheck = this.world.raycast(rayOrigin, intoWallDir, this.cfg.WALL_RAY_DISTANCE + 0.25);

    if (!wallCheck.hit || Math.abs(wallCheck.normal.y) >= this.cfg.WALL_NORMAL_MAX_Y) {
      // Wall ended — exit cleanly into AIR preserving tangent momentum
      this._exitWallRun(false);
      return;
    }

    // Update wall normal & tangent smoothly for curved/angled wall segments
    this.wallNormal.set(wallCheck.normal.x, 0, wallCheck.normal.z).normalize();
    const tn = this.wallTangent.dot(this.wallNormal);
    this.wallTangent.addScaled(this.wallNormal, -tn).normalize();

    // 4. Horizontal Velocity Lock + Suction Force toward wall
    this.velocity.x =
      this.wallTangent.x * this.wallLockedSpeed -
      this.wallNormal.x * this.cfg.WALL_SUCTION_FORCE;
    this.velocity.z =
      this.wallTangent.z * this.wallLockedSpeed -
      this.wallNormal.z * this.cfg.WALL_SUCTION_FORCE;

    // 5. Subtle Quadratic Vertical Decay Curve:
    // v_y(t) = 1.8 - g_wall * (t / T_max)^2
    const normT = clamp(this.wallRunTimer / this.cfg.WALL_MAX_DURATION, 0, 1);
    this.velocity.y =
      this.cfg.WALL_APEX_FLOAT_VY -
      this.cfg.WALL_DECAY_GRAVITY * (normT * normT);
  }

  /**
   * Section 2.2.D.4: Dynamic Wall-Jump Kick Impulse Transfer
   * Blends 55% wall normal + 45% normalize(wallTangent + cameraForwardXZ).
   */
  _performWallJumpKick() {
    const forward = this.getForwardXZ();
    const forwardTangentBlend = new Vec3(
      this.wallTangent.x + forward.x,
      0,
      this.wallTangent.z + forward.z
    );
    if (forwardTangentBlend.lengthSq() > 1e-5) {
      forwardTangentBlend.normalize();
    } else {
      forwardTangentBlend.copy(this.wallTangent);
    }

    const nw = this.cfg.WALL_KICK_NORMAL_WEIGHT;
    const fw = 1.0 - nw;
    const kickDir = new Vec3(
      this.wallNormal.x * nw + forwardTangentBlend.x * fw,
      0,
      this.wallNormal.z * nw + forwardTangentBlend.z * fw
    ).normalize();

    const kickHorizSpeed = Math.max(
      this.wallLockedSpeed + this.cfg.WALL_KICK_SPEED_ADD,
      this.cfg.WALL_KICK_MIN_HORIZ
    );

    this.velocity.x = kickDir.x * kickHorizSpeed;
    this.velocity.z = kickDir.z * kickHorizSpeed;
    this.velocity.y = this.cfg.WALL_KICK_UP_VELOCITY;

    this.lastWallNormal.copy(this.wallNormal);
    this.wallSide = WallSide.NONE;
    this.wallReattachTimer = this.cfg.WALL_REATTACH_COOLDOWN;
    this.jumpBufferTimer = 0.0;
    this.state = MovementState.AIR;
    this.justWallKicked = true;
    this.justJumped = true;
    this.bhopChainCount++;
    this.milestones.wallKickExecuted = true;
  }

  _exitWallRun(applySmallPushOff) {
    if (applySmallPushOff) {
      this.velocity.x = this.wallTangent.x * this.wallLockedSpeed + this.wallNormal.x * 3.0;
      this.velocity.z = this.wallTangent.z * this.wallLockedSpeed + this.wallNormal.z * 3.0;
    } else {
      this.velocity.x = this.wallTangent.x * this.wallLockedSpeed;
      this.velocity.z = this.wallTangent.z * this.wallLockedSpeed;
    }
    this.lastWallNormal.copy(this.wallNormal);
    this.wallSide = WallSide.NONE;
    this.wallReattachTimer = this.cfg.WALL_REATTACH_COOLDOWN;
    this.state = MovementState.AIR;
  }

  /**
   * Section 2.2.E: 3-Ray Ledge Mantle Detection & Quadratic Bezier Vault
   */
  _tryStartMantle(forward) {
    // 1. Chest Ray (Ray_Low): must HIT a wall
    const lowOrigin = new Vec3(
      this.position.x,
      this.position.y + this.cfg.MANTLE_LOW_RAY_HEIGHT,
      this.position.z
    );
    const lowHit = this.world.raycast(lowOrigin, forward, this.cfg.MANTLE_REACH);
    if (!lowHit.hit || Math.abs(lowHit.normal.y) > 0.35) return false;

    // 2. Head Clearance Ray (Ray_High): must MISS (open space above ledge)
    const highOrigin = new Vec3(
      this.position.x,
      this.position.y + this.cfg.MANTLE_HIGH_RAY_HEIGHT,
      this.position.z
    );
    const highHit = this.world.raycast(highOrigin, forward, this.cfg.MANTLE_REACH + 0.15);
    if (highHit.hit) return false;

    // 3. Downward Ledge Top Probe (Ray_Down): must HIT a walkable ledge top
    const probeForwardDist = Math.min(lowHit.distance + 0.38, this.cfg.MANTLE_REACH + 0.1);
    const downOrigin = new Vec3(
      this.position.x + forward.x * probeForwardDist,
      this.position.y + this.cfg.MANTLE_HIGH_RAY_HEIGHT,
      this.position.z + forward.z * probeForwardDist
    );
    const downHit = this.world.raycast(downOrigin, new Vec3(0, -1, 0), 1.35);
    if (!downHit.hit || downHit.normal.y < 0.70) return false;

    const targetPos = new Vec3(
      downHit.point.x,
      downHit.point.y + 0.02,
      downHit.point.z
    );

    // Ensure standing capsule fits on top of the ledge
    if (
      this.world.checkCapsuleOverlap(
        targetPos,
        this.cfg.CAPSULE_RADIUS * 0.9,
        this.cfg.STANDING_HEIGHT
      )
    ) {
      return false;
    }

    // Enter MANTLE state!
    this.state = MovementState.MANTLE;
    this.mantleTimer = 0.0;
    this.mantleStart.copy(this.position);
    this.mantleTarget.copy(targetPos);
    this.mantleControl.set(
      this.position.x,
      targetPos.y + 0.25,
      this.position.z
    );
    this.mantleForward.copy(forward);
    this.mantlePreservedSpeed = Math.max(this.getHorizontalSpeed(), this.cfg.MANTLE_EXIT_MIN_SPEED);
    this.wallSide = WallSide.NONE;
    this.lastWallNormal.set(0, 0, 0);
    this.justMantled = true;
    this.milestones.ledgeMantled = true;
    return true;
  }

  /**
   * Advances quadratic Bezier interpolation during `MANTLE`.
   */
  _stepMantle(dt) {
    this.mantleTimer += dt;
    const t = clamp(this.mantleTimer / this.cfg.MANTLE_DURATION, 0, 1);
    const invT = 1.0 - t;

    // Quadratic Bezier: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    this.position.x =
      invT * invT * this.mantleStart.x +
      2 * invT * t * this.mantleControl.x +
      t * t * this.mantleTarget.x;
    this.position.y =
      invT * invT * this.mantleStart.y +
      2 * invT * t * this.mantleControl.y +
      t * t * this.mantleTarget.y;
    this.position.z =
      invT * invT * this.mantleStart.z +
      2 * invT * t * this.mantleControl.z +
      t * t * this.mantleTarget.z;

    if (t >= 1.0) {
      this.position.copy(this.mantleTarget);
      this.velocity.x = this.mantleForward.x * this.mantlePreservedSpeed;
      this.velocity.z = this.mantleForward.z * this.mantlePreservedSpeed;
      this.velocity.y = 0.0;
      this.grounded = true;
      this.state = MovementState.RUN;
    }
  }

  /**
   * Core Quake/Source dot-product horizontal acceleration:
   * Preserves existing overspeed when v_proj >= wishSpeed, while allowing
   * tangential acceleration when turning/strafing.
   */
  _accelerateHorizontal(wishDir, wishSpeed, accelCoeff, dt) {
    const currentProj = this.velocity.x * wishDir.x + this.velocity.z * wishDir.z;
    const addSpeed = wishSpeed - currentProj;
    if (addSpeed <= 0) return;

    const accelSpeed = Math.min(addSpeed, accelCoeff * wishSpeed * dt);
    this.velocity.x += accelSpeed * wishDir.x;
    this.velocity.z += accelSpeed * wishDir.z;
  }

  _updateTelemetry() {
    const hSpeed = this.getHorizontalSpeed();
    if (hSpeed > this.peakHorizontalSpeed) {
      this.peakHorizontalSpeed = hSpeed;
    }
  }

  /**
   * Returns interpolated world position between `prevPosition` and `position` for smooth rendering.
   */
  getInterpolatedPosition(alpha, out = new Vec3()) {
    return out.set(
      lerp(this.prevPosition.x, this.position.x, alpha),
      lerp(this.prevPosition.y, this.position.y, alpha),
      lerp(this.prevPosition.z, this.position.z, alpha)
    );
  }
}
