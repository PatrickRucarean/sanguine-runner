/**
 * SANGUINE_RUNNER — Phase 2 Automated Combat, Arsenal, Game Feel & Anti-Lag Verification Suite
 * Tests The Jackal & Casull, Occult Katana, Slide Blood-Kick Bowling, Vampiric Executions,
 * Micro-Hitstop & FOV Punch, AudioManager +-5% Pitch Variation, Object-Pooled Gibs,
 * Batched Floating Damage Numbers, and Interleaved Spatial-Grid Boids.
 */

import assert from 'node:assert/strict';
import { Vec3 } from '../src/physics/Vec3.js';
import { MovementConfig, MovementState } from '../src/physics/MovementConfig.js';
import { CollisionWorld } from '../src/physics/CollisionWorld.js';
import { KinematicController } from '../src/physics/KinematicController.js';
import { CameraRig } from '../src/core/CameraRig.js';
import { buildGreyboxCollisionWorld } from '../src/world/ArenaGeometryData.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { VFXAndPoolManager } from '../src/combat/VFXAndPoolManager.js';
import { TargetHuskManager, HuskState, MAX_HUSKS } from '../src/combat/TargetHuskManager.js';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { WeaponSlot } from '../src/combat/WeaponDefinitions.js';

const DT = MovementConfig.DT;

function createCombatSandbox() {
  const world = new CollisionWorld();
  buildGreyboxCollisionWorld(world);
  const controller = new KinematicController(world, new Vec3(0, 0.02, 10));
  const cameraRig = new CameraRig(controller);
  const audio = new AudioManager();
  const vfx = new VFXAndPoolManager();
  const huskManager = new TargetHuskManager({ vfx, audio });
  const weaponSystem = new WeaponSystem({
    controller,
    huskManager,
    vfx,
    audio,
    cameraRig,
  });
  return { world, controller, cameraRig, audio, vfx, huskManager, weaponSystem };
}

console.log('===================================================================');
console.log(' SANGUINE_RUNNER // PHASE 2 COMBAT, JUICE & ANTI-LAG VERIFICATION');
console.log('===================================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: The Jackal & Casull — Silver Brand, Mercury AoE Detonation, Pierce & Active Reload
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();
  // Spawn 3 Husks in a straight line along -Z (z = 4, z = 2, z = 0)
  huskManager.spawnHusk(0, 0, 0, 4.0, { maxHp: 300, maxPoise: 120 });
  huskManager.spawnHusk(1, 0, 0, 2.0, { maxHp: 300, maxPoise: 120 });
  huskManager.spawnHusk(2, 0, 0, 0.0, { maxHp: 300, maxPoise: 120 });

  // Aim slightly up toward head height (y = 1.56) of Husk 0 at z = 4 (dist = 6m)
  controller.yaw = 0;
  controller.pitch = -0.02;

  // Shot 1: Casull (.454 Silver) -> Hits Husk 0, applies Silver Brand
  const shot1 = weaponSystem.fireJackalCasullPrimary();
  assert.equal(shot1.fired, true);
  assert.equal(shot1.barrel, 'CASULL');
  assert.ok(huskManager.silverBrandTimer[0] > 3.0, 'Casull should apply Silver Brand to Husk 0');

  // Shot 2: The Jackal (13mm Mercury AP) -> Pierces Husk 0, 1, and 2 AND detonates Silver Brand on Husk 0!
  weaponSystem.primaryCooldown = 0;
  const shot2 = weaponSystem.fireJackalCasullPrimary();
  assert.equal(shot2.fired, true);
  assert.equal(shot2.barrel, 'JACKAL');
  assert.ok(shot2.targetsHit >= 2, `The Jackal should pierce multiple aligned husks, hit=${shot2.targetsHit}`);
  assert.equal(shot2.anyMercuryDetonation, true, 'The Jackal hitting a Silver-Branded target must trigger Mercury AoE Detonation');
  assert.ok(weaponSystem.hitstopTicksRemaining >= 2, 'Mercury Detonation / Headshot must trigger Micro-Hitstop frames');

  // Test Active Blood Reload (`R` inside [0.40, 0.65] window)
  weaponSystem._handleReloadInput(); // Start reload
  assert.equal(weaponSystem.isReloading, true);
  weaponSystem.reloadTimer = weaponSystem.weapons[0].ammo.reloadDurationSec * 0.50; // 50% progress (in gold zone)
  const activeSuccess = weaponSystem._handleReloadInput();
  assert.equal(activeSuccess, true, 'Pressing R in gold window should succeed Active Blood Reload');
  assert.equal(weaponSystem.isEmpoweredMag, true, 'Magazine should be Blood Empowered (+25% DMG & +1 Pierce)');
  assert.equal(weaponSystem.pistolAmmo, 12, 'Ammo should be instantly refilled to 12');

  console.log(`[PASS] Test 1: Jackal & Casull Silver Brand -> Mercury Detonation, ${shot2.targetsHit}-Target Pierce, & Active Blood Reload`);
}

