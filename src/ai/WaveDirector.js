/**
 * SANGUINE_RUNNER — Phase 3: Wave Director, Threat Budget Algorithm, & Danger 0-5 Corruption Modifiers
 * Implements Sections 4.1, 4.2, 4.3, 4.4, 4.5, and 4.6 of GAME_PLAN.md.
 */

import { Vec3 } from '../physics/Vec3.js';
import {
  EnemyArchetype,
  ArchetypeStats,
  HuskState,
  MAX_HUSKS,
} from '../combat/TargetHuskManager.js';

export const DangerConfigs = Object.freeze([
  {
    tier: 0,
    title: 'Initiate of Dusk',
    enemyHpMultiplier: 1.0,
    enemyDamageMultiplier: 1.0,
    spawnBudgetMultiplier: 1.0,
    eliteSpawnChancePct: 0.0,
    vitaeRewardMultiplier: 1.0,
    surgePeriodSec: 12.0,
    thirstDecayEnabled: false,
    earlyUnlockOffset: 0,
    corruptionRules: ['Baseline Sanguine Runner pacing & standard wave compositions.'],
  },
  {
    tier: 1,
    title: 'Blood Moon Rising',
    enemyHpMultiplier: 1.15,
    enemyDamageMultiplier: 1.15,
    spawnBudgetMultiplier: 1.15,
    eliteSpawnChancePct: 0.05,
    vitaeRewardMultiplier: 1.1,
    surgePeriodSec: 12.0,
    thirstDecayEnabled: false,
    earlyUnlockOffset: 1,
    corruptionRules: [
      'Crimson Elites appear (2.2x HP, +20% speed, 3x Vitae).',
      'Nightstalkers & Hemomancers unlock 1 wave earlier.',
    ],
  },
  {
    tier: 2,
    title: 'Inquisition Crusade',
    enemyHpMultiplier: 1.3,
    enemyDamageMultiplier: 1.3,
    spawnBudgetMultiplier: 1.3,
    eliteSpawnChancePct: 0.1,
    vitaeRewardMultiplier: 1.2,
    surgePeriodSec: 12.0,
    thirstDecayEnabled: false,
    earlyUnlockOffset: 1,
    corruptionRules: [
      'Iron Inquisitors spawn with fortified shields (+50% Poise).',
      'Wave 5 and Wave 15 spawn a Mini-Boss Cathedral Executioner.',
    ],
  },
  {
    tier: 3,
    title: 'Sanguine Famine',
    enemyHpMultiplier: 1.5,
    enemyDamageMultiplier: 1.45,
    spawnBudgetMultiplier: 1.45,
    eliteSpawnChancePct: 0.16,
    vitaeRewardMultiplier: 1.3,
    surgePeriodSec: 12.0,
    thirstDecayEnabled: true,
    earlyUnlockOffset: 1,
    corruptionRules: [
      'Thirst Decay: Moving below 8.0 m/s on the ground for >2.5s drains 2 HP/s.',
    ],
  },
  {
    tier: 4,
    title: 'Abyssal Eclipse',
    enemyHpMultiplier: 1.75,
    enemyDamageMultiplier: 1.65,
    spawnBudgetMultiplier: 1.65,
    eliteSpawnChancePct: 0.22,
    vitaeRewardMultiplier: 1.4,
    surgePeriodSec: 9.0,
    thirstDecayEnabled: true,
    earlyUnlockOffset: 2,
    corruptionRules: [
      'Blood Moon Surges occur every 9s instead of 12s.',
      'Slain Crimson Elites rupture into radial Hellfire bolts.',
    ],
  },
  {
    tier: 5,
    title: "Alucard's Nightmare",
    enemyHpMultiplier: 2.1,
    enemyDamageMultiplier: 1.9,
    spawnBudgetMultiplier: 1.85,
    eliteSpawnChancePct: 0.3,
    vitaeRewardMultiplier: 1.5,
    surgePeriodSec: 9.0,
    thirstDecayEnabled: true,
    earlyUnlockOffset: 2,
    corruptionRules: [
      'Wave 10 & Wave 20 spawn twin Arch-Inquisitor Lords.',
      'All enemies gain +15% speed during Blood Moon Surges; +50% Vitae yield.',
    ],
  },
]);

export function getDangerConfig(tier = 0) {
  const clamped = Math.max(0, Math.min(5, Math.floor(tier)));
  return DangerConfigs[clamped];
}

