/**
 * SANGUINE_RUNNER — Phase 4: Mathematical Infinite Scaling & Aggregation Engine
 * Implements Sections 5.1 and 5.2 of GAME_PLAN.md:
 *  - Category 1: Additive-Bucket Multiplicative Scaling + `melee_reach_multiplier`
 *  - Category 2: Inverse-Cooldown / Rate Scaling + 60Hz Multi-Shot Overflow Safety Valve
 *  - Category 3: Hyperbolic Asymptotic Mitigation (Armor & Spread Reduction)
 *  - Category 4: Multi-Tier Threshold Overflow (Crit Tiers 1/2/3+, Projectile Split, Pierce)
 *  - Proc-Chain Recursion Dampener (Generation Depth <= 3, Per-Tick Budget <= 64)
 */

export const MAX_PROC_GENERATION_DEPTH = 3;
export const MAX_PROCS_PER_TICK = 64;

export class ScalingEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.stats = {
      moveSpeedPct: 0.0,
      slideBoostPct: 0.0,
      kineticDamagePct: 0.0,
      occultDamagePct: 0.0,
      meleeReachMultiplierPct: 0.0,
      fireRatePct: 0.0,
      bulletVelocityPct: 0.0,
      pierceCount: 0.0,
      projectileSplit: 0.0,
      spreadReductionPct: 0.0,
      critChancePct: 0.0,
      siphonOnHitPct: 0.0,
      bleedTickRatePct: 0.0,
      magnetRadiusPct: 0.0,
      bloodNovaDamagePct: 0.0,
      maxHpFlat: 0,
      armorFlat: 0,
      lifeLeechPct: 0.0,
      maxBloodDiceFlat: 0,
    };

    this.multipliers = {
      kineticDamagePct: 1.0,
      occultDamagePct: 1.0,
      meleeReachMultiplierPct: 1.0,
    };

    // Map of perkId -> stack count
    this.perkStacks = new Map();
    // Active proc hooks registered by drafted perks
    this.procHooks = [];
    this.procsTriggeredThisTick = 0;
  }

  beginTick() {
    this.procsTriggeredThisTick = 0;
  }

  /**
   * Applies base stat offsets from a selected Character / Bloodline (`CharacterDefinition`).
   */
  applyCharacterOffsets(characterDef) {
    if (!characterDef || !characterDef.statOffsets) return;
    for (const [k, v] of Object.entries(characterDef.statOffsets)) {
      if (k in this.stats && typeof v === 'number') {
        this.stats[k] += v;
      }
    }
  }

  /**
   * Applies a drafted `PerkDefinition` to the player's scaling state.
   */
  applyPerk(perkDef) {
    if (!perkDef) return false;
    const currentStacks = this.perkStacks.get(perkDef.id) || 0;
    if (perkDef.maxStacks !== null && currentStacks >= perkDef.maxStacks) {
      return false;
    }

    this.perkStacks.set(perkDef.id, currentStacks + 1);

    if (Array.isArray(perkDef.statModifiers)) {
      for (const mod of perkDef.statModifiers) {
        if (mod.operation === 'MULTIPLY') {
          this.multipliers[mod.stat] = (this.multipliers[mod.stat] || 1.0) * mod.value;
        } else {
          this.stats[mod.stat] = (this.stats[mod.stat] || 0) + mod.value;
        }
      }
    }

    if (Array.isArray(perkDef.procHooks)) {
      for (const hook of perkDef.procHooks) {
        this.procHooks.push({ ...hook, sourcePerkId: perkDef.id });
      }
    }

    return true;
  }

  getPerkStacks(perkId) {
    return this.perkStacks.get(perkId) || 0;
  }

  // ===========================================================================
  // CATEGORY 1: ADDITIVE-BUCKET MULTIPLICATIVE SCALING & MELEE REACH
  // ===========================================================================
  getKineticDamageMultiplier(horizontalVelocity = 0) {
    const velBonus = Math.max(0, horizontalVelocity - 12.0) * 0.015;
    return (
      Math.max(0.1, 1.0 + this.stats.kineticDamagePct) *
      (1.0 + velBonus) *
      (this.multipliers.kineticDamagePct || 1.0)
    );
  }

  getOccultDamageMultiplier(horizontalVelocity = 0) {
    const velBonus = Math.max(0, horizontalVelocity - 12.0) * 0.015;
    return (
      Math.max(0.1, 1.0 + this.stats.occultDamagePct) *
      (1.0 + velBonus) *
      (this.multipliers.occultDamagePct || 1.0)
    );
  }

  /**
   * Effective Melee Reach Multiplier (`melee_reach_multiplier`):
   * R_eff = R_base * (1 + sum(meleeReachMultiplierPct)) * Mult
   */
  getMeleeReachMultiplier() {
    return (
      Math.max(0.25, 1.0 + this.stats.meleeReachMultiplierPct) *
      (this.multipliers.meleeReachMultiplierPct || 1.0)
    );
  }

  // ===========================================================================
  // CATEGORY 2: INVERSE-RATE SCALING + 60Hz MULTI-SHOT OVERFLOW SAFETY VALVE
  // ===========================================================================
  getFireRateMultiplier() {
    return Math.max(0.2, 1.0 + this.stats.fireRatePct);
  }

  /**
   * Computes effective shot interval and converts any fire rate exceeding 60 shots/sec
   * (16.66ms = 2 physics ticks) 1:1 into Bonus Multi-Shot Multiplier!
   */
  computeIntervalAndOverflowMultishot(baseIntervalSec) {
    const rateMult = this.getFireRateMultiplier();
    const rawInterval = baseIntervalSec / rateMult;
    const minSafeInterval = 2.0 / 120.0; // 16.66ms (2 ticks at 120Hz)

    if (rawInterval >= minSafeInterval) {
      return {
        effectiveIntervalSec: rawInterval,
        overflowMultishotMultiplier: 1.0,
      };
    }

    return {
      effectiveIntervalSec: minSafeInterval,
      overflowMultishotMultiplier: minSafeInterval / rawInterval,
    };
  }

  // ===========================================================================
  // CATEGORY 3: HYPERBOLIC ASYMPTOTIC SCALING (Armor & Accuracy Spread)
  // ===========================================================================
  getArmor() {
    return this.stats.armorFlat;
  }

  getArmorMitigationRatio() {
    const x = this.stats.armorFlat;
    if (x >= 0) return x / (x + 100.0);
    return x / (100.0 - x);
  }

  getEffectiveSpreadDeg(baseSpreadDeg) {
    return baseSpreadDeg / (1.0 + Math.max(0, this.stats.spreadReductionPct));
  }

  getMagneticPickupRadius(baseRadiusMeters = 4.5) {
    return baseRadiusMeters * Math.max(0.5, 1.0 + this.stats.magnetRadiusPct);
  }

  // ===========================================================================
  // CATEGORY 4: MULTI-TIER THRESHOLD OVERFLOW (Crit Tiers, Split, Pierce)
  // ===========================================================================
  /**
   * Decomposes any scalar S >= 0 into integer tier n = floor(S) + Bernoulli(r).
   */
  resolveMultiTierOverflow(scalarValue, rng = Math.random) {
    if (scalarValue <= 0) return 0;
    const n = Math.floor(scalarValue);
    const r = scalarValue - n;
    return n + (rng() < r ? 1 : 0);
  }

  /**
   * Evaluates Multi-Tier Crit Overflow (Section 5.1 Category 4):
   *  - Tier 0: Normal Hit (1.0x DMG)
   *  - Tier 1 (0%-100%): Crimson Crit (2.0x DMG)
   *  - Tier 2 (101%-200%): Sanguine Super-Crit (3.5x DMG + 2 Bleed stacks)
   *  - Tier 3+ (201%+): Hellsing Obliteration Crit ((2.0 + 1.5*tier)x DMG + Blood Nova)
   */
  evaluateCritTier(baseCritChance = 0.2, rng = Math.random) {
    const totalCrit = Math.max(0, baseCritChance + this.stats.critChancePct);
    const tier = this.resolveMultiTierOverflow(totalCrit, rng);

    if (tier <= 0) {
      return {
        tier: 0,
        name: 'NORMAL',
        damageMultiplier: 1.0,
        bonusBleedStacks: 0,
        triggersBloodNova: false,
      };
    }
    if (tier === 1) {
      return {
        tier: 1,
        name: 'CRIMSON_CRIT',
        damageMultiplier: 2.0,
        bonusBleedStacks: 0,
        triggersBloodNova: false,
      };
    }
    if (tier === 2) {
      return {
        tier: 2,
        name: 'SANGUINE_SUPER_CRIT',
        damageMultiplier: 3.5,
        bonusBleedStacks: 2,
        triggersBloodNova: false,
      };
    }
    return {
      tier,
      name: 'HELLSING_OBLITERATION_CRIT',
      damageMultiplier: 2.0 + 1.5 * tier,
      bonusBleedStacks: 3,
      triggersBloodNova: true,
    };
  }

  rollBonusPierce(rng = Math.random) {
    return this.resolveMultiTierOverflow(this.stats.pierceCount, rng);
  }

  rollProjectileSplitCount(rng = Math.random) {
    return 1 + this.resolveMultiTierOverflow(this.stats.projectileSplit, rng);
  }

  /**
   * Evaluates a proc chain step with generation-depth dampening and per-tick cap.
   */
  canTriggerProc(generationDepth = 0, parentProcCoefficient = 1.0, baseChance = 0.5, rng = Math.random) {
    if (generationDepth >= MAX_PROC_GENERATION_DEPTH) return false;
    if (this.procsTriggeredThisTick >= MAX_PROCS_PER_TICK) return false;

    const effectiveChance = baseChance * parentProcCoefficient;
    if (rng() < effectiveChance) {
      this.procsTriggeredThisTick++;
      return true;
    }
    return false;
  }
}
