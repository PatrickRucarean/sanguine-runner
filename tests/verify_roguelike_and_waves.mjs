/**
 * SANGUINE_RUNNER — Phase 3, 4 & 5 Automated Verification Suite
 * Verifies:
 *  1. WaveDirector & Danger 0-5 Corruption Modifiers (Budget, Surges, Thirst Decay, Sanguine Harvest)
 *  2. BloodOrbManager (2,048 SoA Pool, Spatial-Hash Auto-Merge Coalescence, 65 m/s Harvest Vacuum)
 *  3. ScalingEngine (4-Category Math, 60Hz Fire-Rate Overflow, Multi-Tier Crit Overflow, melee_reach_multiplier)
 *  4. AltarDraftEngine (Per-Card Targeted Rerolls, Slot Lock Guard, Blood Dice, Exponential Blood Tithe 50*2^k, Pity p>=6/p>=10, Single-Weapon Filtering)
 *  5. FamiliarSystem (Autonomous Shadow Bats, Spectral Skulls, & Blood Wolves)
 */

import assert from 'node:assert/strict';
import { Vec3 } from '../src/physics/Vec3.js';
import { MovementConfig } from '../src/physics/MovementConfig.js';
import { CollisionWorld } from '../src/physics/CollisionWorld.js';
import { KinematicController } from '../src/physics/KinematicController.js';
import { buildGreyboxCollisionWorld, getModularArenaById } from '../src/world/ArenaGeometryData.js';
import { TargetHuskManager, HuskState } from '../src/combat/TargetHuskManager.js';
import { WeaponSystem } from '../src/combat/WeaponSystem.js';
import { CharacterId, WeaponId } from '../src/combat/CharacterCatalog.js';
import { WaveDirector } from '../src/ai/WaveDirector.js';
import { FamiliarSystem } from '../src/ai/FamiliarSystem.js';
import { ScalingEngine } from '../src/progression/ScalingEngine.js';
import { BloodOrbManager, OrbTier } from '../src/progression/BloodOrbManager.js';
import {
  PerkCatalog,
  PerkRarity,
   WEAPON_TAGS,
  filterPerkCatalogForSingleWeapon,
} from '../src/progression/PerkCatalog.js';
import { AltarDraftEngine, SlotStatus } from '../src/progression/AltarDraftEngine.js';
import { PostProcessingPass } from '../src/rendering/PostProcessingPass.js';

const DT = MovementConfig.DT;