export class WaveDirector {
  /**
   * @param {Object} opts
   * @param {import('../combat/TargetHuskManager.js').TargetHuskManager} opts.huskManager
   * @param {import('../physics/KinematicController.js').KinematicController} opts.controller
   * @param {import('../combat/WeaponSystem.js').WeaponSystem} [opts.weaponSystem]
   * @param {import('../progression/BloodOrbManager.js').BloodOrbManager} [opts.bloodOrbManager]
   * @param {Function} [opts.onWaveComplete] Callback `(waveNumber) => void`
   */
  constructor({
    huskManager,
    controller,
    weaponSystem = null,
    bloodOrbManager = null,
    onWaveComplete = null,
  }) {
    this.husks = huskManager;
    this.controller = controller;
    this.weaponSystem = weaponSystem;
    this.bloodOrbs = bloodOrbManager;
    this.onWaveComplete = onWaveComplete;

    this.dangerTier = 0;
    this.dangerConfig = getDangerConfig(0);

    this.currentWave = 1;
    this.waveDurationSec = 25.0;
    this.waveElapsedSec = 0.0;
    this.isWaveActive = false;
    this.isPausedForAltar = false;

    this.totalWaveBudget = 52;
    this.availableCredits = 0.0;
    this.maxSimultaneousAliveCap = 21;
    this.spawnCheckAccum = 0.0;
    this.isBloodMoonSurge = false;
    this.reinforcementRiftsTriggered = 0;

    // Danger 3+ Thirst Decay state
    this.lowSpeedGroundTimer = 0.0;
    this.thirstDamageAccum = 0.0;

    // Pre-computed tactical spawn nodes around the Cathedral Arena
    this.spawnNodes = [
      new Vec3(-16, 0, -4),
      new Vec3(16, 0, -4),
      new Vec3(-18, 0, -16),
      new Vec3(18, 0, -16),
      new Vec3(0, 0, -22),
      new Vec3(-12, 0, 8),
      new Vec3(12, 0, 8),
      new Vec3(-22, 0, 2),
      new Vec3(22, 0, 2),
      new Vec3(-8, 0, -25),
      new Vec3(8, 0, -25),
      new Vec3(0, 0, 48),
      new Vec3(-4, 0, 58),
      new Vec3(4, 0, 58),
    ];
  }

  setDangerTier(tier) {
    this.dangerTier = Math.max(0, Math.min(5, Math.floor(tier)));
    this.dangerConfig = getDangerConfig(this.dangerTier);
    return this.dangerConfig;
  }

  /**
   * Wave Duration Formula: T_wave(w) = min(90, 20 + 5w) seconds
   */
  computeWaveDuration(wave = this.currentWave) {
    return Math.min(90.0, 20.0 + 5.0 * wave);
  }

  /**
   * Mathematical Budget Curve: B_total(w) = floor((35 * w^1.38 + 15 * 1.18^w) * M_budget(d))
   */
  computeWaveBudget(wave = this.currentWave) {
    const raw = 35.0 * Math.pow(wave, 1.38) + 15.0 * Math.pow(1.18, wave);
    return Math.floor(raw * this.dangerConfig.spawnBudgetMultiplier);
  }

  /**
   * Enemy HP Scaling Formula:
   * HP(w, d) = HP_base * M_HP(d) * (1 + 0.14(w-1) + 0.018(w-1)^2) * 1.12^max(0, w-15)
   */
  computeScaledEnemyHp(baseHp, wave = this.currentWave) {
    const w1 = Math.max(0, wave - 1);
    const poly = 1.0 + 0.14 * w1 + 0.018 * w1 * w1;
    const endless = Math.pow(1.12, Math.max(0, wave - 15));
    return Math.round(baseHp * this.dangerConfig.enemyHpMultiplier * poly * endless);
  }

  /**
   * Enemy Damage Multiplier Formula:
   * DMG_mult(w, d) = M_DMG(d) * (1 + 0.08(w - 1))
   */
  computeScaledEnemyDamageMult(wave = this.currentWave) {
    return this.dangerConfig.enemyDamageMultiplier * (1.0 + 0.08 * Math.max(0, wave - 1));
  }

