/**
 * SANGUINE_RUNNER — Phase 2 Automated Combat, Differentiated Melee Geometry,
 * Single-Weapon Run Loadout, Game Feel & Anti-Lag Verification Suite
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
import {
  TargetHuskManager,
  HuskState,
  EnemyArchetype,
  MAX_HUSKS,
} from '../src/combat/TargetHuskManager.js';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { WeaponSlot } from '../src/combat/WeaponDefinitions.js';
import {
  CharacterId,
  WeaponId,
  isWeaponAllowedForCharacter,
} from '../src/combat/CharacterCatalog.js';

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
console.log(' SANGUINE_RUNNER // PHASE 2 COMBAT, MELEE GEOMETRY & LOADOUT TESTS');
console.log('===================================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: The Jackal & Casull — Silver Brand, Mercury AoE Detonation, Pierce & Active Reload
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();
  huskManager.spawnHusk(0, 0, 0, 4.0, { maxHp: 300, maxPoise: 120 });
  huskManager.spawnHusk(1, 0, 0, 2.0, { maxHp: 300, maxPoise: 120 });
  huskManager.spawnHusk(2, 0, 0, 0.0, { maxHp: 300, maxPoise: 120 });

  controller.yaw = 0;
  controller.pitch = -0.02;

  const shot1 = weaponSystem.fireJackalCasullPrimary();
  assert.equal(shot1.fired, true);
  assert.equal(shot1.barrel, 'CASULL');
  assert.ok(huskManager.silverBrandTimer[0] > 3.0, 'Casull should apply Silver Brand to Husk 0');

  weaponSystem.primaryCooldown = 0;
  const shot2 = weaponSystem.fireJackalCasullPrimary();
  assert.equal(shot2.fired, true);
  assert.equal(shot2.barrel, 'JACKAL');
  assert.ok(shot2.targetsHit >= 2, `The Jackal should pierce multiple aligned husks, hit=${shot2.targetsHit}`);
  assert.equal(shot2.anyMercuryDetonation, true, 'The Jackal hitting a Silver-Branded target must trigger Mercury AoE Detonation');
  assert.ok(weaponSystem.hitstopTicksRemaining >= 2, 'Mercury Detonation / Headshot must trigger Micro-Hitstop frames');

  weaponSystem._handleReloadInput();
  assert.equal(weaponSystem.isReloading, true);
  weaponSystem.reloadTimer = weaponSystem.weapons[0].ammo.reloadDurationSec * 0.50;
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
// TEST 3: Differentiated Melee Geometry — Stake & Hammer (1.3m), Alucard Sword (2.5m + Parry), Occult Scythe (4.0m + Sweet-Spot)
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();
  controller.position.set(0, 0.02, 10.0);
  controller.yaw = 0; // Facing -Z

  // Part A: Stake & Hammer (1.3m reach, 55° cone, shattersArmor: true)
  weaponSystem.switchWeapon(WeaponSlot.STAKE_HAMMER, { force: true });
  // Spawn an Armored Iron Inquisitor at 1.1m (z = 8.9) and another Husk at 2.2m (z = 7.8, outside 1.3m reach!)
  huskManager.spawnHusk(0, 0, 0, 8.9, {
    maxHp: 300,
    maxPoise: 110,
    archetype: EnemyArchetype.IRON_INQUISITOR,
    hasArmorShield: true,
  });
  huskManager.spawnHusk(1, 0, 0, 7.8, { maxHp: 300, maxPoise: 110 });

  const stakeStrike = weaponSystem.performDifferentiatedMeleeStrike(WeaponSlot.STAKE_HAMMER);
  assert.equal(stakeStrike.targetsHit, 1, 'Stake & Hammer (1.3m reach) should hit target at 1.1m but NOT target at 2.2m');
  assert.equal(stakeStrike.armorShatters, 1, 'Stake & Hammer must shatter Iron Inquisitor frontal armor shield');
  assert.equal(huskManager.hasArmorShield[0], 0, 'Inquisitor armor shield flag must be cleared to 0');
  assert.equal(huskManager.state[0], HuskState.STAGGERED, 'Armor shatter + 135 poise damage must stagger the Inquisitor');

  // Part B: Alucard Sword (2.5m reach, 120° arc, RMB Projectile Parry at 400% DMG)
  weaponSystem.switchWeapon(WeaponSlot.ALUCARD_SWORD, { force: true });
  weaponSystem.primaryCooldown = 0;
  // Spawn an incoming enemy projectile 2.0m in front of player flying toward player
  huskManager.spawnEnemyProjectile(0, 1.4, 8.0, 0, 0, 22.0, 25, false);
  const parryRes = weaponSystem.performAlucardSwordParry();
  assert.equal(parryRes.parried, true);
  assert.equal(parryRes.deflectedCount, 1, 'Alucard Sword RMB Parry must deflect incoming frontal projectile');
  assert.equal(huskManager.projDeflected[0], 1, 'Projectile must be marked deflected');
  assert.equal(huskManager.projDamage[0], 100, 'Deflected projectile damage must scale by 400% (25 -> 100)');

  // Part C: Occult Scythe (4.0m reach, 160° arc, Sweet-Spot [65%-100%] 3.0x DMG + 3 Bleed vs Inner Shaft <65% 0.4x DMG + Knockback)
  weaponSystem.switchWeapon(WeaponSlot.OCCULT_SCYTHE, { force: true });
  weaponSystem.primaryCooldown = 0;
  // Clear previous husks
  huskManager.state[0] = HuskState.DEAD;
  huskManager.state[1] = HuskState.DEAD;

  // Spawn Husk 2 at 3.2m (z = 6.8 -> rho = 3.2 / 4.0 = 0.80 -> inside [0.65, 1.00] SWEET-SPOT TIP!)
  // Spawn Husk 3 at 1.4m (z = 8.6 -> rho = 1.4 / 4.0 = 0.35 -> inside <0.65 INNER SHAFT!)
  huskManager.spawnHusk(2, 0, 0, 6.8, { maxHp: 400, maxPoise: 150 });
  huskManager.spawnHusk(3, 0, 0, 8.6, { maxHp: 400, maxPoise: 150 });

  const scytheStrike = weaponSystem.performDifferentiatedMeleeStrike(WeaponSlot.OCCULT_SCYTHE);
  assert.equal(scytheStrike.sweetSpotHits, 1, 'Target at 3.2m (80% of 4.0m reach) must take a SWEET-SPOT TIP hit');
  assert.equal(scytheStrike.shaftGlancingHits, 1, 'Target at 1.4m (35% of 4.0m reach) must take an INNER SHAFT glancing hit');
  const tipDamageTaken = 400 - huskManager.hp[2];
  const shaftDamageTaken = 400 - huskManager.hp[3];
  assert.ok(
    tipDamageTaken >= 165,
    `Sweet-Spot Tip should deal >= 3.0x base damage (165+), dealt=${tipDamageTaken}`
  );
  assert.equal(
    shaftDamageTaken,
    22,
    `Inner Shaft should deal 0.4x glancing damage (55 * 0.4 = 22), dealt=${shaftDamageTaken}`
  );
  assert.ok(huskManager.bleedStacks[2] >= 3, 'Sweet-Spot Tip must inflict at least 3 Bleed stacks');
  assert.ok(
    huskManager.posZ[3] < 8.0,
    `Inner Shaft knockback must push close enemy outward toward the sweet-spot (z moved from 8.6 to ${huskManager.posZ[3].toFixed(2)})`
  );

  // Part D: Verify `melee_reach_multiplier` (+50% reach -> 4.0m becomes 6.0m)
  weaponSystem.meleeReachMultiplier = 1.5;
  huskManager.state[2] = HuskState.DEAD;
  huskManager.state[3] = HuskState.DEAD;
  // Spawn Husk 4 at 5.2m (z = 4.8 -> outside 4.0m base reach, but inside 6.0m scaled reach sweet-spot!)
  huskManager.spawnHusk(4, 0, 0, 4.8, { maxHp: 400, maxPoise: 150 });
  const scaledStrike = weaponSystem.performDifferentiatedMeleeStrike(WeaponSlot.OCCULT_SCYTHE);
  assert.equal(scaledStrike.effectiveReach, 6.0, 'melee_reach_multiplier=1.5 should scale Occult Scythe reach to 6.0m');
  assert.equal(scaledStrike.sweetSpotHits, 1, 'Target at 5.2m must be hit by the scaled Sweet-Spot Tip');

  console.log(
    `[PASS] Test 3: Differentiated Melee Geometry — Stake & Hammer (1.3m Armor Shatter), Alucard Sword (2.5m 400% Parry), Occult Scythe (4.0m Sweet-Spot ${tipDamageTaken} DMG vs Shaft ${shaftDamageTaken} DMG + Knockback, & 6.0m Scaled Reach)`
  );
}

// ---------------------------------------------------------------------------
// TEST 4: Single-Weapon Run Rule & Brotato-Style Character vs. Weapon Decoupling
// ---------------------------------------------------------------------------
{
  const { weaponSystem } = createCombatSandbox();

  // Verify shared weapon pool across decoupled characters
  assert.equal(
    isWeaponAllowedForCharacter(CharacterId.NOSFERATU_SOVEREIGN, WeaponId.ALUCARD_SWORD),
    true,
    'Alucard Sword should be selectable by Nosferatu Sovereign (leech class)'
  );
  assert.equal(
    isWeaponAllowedForCharacter(CharacterId.WRAITH_STRIDER, WeaponId.ALUCARD_SWORD),
    true,
    'Alucard Sword should ALSO be selectable by Wraith Strider (mobility class)'
  );
  assert.equal(
    isWeaponAllowedForCharacter(CharacterId.NOSFERATU_SOVEREIGN, WeaponId.STAKE_HAMMER),
    true,
    'Stake & Hammer should be selectable by Nosferatu Sovereign'
  );
  assert.equal(
    isWeaponAllowedForCharacter(CharacterId.WRAITH_STRIDER, WeaponId.STAKE_HAMMER),
    false,
    'Stake & Hammer should NOT be in Wraith Strider starting pool'
  );

  // Configure Single-Weapon Run as Wraith Strider (+20% Speed, +15% Melee Reach) with Occult Scythe
  const loadout = weaponSystem.configureSingleWeaponRun({
    characterId: CharacterId.WRAITH_STRIDER,
    weaponId: WeaponId.OCCULT_SCYTHE,
    lockSingleWeapon: true,
  });
  assert.equal(loadout.weaponId, WeaponId.OCCULT_SCYTHE);
  assert.equal(loadout.maxHp, 80, 'Wraith Strider (-20 HP offset) should have 80 Max HP');
  assert.equal(loadout.meleeReachMultiplier, 1.15, 'Wraith Strider should grant 1.15x base melee_reach_multiplier');

  // Attempt to switch weapons mid-run -> Must be blocked by Single-Weapon Run Rule!
  const swapAttempt = weaponSystem.switchWeapon(WeaponSlot.JACKAL_CASULL);
  assert.equal(swapAttempt, false, 'Single-Weapon Run Rule must block mid-run weapon switching');
  assert.equal(weaponSystem.currentSlot, WeaponSlot.OCCULT_SCYTHE);

  console.log(
    `[PASS] Test 4: Single-Weapon Run Lock & Brotato-Style Character Loadout (${loadout.characterId} + ${loadout.weaponId}, Reach=${loadout.meleeReachMultiplier}x)`
  );
}

// ---------------------------------------------------------------------------
// TEST 5: Context-Sensitive Quick Melee (`F` Key): Slide Blood-Kick Bowling & Vampiric Execution
// ---------------------------------------------------------------------------
{
  const { controller, huskManager, weaponSystem } = createCombatSandbox();

  huskManager.spawnHusk(0, 0, 0, 7.5, { maxHp: 180, maxPoise: 60 });
  huskManager.spawnHusk(1, 0, 0, 4.5, { maxHp: 100, maxPoise: 60 });

  controller.state = MovementState.SLIDE;
  controller.velocity.set(0, 0, -16.5);
  const kickRes = weaponSystem.executeQuickMelee();
  assert.equal(kickRes.type, 'SLIDE_BLOOD_KICK');
  assert.equal(huskManager.state[0], HuskState.BOWLING_BALL);

  for (let i = 0; i < 25; i++) {
    huskManager.step(DT, controller.position);
  }
  assert.ok(huskManager.totalBowlingStrikes >= 1);
  assert.equal(huskManager.state[1], HuskState.DEAD);

  huskManager.state[0] = HuskState.STAGGERED;
  huskManager.posX[0] = 0;
  huskManager.posZ[0] = 7.0;
  controller.position.set(0, 0.02, 10.0);
  controller.state = MovementState.RUN;
  weaponSystem.hp = 60;
  weaponSystem.blood = 40;
  weaponSystem.quickMeleeCooldown = 0;

  const execRes = weaponSystem.executeQuickMelee();
  assert.equal(execRes.type, 'VAMPIRIC_EXECUTION');
  assert.equal(weaponSystem.hp, 85);
  assert.equal(weaponSystem.blood, 70);
  assert.equal(huskManager.state[0], HuskState.DEAD);

  console.log(`[PASS] Test 5: Slide Blood-Kick Bowling Strike (${huskManager.totalBowlingStrikes} strike) & Vampiric Execution (+25 HP / +30 Blood)`);
}

// ---------------------------------------------------------------------------
// TEST 6: AudioManager Pitch Variation & Anti-Lag Batching / Interleaved Boids
// ---------------------------------------------------------------------------
{
  const { vfx, huskManager, controller } = createCombatSandbox();
  const audio = new AudioManager();
  for (let i = 0; i < 40; i++) {
    audio.playCasullShot();
    audio.playKatanaSlash(i % 3);
    audio.playFootstep();
  }
  const samples = audio.stats.pitchSamples;
  const minPitch = Math.min(...samples);
  const maxPitch = Math.max(...samples);
  assert.ok(minPitch >= 0.93 && maxPitch <= 1.07);

  const targetPos = new Vec3(0, 1.5, 5);
  for (let hit = 0; hit < 10; hit++) {
    vfx.recordDamageNumber(7, targetPos, 15, { isBleed: true });
    vfx.update(0.02);
  }
  assert.equal(vfx.getActiveDamageLabelCount(), 1);
  const activeLbl = vfx.damageLabels.find((l) => l.active && l.targetId === 7);
  assert.equal(activeLbl.accumulatedDamage, 150);

  for (let i = 0; i < MAX_HUSKS; i++) {
    huskManager.spawnHusk(i, (i % 8) * 1.1, 0, Math.floor(i / 8) * 1.1);
  }
  huskManager.step(DT, controller.position);
  assert.equal(huskManager.interleavedBoidQueriesLastTick, MAX_HUSKS / 4);

  console.log(`[PASS] Test 6: Audio Pitch Variation (${minPitch.toFixed(3)}x..${maxPitch.toFixed(3)}x), Damage Batching (150 DMG [x10]), & Interleaved Boids (${huskManager.interleavedBoidQueriesLastTick}/${MAX_HUSKS})`);
}

console.log('\n===================================================================');
console.log(' ALL PHASE 2 COMBAT, MELEE GEOMETRY & LOADOUT SUITES PASSED!');
console.log('===================================================================');