console.log('===================================================================');
console.log(' SANGUINE_RUNNER // PHASE 3, 4 & 5 ROGUELIKE & WAVE VERIFICATION');
console.log('===================================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: WaveDirector, Danger 0-5 Corruption Modifiers, & Modular Arenas
// ---------------------------------------------------------------------------
{
  const world = new CollisionWorld();
  buildGreyboxCollisionWorld(world);
  const controller = new KinematicController(world, new Vec3(0, 0.02, 10));
  const husks = new TargetHuskManager();
  const scaling = new ScalingEngine();
  const weaponSystem = new WeaponSystem({ controller, huskManager: husks, scaling });
  const bloodOrbs = new BloodOrbManager();

  let completedWaveNum = 0;
  const director = new WaveDirector({
    huskManager: husks,
    controller,
    weaponSystem,
    bloodOrbManager: bloodOrbs,
    onWaveComplete: (w) => {
      completedWaveNum = w;
    },
  });

  // Check Wave Duration & Budget math on Danger 0 vs Danger 5
  assert.equal(director.computeWaveDuration(1), 25);
  assert.equal(director.computeWaveDuration(10), 70);
  assert.equal(director.computeWaveDuration(15), 90);

  const d0BudgetW1 = director.computeWaveBudget(1);
  director.setDangerTier(5);
  const d5BudgetW1 = director.computeWaveBudget(1);
  assert.ok(d5BudgetW1 > d0BudgetW1 * 1.7, `Danger 5 budget (${d5BudgetW1}) should scale by 1.85x over Danger 0 (${d0BudgetW1})`);

  // Verify Danger 3+ Thirst Decay (standing on ground below 8.0 m/s for >2.5s drains 2 HP/s)
  director.setDangerTier(3);
  director.startWave(1);
  assert.ok(husks.getActiveCount() > 0, 'startWave(1) should seed initial enemy pack');

  controller.grounded = true;
  controller.velocity.set(0, 0, 0); // 0 m/s (< 8.0 m/s threshold)
  const hpBefore = weaponSystem.hp;
  for (let i = 0; i < 120 * 4; i++) {
    director.step(DT); // 4.0 seconds of standing still on Danger 3
  }
  assert.ok(
    weaponSystem.hp < hpBefore,
    `Danger 3 Thirst Decay must drain HP when grounded below 8.0 m/s for >2.5s (${hpBefore} -> ${weaponSystem.hp})`
  );

  // Trigger End-of-Wave Sanguine Harvest
  director.completeCurrentWave();
  assert.equal(completedWaveNum, 1, 'completeCurrentWave should fire onWaveComplete(1)');
  assert.equal(bloodOrbs.sanguineHarvestActive, true, 'End of wave must activate 65 m/s Sanguine Harvest vacuum');

  // Verify Modular Arena lookup & PostProcessingPass math
  const arena = getModularArenaById('SANGUINE_AQUEDUCTS');
  assert.equal(arena.id, 'SANGUINE_AQUEDUCTS');
  const postFx = new PostProcessingPass();
  const qVal = postFx.quantizeChannelWithBayer(0.52, 2, 1);
  assert.ok(qVal >= 0 && qVal <= 1);
  const ca = postFx.computeChromaticAberration(20, 100, true);
  assert.ok(ca.chromaticAberrationIntensity > 0.005);

  console.log(
    `[PASS] Test 1: WaveDirector, Danger 0-5 Multipliers (D0=${d0BudgetW1} vs D5=${d5BudgetW1}), Danger 3 Thirst Decay, & Sanguine Harvest`
  );
}

// ---------------------------------------------------------------------------
// TEST 2: BloodOrbManager (2,048 Pool, Spatial-Hash Auto-Merge Coalescence, & Vacuum)
// ---------------------------------------------------------------------------
{
  const bloodOrbs = new BloodOrbManager();
  bloodOrbs.currentVitae = 0;

  // Spawn 1,300 orbs clustered in a few spatial grid cells -> Exceeds COALESCE_THRESHOLD (1,200)!
  let totalVitaeSpawned = 0;
  for (let i = 0; i < 1300; i++) {
    const clusterX = (i % 5) * 3.0 + (i % 3) * 0.2;
    const clusterZ = Math.floor((i % 25) / 5) * 3.0 + (i % 2) * 0.2;
    bloodOrbs.spawnOrb(clusterX, 0.5, clusterZ, 2);
    totalVitaeSpawned += 2;
  }

  assert.ok(
    bloodOrbs.totalCoalesceMerges > 100,
    `Spawning 1,300 clustered orbs must trigger Spatial-Hash Auto-Merge Coalescence, merges=${bloodOrbs.totalCoalesceMerges}`
  );
  assert.ok(
    bloodOrbs.activeCount < 200,
    `Active orb count after coalescence must stay well below budget, active=${bloodOrbs.activeCount}`
  );

  // Verify Sanguine Harvest pulls all merged orbs into player and conserves 100% of Vitae!
  bloodOrbs.triggerSanguineHarvest();
  const playerPos = new Vec3(0, 0, 0);
  for (let tick = 0; tick < 60; tick++) {
    bloodOrbs.step(DT, playerPos, 4.5);
  }
  assert.equal(bloodOrbs.activeCount, 0, 'All orbs must be vacuumed and collected during Sanguine Harvest');
  assert.equal(
    bloodOrbs.currentVitae,
    totalVitaeSpawned,
    `Coalescence must conserve 100% of Vitae value (${bloodOrbs.currentVitae} === ${totalVitaeSpawned})`
  );

  console.log(
    `[PASS] Test 2: BloodOrbManager Auto-Merge Coalescence (${bloodOrbs.totalCoalesceMerges} merges) & 100% Vitae Conservation (${bloodOrbs.currentVitae} Vitae)`
  );
}

// ---------------------------------------------------------------------------
// TEST 3: ScalingEngine — 60Hz Fire-Rate Overflow, Multi-Tier Crits, & melee_reach_multiplier
// ---------------------------------------------------------------------------
{
  const scaling = new ScalingEngine();

  // 1. Test `melee_reach_multiplier` aggregation
  const telescPerk = PerkCatalog.find((p) => p.id === 'telescopic_crimson_haft'); // +20% reach
  scaling.applyPerk(telescPerk);
  scaling.applyPerk(telescPerk);
  assert.ok(
    Math.abs(scaling.getMeleeReachMultiplier() - 1.4) < 1e-6,
    '2 stacks of +20% reach should yield 1.40x melee_reach_multiplier'
  );

  // 2. Test 60 shots/sec (16.66ms) Fire-Rate Safety Valve converting overflow into Multi-Shot!
  scaling.stats.fireRatePct = 20.0; // 21x fire rate on a 0.20s base interval -> raw = 9.5ms (< 16.66ms!)
  const safety = scaling.computeIntervalAndOverflowMultishot(0.2);
  assert.ok(
    Math.abs(safety.effectiveIntervalSec - 2.0 / 120.0) < 1e-6,
    'Interval must clamp at 2 physics ticks (16.66ms)'
  );
  assert.ok(
    safety.overflowMultishotMultiplier > 1.7,
    `Excess fire rate must convert into Bonus Multi-Shot Multiplier (${safety.overflowMultishotMultiplier.toFixed(2)}x)`
  );

  // 3. Test Multi-Tier Crit Overflow (Tier 1 = 2.0x, Tier 2 = 3.5x, Tier 3 = 6.5x Obliteration)
  scaling.stats.critChancePct = 2.1; // +210% crit + 20% base = 230% -> Guaranteed Tier 2, 30% chance Tier 3!
  const critT2 = scaling.evaluateCritTier(0.2, () => 0.9); // roll > 0.30 -> Tier 2
  assert.equal(critT2.tier, 2);
  assert.equal(critT2.name, 'SANGUINE_SUPER_CRIT');
  assert.equal(critT2.damageMultiplier, 3.5);

  const critT3 = scaling.evaluateCritTier(0.2, () => 0.1); // roll < 0.30 -> Tier 3!
  assert.equal(critT3.tier, 3);
  assert.equal(critT3.name, 'HELLSING_OBLITERATION_CRIT');
  assert.equal(critT3.triggersBloodNova, true);

  console.log(
    `[PASS] Test 3: ScalingEngine — melee_reach_multiplier (1.40x), 60Hz Multishot Safety Valve (${safety.overflowMultishotMultiplier.toFixed(2)}x), & Tier 3 Obliteration Crits`
  );
}

// ---------------------------------------------------------------------------
// TEST 4: AltarDraftEngine — Per-Card Targeted Rerolls, Slot Lock, Blood Tithe (50*2^k), Pity & Single-Weapon Filter
// ---------------------------------------------------------------------------
{
  const scaling = new ScalingEngine();
  const bloodOrbs = new BloodOrbManager();
  bloodOrbs.currentVitae = 1000;

  const altar = new AltarDraftEngine({ scaling, bloodOrbs });

  // Part A: Verify Single-Weapon Deck Filtering (equipping OCCULT_SCYTHE excludes Pistol/Shotgun/Sword/Stake perks!)
  altar.setSingleWeaponFilter(WeaponId.OCCULT_SCYTHE);
  const filtered = filterPerkCatalogForSingleWeapon(WeaponId.OCCULT_SCYTHE);
  for (const p of filtered) {
    const wTags = p.tags.filter((t) => WEAPON_TAGS.has(t));
    if (wTags.length > 0) {
      assert.ok(
        wTags.includes(WeaponId.OCCULT_SCYTHE),
        `Filtered pool for OCCULT_SCYTHE must never contain ${p.id} (${wTags.join(',')})`
      );
    }
  }

  // Part B: Open Altar at Wave 1 -> Starts with 2 + 2 = 4 Blood Dice
  altar.bloodDiceCurrent = 0;
  altar.openAltarForWave(1, { grantWaveDice: true });
  assert.equal(altar.bloodDiceCurrent, 2, 'Wave completion must grant +2 Free Blood Dice');
  assert.equal(altar.slots.length, 3, 'Altar must deal 3 card slots');

  const slot0InitialId = altar.slots[0].perk.id;
  const slot2InitialId = altar.slots[2].perk.id;

  // Part C: Lock Slot 0 (`LOCKED_PINNED`) and verify it cannot be accidentally rerolled!
  altar.toggleLockSlot(0);
  assert.equal(altar.slots[0].status, SlotStatus.LOCKED_PINNED);
  const lockedTry = altar.rerollSlot(0);
  assert.equal(lockedTry.rerolled, false);
  assert.equal(lockedTry.reason, 'SLOT_LOCKED');

  // Part D: Surgical Per-Slot Reroll on Slot 1 ONLY -> Slot 0 and Slot 2 must remain 100% untouched!
  const r1 = altar.rerollSlot(1);
  assert.equal(r1.rerolled, true);
  assert.equal(r1.paymentType, 'FREE_BLOOD_DIE');
  assert.equal(altar.bloodDiceCurrent, 1);
  assert.equal(altar.slots[0].perk.id, slot0InitialId, 'Slot 0 must remain held on the bench when Slot 1 is rerolled');
  assert.equal(altar.slots[2].perk.id, slot2InitialId, 'Slot 2 must remain held on the bench when Slot 1 is rerolled');
  assert.notEqual(altar.slots[1].perk.id, r1.previousPerkId, 'Rerolled slot must not immediately deal its own discarded perk');

  // Spend second free Blood Die on Slot 2
  const r2 = altar.rerollSlot(2);
  assert.equal(r2.paymentType, 'FREE_BLOOD_DIE');
  assert.equal(altar.bloodDiceCurrent, 0);

  // Part E: Blood Tithe Paid Rerolls (Exponential cost: 50 -> 100 -> 200 Vitae)
  assert.equal(altar.getNextBloodTitheCost(), 50);
  const paid1 = altar.rerollSlot(1);
  assert.equal(paid1.rerolled, true);
  assert.equal(paid1.paymentType, 'BLOOD_TITHE');
  assert.equal(paid1.vitaeSpent, 50);
  assert.equal(altar.getNextBloodTitheCost(), 100);

  const paid2 = altar.rerollSlot(1);
  assert.equal(paid2.vitaeSpent, 100);
  assert.equal(altar.getNextBloodTitheCost(), 200);

  // Part F: Bad Luck Protection Pity System (p >= 6 purges COMMON; p >= 10 guarantees EPIC/ELDRITCH)
  altar.pityCounter = 6;
  const weightsAt6 = altar.computeRarityWeights(1, 6);
  assert.equal(weightsAt6[PerkRarity.COMMON], 0, 'At pity >= 6, COMMON weight must be 0%');

  altar.pityCounter = 10;
  const weightsAt10 = altar.computeRarityWeights(1, 10);
  assert.equal(weightsAt10[PerkRarity.COMMON], 0);
  assert.equal(weightsAt10[PerkRarity.RARE], 0);
  assert.equal(weightsAt10[PerkRarity.EPIC], 75);
  assert.equal(weightsAt10[PerkRarity.ELDRITCH], 25);

  // Part G: Pity Reset Rule — Drafting COMMON/RARE preserves pityCounter; Drafting EPIC/ELDRITCH resets to 0!
  altar.slots[1].perk = PerkCatalog.find((p) => p.rarity === PerkRarity.RARE);
  const pickRare = altar.selectSlot(1);
  assert.equal(pickRare.pityReset, false, 'Drafting a RARE card must NOT reset pityCounter');
  assert.equal(altar.pityCounter, 10, 'pityCounter must persist into the next wave');

  altar.openAltarForWave(2, { grantWaveDice: true });
  altar.slots[0].perk = PerkCatalog.find((p) => p.rarity === PerkRarity.ELDRITCH);
  const pickEldritch = altar.selectSlot(0);
  assert.equal(pickEldritch.pityReset, true, 'Drafting an ELDRITCH card must reset pityCounter to 0');
  assert.equal(altar.pityCounter, 0);

  console.log(
    `[PASS] Test 4: AltarDraftEngine — Surgical Per-Card Reroll, Lock Guard, Exponential Blood Tithe (50->100->200), Pity Guarantees (p=6/p=10), & Single-Weapon Filter`
  );
}

// ---------------------------------------------------------------------------
// TEST 5: Phase 5 Autonomous Familiars (Shadow Bats, Spectral Skulls, Blood Wolves)
// ---------------------------------------------------------------------------
{
  const husks = new TargetHuskManager();
  const scaling = new ScalingEngine();
  const bloodOrbs = new BloodOrbManager();
  const familiars = new FamiliarSystem({ huskManager: husks, scaling, bloodOrbs });

  // Draft all 3 Familiar perks
  scaling.applyPerk(PerkCatalog.find((p) => p.id === 'nocturne_shadow_bats'));
  scaling.applyPerk(PerkCatalog.find((p) => p.id === 'baskerville_spectral_skulls'));
  scaling.applyPerk(PerkCatalog.find((p) => p.id === 'hounds_of_baskerville'));

  // Spawn an elite high-poise target near the player
  husks.spawnHusk(0, 0, 0, 4.0, { maxHp: 500, maxPoise: 150 });
  const playerPos = new Vec3(0, 0, 0);

  for (let i = 0; i < 120; i++) {
    familiars.step(DT, playerPos);
  }

  assert.ok(familiars.totalBatStrikes >= 1, 'Shadow Bats must autonomously dive and bleed nearby enemies');
  assert.ok(familiars.totalSkullBeams >= 1, 'Spectral Skulls must autonomously fire Occult Eye-Beams');
  assert.ok(familiars.totalWolfBites >= 1, 'Blood Wolves must autonomously bite high-poise targets');
  assert.ok(husks.hp[0] < 500, 'Familiars must deal autonomous damage without player hotkeys');

  console.log(
    `[PASS] Test 5: Autonomous Familiars Verified (Bats=${familiars.totalBatStrikes} dives, Skulls=${familiars.totalSkullBeams} beams, Wolves=${familiars.totalWolfBites} bites)`
  );
}

console.log('\n===================================================================');
console.log(' ALL 5 PHASE 3, 4 & 5 ROGUELIKE, WAVE & FAMILIAR SUITES PASSED!');
console.log('===================================================================');