  /**
   * Starts Wave `waveNumber` with initial seed spawns and resets wave timers.
   */
  startWave(waveNumber = 1) {
    this.currentWave = Math.max(1, waveNumber);
    this.waveDurationSec = this.computeWaveDuration(this.currentWave);
    this.waveElapsedSec = 0.0;
    this.isWaveActive = true;
    this.isPausedForAltar = false;
    this.husks.autoRespawn = false;

    this.totalWaveBudget = this.computeWaveBudget(this.currentWave);
    this.maxSimultaneousAliveCap = Math.min(MAX_HUSKS, Math.min(180, 14 + 7 * this.currentWave));

    // Seed initial 30% of budget immediately at wave start
    this.availableCredits = this.totalWaveBudget * 0.32;
    this._spendCreditsOnSpawns();

    // Danger 2+ Mini-Boss on Wave 5 & 15; Boss Wave on Wave 10 & 20
    if (this.currentWave % 10 === 0) {
      const bossCount = this.dangerTier >= 5 ? 2 : 1;
      for (let b = 0; b < bossCount; b++) {
        this._spawnArchetypeUnit(EnemyArchetype.CATHEDRAL_EXECUTIONER, true);
      }
    } else if (this.dangerTier >= 2 && (this.currentWave === 5 || this.currentWave === 15)) {
      this._spawnArchetypeUnit(EnemyArchetype.CATHEDRAL_EXECUTIONER, false);
    }

    return {
      wave: this.currentWave,
      durationSec: this.waveDurationSec,
      budget: this.totalWaveBudget,
      dangerTier: this.dangerTier,
    };
  }

  /**
   * Steps the Wave Director at 120Hz.
   */
  step(dt) {
    if (!this.isWaveActive || this.isPausedForAltar) return;

    this.waveElapsedSec += dt;

    // 1. Check Danger 3+ Thirst Decay (standing on ground below 8.0 m/s for >2.5s drains 2 HP/s)
    if (this.dangerConfig.thirstDecayEnabled && this.controller && this.weaponSystem) {
      const hSpd = this.controller.getHorizontalSpeed();
      if (this.controller.grounded && hSpd < 8.0) {
        this.lowSpeedGroundTimer += dt;
        if (this.lowSpeedGroundTimer > 2.5) {
          this.thirstDamageAccum += 2.0 * dt;
          if (this.thirstDamageAccum >= 1.0) {
            const drain = Math.floor(this.thirstDamageAccum);
            this.thirstDamageAccum -= drain;
            this.weaponSystem.hp = Math.max(1, this.weaponSystem.hp - drain);
          }
        }
      } else {
        this.lowSpeedGroundTimer = 0.0;
        this.thirstDamageAccum = 0.0;
      }
    }

    // 2. Check End-of-Wave Sanguine Harvest
    if (this.waveElapsedSec >= this.waveDurationSec) {
      this.completeCurrentWave();
      return;
    }

    // 3. Compute Continuous Trickle & Blood Moon Surge Credit Income
    const period = this.dangerConfig.surgePeriodSec;
    const phase = Math.sin((2.0 * Math.PI * this.waveElapsedSec) / period);
    this.isBloodMoonSurge = phase > 0.65;

    let creditRate =
      (this.totalWaveBudget / this.waveDurationSec) * (0.85 + 0.30 * phase);
    if (this.isBloodMoonSurge) {
      creditRate *= 1.45;
    }

    // 4. Kill-Speed Dynamic Accelerator: if active count < 30% of cap, boost credit rate by +75%!
    const activeCount = this.husks.getActiveCount();
    if (activeCount < this.maxSimultaneousAliveCap * 0.3) {
      creditRate *= 1.75;
    }

    this.availableCredits += creditRate * dt;
    this.spawnCheckAccum += dt;

    if (this.spawnCheckAccum >= 0.45) {
      this.spawnCheckAccum = 0.0;
      if (activeCount < this.maxSimultaneousAliveCap * 0.3 && this.availableCredits >= 12) {
        this.reinforcementRiftsTriggered++;
      }
      this._spendCreditsOnSpawns();
    }
  }