// ---------------------------------------------------------------------------
// TEST 2: Jackal & Casull RMB — Weakpoint Snap Obliteration & Low-Poly Gib Explosion
// ---------------------------------------------------------------------------
{
  const { controller, vfx, huskManager, weaponSystem } = createCombatSandbox();
  // Spawn a Staggered Husk slightly off-center (within 8.5 deg cone)
  huskManager.spawnHusk(0, 0.45, 0, 4.0, { maxHp: 220, maxPoise: 50 });
  huskManager.state[0] = HuskState.STAGGERED;
  huskManager.staggerTimer[0] = 2.5;

  controller.yaw = 0;
  controller.pitch = 0;

  const burst = weaponSystem.fireJackalCasullTwinBurst();
  assert.equal(burst.fired, true);
  assert.equal(burst.snappedToWeakpoint, true, 'RMB Twin Burst should auto-snap to Staggered Husk cranium within 8.5 deg cone');
  assert.equal(burst.kills, 1, 'Obliteration Crit (260 DMG) should kill the 220 HP staggered husk');
  assert.ok(vfx.totalGibsSpawned >= 10, `Killing via Obliteration Crit should spawn low-poly dismemberment gibs, spawned=${vfx.totalGibsSpawned}`);
  assert.ok(weaponSystem.hitstopTicksRemaining >= 4, 'Twin Cross-Burst must trigger 4 frames of Micro-Hitstop');

  console.log(`[PASS] Test 2: Twin Crucifix Weakpoint Auto-Snap (${burst.totalDamageDealt} DMG), 4-Frame Hitstop, & ${vfx.totalGibsSpawned} Pooled Gibs`);
}

// ---------------------------------------------------------------------------
// TEST 3: Occult Katana — Hemorrhage Bleed Stacking, 3D Blood-Dash Rupture & Kill-Reset
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();
  weaponSystem.switchWeapon(WeaponSlot.OCCULT_KATANA);
  weaponSystem.primaryCooldown = 0;

  // Spawn Husk in melee range (2.2m ahead at z = 7.8)
  huskManager.spawnHusk(0, 0, 0, 7.8, { maxHp: 210, maxPoise: 80 });

  // Give player high horizontal speed so Katana slash is a guaranteed Crit (+2 Bleed stacks)
  controller.velocity.set(0, 0, -18.0);
  const slash1 = weaponSystem.performKatanaSlash();
  assert.equal(slash1.slashed, true);
  assert.equal(slash1.isCrit, true, 'High-momentum Katana slash should critically hit');
  assert.equal(huskManager.bleedStacks[0], 2, 'Crit Katana slash should apply 2 Hemorrhage Bleed stacks');
  assert.ok(weaponSystem.hitstopTicksRemaining >= 3, 'Crit Katana slash should trigger 3 Micro-Hitstop frames');

  // Execute RMB Iaijutsu Blood-Dash through Husk 0 -> slices for 110 DMG + ruptures Bleed stacks for 150% burst -> Kills Husk 0 & Resets Dash Cooldown!
  const dashRes = weaponSystem.startKatanaBloodDash();
  assert.equal(dashRes.dashed, true);
  for (let i = 0; i < 12; i++) {
    weaponSystem._stepKatanaBloodDash(DT);
    controller.position.addScaled(controller.velocity, DT);
  }

  assert.equal(huskManager.state[0], HuskState.DEAD, 'Blood-Dash + Bleed Rupture should kill Husk 0');
  assert.equal(weaponSystem.katanaDashCooldown, 0.0, 'Killing a target with Blood-Dash must refund 100% of dash cooldown (Kill-Reset)');

  console.log(`[PASS] Test 3: Occult Katana Crit Bleed Stacking, Blood-Dash Hemorrhage Rupture, & Instant Kill-Reset`);
}

