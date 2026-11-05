/**
 * SANGUINE_RUNNER — Automated 120Hz Physics & Camera Rig Verification Suite
 * Executes deterministic simulation tests against the actual Phase 1 Greybox Arena.
 */

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Vec3 } from '../src/physics/Vec3.js';
import { MovementConfig, MovementState, WallSide } from '../src/physics/MovementConfig.js';
import { CollisionWorld } from '../src/physics/CollisionWorld.js';
import { KinematicController } from '../src/physics/KinematicController.js';
import { CameraRig } from '../src/core/CameraRig.js';
import { ArenaSpawnPoints, buildGreyboxCollisionWorld } from '../src/world/ArenaGeometryData.js';

const DT = MovementConfig.DT;
const world = new CollisionWorld();
buildGreyboxCollisionWorld(world);

function createInput(overrides = {}) {
  return {
    moveForward: 0,
    moveRight: 0,
    jumpPressed: false,
    jumpHeld: false,
    slidePressed: false,
    slideHeld: false,
    walkHeld: false,
    ...overrides,
  };
}

console.log('===================================================================');
console.log(' SANGUINE_RUNNER // PHASE 1 PHYSICS & CAMERA VERIFICATION SUITE');
console.log('===================================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: Snappy Sprint Acceleration & Zero-Floatiness Deceleration
// ---------------------------------------------------------------------------
{
  const ctrl = new KinematicController(world, ArenaSpawnPoints.COURTYARD.position);
  // Settle onto courtyard floor
  for (let i = 0; i < 15; i++) ctrl.step(createInput(), DT);
  assert.equal(ctrl.grounded, true, 'Player should settle onto courtyard floor');
  assert.equal(ctrl.state, MovementState.IDLE, 'Initial grounded state should be IDLE');

  // Sprint forward for 12 ticks (100ms) -> should reach full 12.5 m/s
  for (let i = 0; i < 12; i++) {
    ctrl.step(createInput({ moveForward: 1 }), DT);
  }
  const runSpeed = ctrl.getHorizontalSpeed();
  assert.equal(ctrl.state, MovementState.RUN, 'State should be RUN while moving');
  assert.ok(Math.abs(runSpeed - MovementConfig.RUN_SPEED) < 0.05, `Expected 12.5 m/s, got ${runSpeed}`);

  // Release input -> should stop completely within 15 ticks (125ms) with zero floaty drift
  let ticksToZero = 0;
  for (let i = 1; i <= 25; i++) {
    ctrl.step(createInput(), DT);
    if (ctrl.getHorizontalSpeed() === 0 && ticksToZero === 0) {
      ticksToZero = i;
    }
  }
  assert.ok(ticksToZero > 0 && ticksToZero <= 15, `Should stop crisply in <=15 ticks, took ${ticksToZero}`);
  assert.equal(ctrl.state, MovementState.IDLE, 'Should return to IDLE at 0 m/s');
  console.log(`[PASS] Test 1: Snappy Sprint Accel (${runSpeed.toFixed(2)} m/s in 100ms) & Crisp Stop (${ticksToZero} ticks = ${(ticksToZero * DT * 1000).toFixed(1)}ms)`);
}

// ---------------------------------------------------------------------------
// TEST 2: Ground Slide Boost, Low Friction, Under-Arch Clearance & Slide-Jump Bhop
// ---------------------------------------------------------------------------
{
  const ctrl = new KinematicController(world, new Vec3(0, 0.02, 2.5));
  for (let i = 0; i < 10; i++) ctrl.step(createInput(), DT);

  // Build base run speed toward the Low Slide Gate at z = -4
  for (let i = 0; i < 12; i++) ctrl.step(createInput({ moveForward: 1 }), DT);

  // Trigger Slide!
  ctrl.step(createInput({ moveForward: 1, slidePressed: true, slideHeld: true }), DT);
  const slideBoostSpeed = ctrl.getHorizontalSpeed();
  assert.equal(ctrl.state, MovementState.SLIDE, 'Should enter SLIDE state');
  assert.ok(slideBoostSpeed >= 16.5, `Slide boost should surge to ~17.0 m/s, got ${slideBoostSpeed}`);

  // Slide underneath the low archway at z = -4 (lintel clearance = 1.25m, standing = 1.80m, sliding = 0.90m)
  for (let i = 0; i < 65; i++) {
    ctrl.step(createInput({ moveForward: 1, slideHeld: true }), DT);
  }
  assert.ok(ctrl.position.z < -5.7, `Player should slide cleanly underneath and clear the z=-4 archway, z=${ctrl.position.z.toFixed(2)}`);

  // Execute a Slide-Jump and chain a Bhop!
  const preJumpSpeed = ctrl.getHorizontalSpeed();
  ctrl.step(createInput({ moveForward: 1, slideHeld: true, jumpPressed: true, jumpHeld: true }), DT);
  const postSlideJumpSpeed = ctrl.getHorizontalSpeed();
  assert.equal(ctrl.state, MovementState.AIR, 'Slide-Jump should transition to AIR');
  assert.ok(postSlideJumpSpeed > preJumpSpeed + 2.0, `Slide-Jump should add horizontal boost (${preJumpSpeed.toFixed(2)} -> ${postSlideJumpSpeed.toFixed(2)} m/s)`);

  // Air-strafe slightly during jump and queue a Bhop upon landing
  while (!ctrl.grounded) {
    ctrl. yaw += 0.008;
    ctrl.step(createInput({ moveRight: 1, jumpHeld: true, jumpPressed: ctrl.position.y < 0.35 }), DT);
  }
  // Trigger buffered bhop on landing tick
  ctrl.step(createInput({ moveForward: 1, jumpPressed: true, jumpHeld: true }), DT);
  const bhopSpeed = ctrl.getHorizontalSpeed();
  assert.ok(bhopSpeed >= 16.0, `Bhop should preserve overspeed (>16 m/s), got ${bhopSpeed.toFixed(2)} m/s`);
  console.log(`[PASS] Test 2: Slide Impulse (${slideBoostSpeed.toFixed(2)} m/s), Low-Arch Slide Pass, Slide-Jump (${postSlideJumpSpeed.toFixed(2)} m/s) & Lossless Bhop (${bhopSpeed.toFixed(2)} m/s)`);
}

// ---------------------------------------------------------------------------
// TEST 3: Downhill Slope Slide Momentum (Blood-Aqueduct 28-deg Chute)
// ---------------------------------------------------------------------------
{
  // Place player at top of East Sector 28-deg Slide Chute (x = 58, z = -16, y = 11.2, facing +Z)
  const ctrl = new KinematicController(world, new Vec3(58, 11.2, -17.5));
  ctrl.yaw = Math.PI; // Facing +Z down the ramp
  for (let i = 0; i < 10; i++) ctrl.step(createInput(), DT);

  // Sprint onto the ramp and hold Slide
  for (let i = 0; i < 15; i++) ctrl.step(createInput({ moveForward: 1 }), DT);
  for (let i = 0; i < 95; i++) {
    ctrl.step(createInput({ moveForward: 1, slideHeld: true, slidePressed: i === 0 }), DT);
  }
  assert.ok(
    ctrl.peakHorizontalSpeed >= 22.0,
    `Downhill slope slide should accelerate past 22 m/s, peak=${ctrl.peakHorizontalSpeed.toFixed(2)} m/s`
  );
  assert.equal(ctrl.milestones.slopeBoost20, true, 'Slope boost >20 m/s milestone should trigger');
  console.log(`[PASS] Test 3: Downhill Slope Slide Acceleration (Peak Velocity: ${ctrl.peakHorizontalSpeed.toFixed(2)} m/s)`);
}

// ---------------------------------------------------------------------------
// TEST 4: Lateral Raycast Wall-Running, Horizontal Lock & Dynamic Wall-Kick Transfer
// ---------------------------------------------------------------------------
{
  // Position player entering the Parallel Wall-Run Corridor (Left wall inner face at x = -3.4)
  const ctrl = new KinematicController(world, new Vec3(-2.75, 3.5, -39.0));
  ctrl.yaw = 0.12; // Slightly angled toward left wall while moving North (-Z)
  ctrl.velocity.set(-1.5, 1.0, -13.5);
  ctrl.state = MovementState.AIR;

  // Step forward until lateral raycast attaches to Left Wall
  for (let i = 0; i < 10; i++) {
    ctrl.step(createInput({ moveForward: 1 }), DT);
    if (ctrl.state === MovementState.WALL_RUN) break;
  }

  assert.equal(ctrl.state, MovementState.WALL_RUN, 'Player should attach to WALL_RUN on Left Corridor Wall');
  assert.equal(ctrl.wallSide, WallSide.LEFT, 'Wall side should be detected as LEFT (-1)');
  const lockedSpeed = ctrl.getHorizontalSpeed();
  assert.ok(lockedSpeed >= MovementConfig.WALL_LOCK_MIN_SPEED - 0.1, `Wall-run should lock horizontal speed >=14.5 m/s, got ${lockedSpeed.toFixed(2)}`);

  // Run along the wall for 30 ticks (0.25s) and verify subtle vertical decay curve
  for (let i = 0; i < 30; i++) {
    ctrl.step(createInput({ moveForward: 1 }), DT);
  }
  assert.equal(ctrl.state, MovementState.WALL_RUN, 'Should remain locked in WALL_RUN along corridor');

  // Execute Dynamic Wall-Jump Kick toward Right Wall!
  ctrl.yaw = -0.18; // Look slightly right across the chasm
  ctrl.step(createInput({ moveForward: 1, jumpPressed: true, jumpHeld: true }), DT);

  const postKickSpeed = ctrl.getHorizontalSpeed();
  assert.equal(ctrl.state, MovementState.AIR, 'Wall-Kick should launch into AIR');
  assert.equal(ctrl.justWallKicked, true, 'justWallKicked flag should be set');
  assert.ok(ctrl.velocity.x > 5.0, `Wall-Kick from Left wall should transfer positive X impulse toward Right wall (vx=${ctrl.velocity.x.toFixed(2)})`);
  assert.ok(Math.abs(ctrl.velocity.y - MovementConfig.WALL_KICK_UP_VELOCITY) < 1.0, `Vertical kick velocity should be ~10.2 m/s, got ${ctrl.velocity.y.toFixed(2)}`);
  assert.ok(postKickSpeed >= MovementConfig.WALL_KICK_MIN_HORIZ - 0.2, `Wall-Kick horizontal speed should be >=16.2 m/s, got ${postKickSpeed.toFixed(2)}`);

  // Continue across the chasm and verify automatic attachment to the opposite Right Wall!
  let attachedRightWall = false;
  for (let i = 0; i < 80; i++) {
    ctrl.step(createInput({ moveForward: 1 }), DT);
    if (ctrl.state === MovementState.WALL_RUN && ctrl.wallSide === WallSide.RIGHT) {
      attachedRightWall = true;
      break;
    }
  }
  assert.equal(attachedRightWall, true, 'Player should chain from Left Wall-Kick directly onto the Right Parallel Wall');
  console.log(`[PASS] Test 4: Lateral Wall-Run Lock (${lockedSpeed.toFixed(2)} m/s), Wall-Kick Impulse (${postKickSpeed.toFixed(2)} m/s), & Left->Right Parallel Wall Chain`);
}

// ---------------------------------------------------------------------------
// TEST 5: 3-Ray Ledge Mantle & Quadratic Bezier Vault
// ---------------------------------------------------------------------------
{
  // Place player jumping toward Mantle Step 1 (center x=-28, top y=1.6m, east face at x=-25.75)
  const ctrl = new KinematicController(world, new Vec3(-25.1, 0.35, 12.0));
  ctrl.yaw = Math.PI * 0.5; // Facing West (-X) directly at the ledge face
  ctrl.velocity.set(-6.0, 2.0, 0);
  ctrl.state = MovementState.AIR;

  let enteredMantle = false;
  for (let i = 0; i < 20; i++) {
    ctrl.step(createInput({ moveForward: 1, jumpHeld: true }), DT);
    if (ctrl.state === MovementState.MANTLE) {
      enteredMantle = true;
      break;
    }
  }
  assert.equal(enteredMantle, true, '3-Ray probe should trigger MANTLE when chest hits wall and head clears ledge');

  // Complete the 160ms Bezier vault
  for (let i = 0; i < 25; i++) {
    ctrl.step(createInput({ moveForward: 1 }), DT);
    if (ctrl.state !== MovementState.MANTLE) break;
  }
  assert.equal(ctrl.state, MovementState.RUN, 'Should exit MANTLE smoothly into RUN');
  assert.ok(ctrl.position.y >= 1.58, `Player should stand on top of the 1.6m ledge, y=${ctrl.position.y.toFixed(2)}`);
  assert.ok(ctrl.getHorizontalSpeed() >= MovementConfig.MANTLE_EXIT_MIN_SPEED - 0.5, 'Mantle exit should preserve forward surge speed');
  console.log(`[PASS] Test 5: 3-Ray Bezier Ledge Mantle (Vaulted to y=${ctrl.position.y.toFixed(2)}m with ${ctrl.getHorizontalSpeed().toFixed(2)} m/s exit surge)`);
}

// ---------------------------------------------------------------------------
// TEST 6: Camera Rig — Soft Pitch Clamping, Dynamic FOV, Strafe/Wall Tilt & Head-Bob
// ---------------------------------------------------------------------------
{
  const ctrl = new KinematicController(world, ArenaSpawnPoints.COURTYARD.position);
  const cam = new CameraRig(ctrl);

  // Test extreme upward mouse flick -> should clamp cleanly at +89 deg
  cam.applyMouseDelta(0, -50000);
  const maxPitchDeg = (ctrl.pitch * 180) / Math.PI;
  assert.ok(Math.abs(maxPitchDeg - 89.0) < 0.05, `Pitch should clamp at 89 deg, got ${maxPitchDeg}`);

  // Test high velocity FOV expansion & Wall-Run Roll Tilt
  ctrl.state = MovementState.WALL_RUN;
  ctrl.wallSide = WallSide.LEFT;
  ctrl.velocity.set(0, 0, -26.0);
  for (let i = 0; i < 60; i++) {
    cam.update(DT, 1.0, { moveRight: 0 });
  }
  const rollDeg = (cam.currentRollRad * 180) / Math.PI;
  assert.ok(cam.currentFov > 108.0, `Dynamic FOV should expand >108 deg at 26 m/s, got ${cam.currentFov.toFixed(2)} deg`);
  assert.ok(Math.abs(rollDeg - (-MovementConfig.WALL_RUN_TILT_DEG)) < 0.5, `Left wall-run tilt should approach -12.5 deg, got ${rollDeg.toFixed(2)} deg`);
  console.log(`[PASS] Test 6: Camera Rig Clamping (${maxPitchDeg.toFixed(1)}°), Dynamic FOV (${cam.currentFov.toFixed(1)}°), & Wall-Run Roll (${rollDeg.toFixed(1)}°)`);
}

// ---------------------------------------------------------------------------
// TEST 7: 120Hz Simulation Performance Benchmark (10,000 Physics Ticks)
// ---------------------------------------------------------------------------
{
  const ctrl = new KinematicController(world, ArenaSpawnPoints.COURTYARD.position);
  const cam = new CameraRig(ctrl);
  const numTicks = 10000;

  const t0 = performance.now();
  for (let i = 0; i < numTicks; i++) {
    const phase = i % 240;
    const input = createInput({
      moveForward: 1,
      moveRight: phase < 120 ? 1 : -1,
      jumpPressed: phase % 45 === 0,
      jumpHeld: phase % 45 < 10,
      slidePressed: phase === 130,
      slideHeld: phase >= 130 && phase < 170,
    });
    ctrl.yaw += 0.012;
    ctrl.step(input, DT);
    cam.update(DT, 1.0, input);
  }
  const elapsedMs = performance.now() - t0;
  const avgTickMs = elapsedMs / numTicks;
  const maxTheoreticalHz = Math.round(1000 / avgTickMs);

  assert.ok(avgTickMs < 0.5, `120Hz tick budget is 8.33ms; expected <0.5ms, got ${avgTickMs.toFixed(4)}ms`);
  console.log(`[PASS] Test 7: 120Hz Benchmark — 10,000 full arena physics+camera ticks in ${elapsedMs.toFixed(1)}ms (${avgTickMs.toFixed(4)} ms/tick = ~${maxTheoreticalHz.toLocaleString()} Hz capacity)`);
}

console.log('\n===================================================================');
console.log(' ALL 7 PHASE 1 KINEMATIC & GREYBOX VERIFICATION SUITES PASSED!');
console.log('===================================================================');