  /**
   * Scores spawn nodes using Section 4.2 Gaussian distance + FOV dot product formula:
   * S(p) = exp(-((d - 22)^2)/(2 * 10^2)) - 0.6 * max(0, f_player . d_node)
   */
  selectBestSpawnNode() {
    if (!this.controller || this.spawnNodes.length === 0) {
      return new Vec3(0, 0, -12);
    }
    const pPos = this.controller.position;
    const fwd = this.controller.getForwardXZ();

    let bestNode = this.spawnNodes[0];
    let bestScore = -999;

    for (let i = 0; i < this.spawnNodes.length; i++) {
      const node = this.spawnNodes[i];
      const dx = node.x - pPos.x;
      const dz = node.z - pPos.z;
      const dist = Math.hypot(dx, dz) || 1.0;
      const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;

      const distTerm = Math.exp(-Math.pow(dist - 22.0, 2) / (2.0 * 100.0));
      const fovPenalty = 0.55 * Math.max(0, dot);
      const jitter = (Math.random() - 0.5) * 0.25;
      const score = distTerm - fovPenalty + jitter;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
    return bestNode;
  }

  _getEligibleArchetypes() {
    const effectiveWave = this.currentWave + this.dangerConfig.earlyUnlockOffset;
    const list = [EnemyArchetype.THRALL_HUSK];
    if (effectiveWave >= 2) list.push(EnemyArchetype.FERAL_NIGHTSTALKER);
    if (effectiveWave >= 3) list.push(EnemyArchetype.HEMOMANCER_ACOLYTE);
    if (effectiveWave >= 5) list.push(EnemyArchetype.CENSER_ZEALOT);
    if (effectiveWave >= 6) list.push(EnemyArchetype.IRON_INQUISITOR);
    if (effectiveWave >= 8) list.push(EnemyArchetype.CATHEDRAL_EXECUTIONER);
    return list;
  }

  _spendCreditsOnSpawns() {
    const eligible = this._getEligibleArchetypes();
    let safety = 0;

    while (
      this.availableCredits >= 3 &&
      this.husks.getActiveCount() < this.maxSimultaneousAliveCap &&
      safety < 12
    ) {
      safety++;
      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      const cfg = ArchetypeStats[pick];
      if (this.availableCredits < cfg.cost) {
        if (this.availableCredits >= 3) {
          this._spawnArchetypeUnit(EnemyArchetype.THRALL_HUSK);
          this.availableCredits -= 3;
        }
        break;
      }
      this._spawnArchetypeUnit(pick);
      this.availableCredits -= cfg.cost;
    }
  }

  _spawnArchetypeUnit(archetype, forceElite = false) {
    const slot = this.husks.findFreeSlot();
    if (slot < 0) return -1;

    const cfg = ArchetypeStats[archetype] || ArchetypeStats[EnemyArchetype.THRALL_HUSK];
    const node = this.selectBestSpawnNode();
    const offsetAngle = Math.random() * Math.PI * 2;
    const offsetR = 1.0 + Math.random() * 2.5;
    const sx = node.x + Math.cos(offsetAngle) * offsetR;
    const sz = node.z + Math.sin(offsetAngle) * offsetR;

    const isElite = forceElite || Math.random() < this.dangerConfig.eliteSpawnChancePct;
    const scaledHp =
      this.computeScaledEnemyHp(cfg.baseHp, this.currentWave) * (isElite ? 2.2 : 1.0);
    const scaledPoise =
      cfg.poise *
      (isElite ? 1.5 : 1.0) *
      (this.dangerTier >= 2 && cfg.hasArmor ? 1.5 : 1.0);
    const scaledSpeed =
      cfg.speed *
      (isElite ? 1.2 : 1.0) *
      (this.dangerTier >= 5 && this.isBloodMoonSurge ? 1.15 : 1.0);

    return this.husks.spawnHusk(slot, sx, node.y, sz, {
      maxHp: scaledHp,
      maxPoise: scaledPoise,
      moveSpeed: scaledSpeed,
      archetype,
      isElite,
      hasArmorShield: cfg.hasArmor,
      damageMult: this.computeScaledEnemyDamageMult(this.currentWave),
    });
  }

  /**
   * Triggers End-of-Wave Sanguine Harvest:
   *  - Ruptures all lesser enemies in a crimson mist
   *  - Pulls all active Blood Orbs into the player at 65 m/s
   *  - Invokes `onWaveComplete(currentWave)` to open the Blood Altar Draft UI
   */
  completeCurrentWave() {
    this.isWaveActive = false;
    this.isPausedForAltar = true;

    // Rupture remaining enemies in synchronized blood mist
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] !== HuskState.DEAD) {
        this.husks.state[i] = HuskState.DEAD;
        if (this.bloodOrbs) {
          this.bloodOrbs.spawnOrb(this.husks.posX[i], this.husks.posY[i] + 0.8, this.husks.posZ[i], 4);
        }
      }
    }
    this.husks._syncVisualInstances();

    if (this.bloodOrbs) {
      this.bloodOrbs.triggerSanguineHarvest();
    }

    if (this.onWaveComplete) {
      this.onWaveComplete(this.currentWave);
    }
  }
}