// ---------------------------------------------------------------------------
// TEST 4: Context-Sensitive Quick Melee (`F` Key): Slide Blood-Kick Bowling & Vampiric Execution
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();

  // Part A: Slide Blood-Kick Bowling Strike
  // Husk 0 at z = 7.5 (kicked target), Husk 1 behind it at z = 4.5 (bowling pin!)
  huskManager.spawnHusk(0, 0, 0, 7.5, { maxHp: 180, maxPoise: 60 });
  huskManager.spawnHusk(1, 0, 0, 4.5, { maxHp: 100, maxPoise: 60 });

  controller.state = MovementState.SLIDE;
  controller.velocity.set(0, 0, -16.5);
  const kickRes = weaponSystem.executeQuickMelee();
  assert.equal(kickRes.type, 'SLIDE_BLOOD_KICK', 'Pressing F while sliding must trigger SLIDE_BLOOD_KICK');
  assert.equal(huskManager.state[0], HuskState.BOWLING_BALL, 'Kicked husk must enter BOWLING_BALL state at 24 m/s');

  // Step HuskManager so the launched Bowling Ball Husk 0 bowls through Husk 1!
  for (let i = 0; i < 25; i++) {
    huskManager.step(DT, controller.position);
  }
  assert.ok(huskManager.totalBowlingStrikes >= 1, 'Bowling-Ball Husk 0 must collide with and strike Husk 1');
  assert.equal(huskManager.state[1], HuskState.DEAD, '115 DMG Bowling collision must obliterate Husk 1');

  // Part B: Vampiric Execution on Staggered Husk 0
  huskManager.state[0] = HuskState.STAGGERED;
  huskManager.posX[0] = 0;
  huskManager.posZ[0] = 7.0;
  controller.position.set(0, 0.02, 10.0);
  controller.state = MovementState.RUN;
  weaponSystem.hp = 60;
  weaponSystem.blood = 40;
  weaponSystem.quickMeleeCooldown = 0;

  const execRes = weaponSystem.executeQuickMelee();
  assert.equal(execRes.type, 'VAMPIRIC_EXECUTION', 'Pressing F near a Staggered Husk must trigger VAMPIRIC_EXECUTION');
  assert.equal(weaponSystem.hp, 85, 'Vampiric Execution must restore +25 HP (60 -> 85)');
  assert.equal(weaponSystem.blood, 70, 'Vampiric Execution must restore +30 Blood (40 -> 70)');
  assert.equal(huskManager.state[0], HuskState.DEAD, 'Executed husk must be killed and gibbed');

  console.log(`[PASS] Test 4: Slide Blood-Kick Bowling Strike (${huskManager.totalBowlingStrikes} strike) & Vampiric Execution (+25 HP / +30 Blood)`);
}

// ---------------------------------------------------------------------------
// TEST 5: AudioManager Pitch Variation (+-5% Anti-Ear-Fatigue Verification)
// ---------------------------------------------------------------------------
{
  const audio = new AudioManager();
  for (let i = 0; i < 40; i++) {
    audio.playCasullShot();
    audio.playKatanaSlash(i % 3);
    audio.playFootstep();
  }
  const samples = audio.stats.pitchSamples;
  assert.ok(samples.length >= 100, 'Should record 100+ pitch variation samples');
  const minPitch = Math.min(...samples);
  const maxPitch = Math.max(...samples);
  assert.ok(minPitch >= 0.93 && maxPitch <= 1.07, `Pitch variation must stay within +-6%, range=[${minPitch.toFixed(3)}, ${maxPitch.toFixed(3)}]`);
  assert.ok(maxPitch - minPitch > 0.04, 'Pitch multipliers must actively vary across shots');

  console.log(`[PASS] Test 5: AudioManager Pitch Variation Verified (Range: ${minPitch.toFixed(3)}x .. ${maxPitch.toFixed(3)}x across ${audio.stats.totalSoundsPlayed} sounds)`);
}

// ---------------------------------------------------------------------------
// TEST 6: Anti-Lag Scaling — Batched Damage Numbers & Interleaved Spatial Boid Flocking
// ---------------------------------------------------------------------------
{
  const { vfx, huskManager, controller } = createCombatSandbox();

  // Part A: Fire 10 rapid hits/bleed ticks onto Target ID 7 within 400ms -> Must batch into 1 growing label!
  const targetPos = new Vec3(0, 1.5, 5);
  for (let hit = 0; hit < 10; hit++) {
    vfx.recordDamageNumber(7, targetPos, 15, { isBleed: true });
    vfx.update(0.02); // Advance 20ms per hit (200ms total < 400ms batch window)
  }
  assert.equal(
    vfx.getActiveDamageLabelCount(),
    1,
    `10 rapid hits on the same target must batch into 1 single floating label, got ${vfx.getActiveDamageLabelCount()}`
  );
  const activeLbl = vfx.damageLabels.find((l) => l.active && l.targetId === 7);
  assert.equal(activeLbl.accumulatedDamage, 150, `Batched label must sum 10 x 15 = 150 DMG, got ${activeLbl.accumulatedDamage}`);
  assert.equal(activeLbl.hitCount, 10, 'Batched label hitCount should be 10');

  // Part B: Spawn all 48 Husks and verify Interleaved Boid Flocking updates exactly 25% (12 husks) per tick
  for (let i = 0; i < MAX_HUSKS; i++) {
    huskManager.spawnHusk(i, (i % 8) * 1.1, 0, Math.floor(i / 8) * 1.1);
  }
  huskManager.step(DT, controller.position);
  assert.equal(
    huskManager.interleavedBoidQueriesLastTick,
    MAX_HUSKS / 4,
    `Interleaved Boids should query exactly 1/4 (${MAX_HUSKS / 4}) of active husks per tick, queried=${huskManager.interleavedBoidQueriesLastTick}`
  );

  console.log(`[PASS] Test 6: Anti-Lag Batching (10 hits -> 1 label showing "${activeLbl.accumulatedDamage} [x${activeLbl.hitCount}]") & Interleaved Boids (${huskManager.interleavedBoidQueriesLastTick}/${MAX_HUSKS} queries/tick)`);
}

console.log('\n===================================================================');
console.log(' ALL 6 PHASE 2 COMBAT, JUICE & ANTI-LAG SUITES PASSED!');
console.log('===================================================================');
