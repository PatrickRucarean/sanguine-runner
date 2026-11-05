/**
 * SANGUINE_RUNNER — Data-Driven Master Armory & Differentiated Melee Geometry
 * Matches Sections 3.2, 3.3, and 3.4 of GAME_PLAN.md.
 *
 * Includes:
 *  0. JACKAL_CASULL  — The Jackal & Casull (Dual Heavy Pistols)
 *  1. TRENCH_SHOTGUN — Trench Blood-Shotgun (12-Pellet Velocity Spread & Shotgun-Jump)
 *  2. STAKE_HAMMER   — Stake & Hammer (reach: 1.3m, horizontal_arc: 55°, Armor Shatter)
 *  3. ALUCARD_SWORD  — Alucard Heirloom Sword (reach: 2.5m, horizontal_arc: 120°, Projectile Parry)
 *  4. OCCULT_SCYTHE  — Occult Scythe (reach: 4.0m, horizontal_arc: 160°, Sweet-Spot Tip 3x DMG + Bleed)
 */

import { WeaponId } from './CharacterCatalog.js';

export const WeaponSlot = Object.freeze({
  JACKAL_AND_CASULL: 0,
  JACKAL_CASULL: 0,
  TRENCH_SHOTGUN: 1,
  STAKE_HAMMER: 2,
  ALUCARD_SWORD: 3,
  OCCULT_SCYTHE: 4,
  OCCULT_KATANA: 4, // Alias for legacy tests
});

export const WeaponDefinitions = [
  // ===========================================================================
  // 0. THE JACKAL & CASULL (Dual Heavy Pistols)
  // ===========================================================================
  {
    id: WeaponId.JACKAL_CASULL,
    legacyId: 'jackal_and_casull',
    displayName: 'THE JACKAL & CASULL',
    subtitle: '13mm Twin Auto-Cannons (Silver Brand & Mercury AP)',
    archetype: 'DUAL_HEAVY_PISTOLS',
    slotIndex: 0,
    switchTimeSec: 0.12,
    holsterAutoReloadSec: 1.75,
    ammo: {
      magazineSize: 12,
      reloadDurationSec: 1.10,
      activeReloadWindow: [0.40, 0.65],
      empoweredDamageMult: 1.25,
      empoweredBonusPierce: 1,
      altFireBloodCost: 20,
      altFireAmmoCost: 2,
    },
    primaryFire: {
      deliveryType: 'HITSCAN',
      fireIntervalSec: 0.20,
      maxRange: 140.0,
      casull: {
        name: 'Casull (.454 Silver)',
        baseDamage: 45,
        headshotMultiplier: 2.5,
        poiseDamage: 26,
        headshotPoiseMultiplier: 2.5,
        pierceCount: 0,
        appliesSilverBrandSec: 3.5,
        hitstopFrames: 1,
        fovPunchDeg: 1.8,
        recoilPitchDeg: 2.1,
        recoilYawJitterDeg: 0.35,
      },
      jackal: {
        name: 'The Jackal (13mm Mercury AP)',
        baseDamage: 60,
        headshotMultiplier: 2.5,
        poiseDamage: 44,
        headshotPoiseMultiplier: 3.0,
        pierceCount: 2,
        pierceDamageFalloff: 0.85,
        silverBrandDetonationAoERadius: 3.2,
        silverBrandDetonationDamage: 65,
        silverBrandDetonationPoise: 55,
        hitstopFrames: 2,
        fovPunchDeg: 2.8,
        recoilPitchDeg: 2.8,
        recoilYawJitterDeg: 0.45,
      },
    },
    altFire: {
      id: 'twin_cross_burst',
      displayName: 'Twin Crucifix Execution Shot',
      cooldownSec: 1.35,
      baseDamage: 165,
      obliterationCritDamage: 260,
      poiseDamage: 120,
      pierceCount: 99,
      weakpointSnapConeDeg: 8.5,
      hitstopFrames: 4,
      fovPunchDeg: 5.5,
      recoilPitchDeg: 4.5,
    },
  },

  // ===========================================================================
  // 1. TRENCH BLOOD-SHOTGUN (Ballistic Scattergun & Recoil Jump)
  // ===========================================================================
  {
    id: WeaponId.TRENCH_SHOTGUN,
    displayName: 'TRENCH BLOOD-SHOTGUN',
    subtitle: '4-Gauge Hellfire Scattergun (Velocity Bonus & Recoil Jump)',
    archetype: 'BALLISTIC_SCATTERGUN',
    slotIndex: 1,
    switchTimeSec: 0.14,
    holsterAutoReloadSec: 1.85,
    ammo: {
      magazineSize: 6,
      reloadDurationSec: 1.25,
      activeReloadWindow: [0.42, 0.68],
      empoweredDamageMult: 1.25,
      empoweredBonusPierce: 1,
      altFireBloodCost: 25,
      altFireAmmoCost: 2,
    },
    primaryFire: {
      deliveryType: 'PROJECTILE_SPREAD',
      fireIntervalSec: 0.62,
      maxRange: 48.0,
      pelletCount: 12,
      spreadConeDeg: 7.5,
      baseDamagePerPellet: 14,
      poiseDamagePerPellet: 9.5,
      headshotMultiplier: 1.75,
      velocityDamageScalePerMs: 0.02, // +2% DMG per m/s above 10 m/s
      recoilJumpImpulse: 13.5,        // Self-recoil impulse when airborne!
      hitstopFrames: 3,
      fovPunchDeg: 4.8,
      recoilPitchDeg: 4.2,
      recoilYawJitterDeg: 0.65,
    },
    altFire: {
      id: 'hellfire_gore_slug',
      displayName: 'Concentrated Gore-Slug & Recoil Vault',
      cooldownSec: 1.6,
      baseDamage: 185,
      explosionRadius: 4.5,
      explosionDamage: 85,
      poiseDamage: 135,
      recoilJumpImpulse: 15.0,
      hitstopFrames: 4,
      fovPunchDeg: 6.0,
      recoilPitchDeg: 5.2,
    },
  },

  // ===========================================================================
  // 2. STAKE & HAMMER (Close-Quarters Impale & Armor Shatter — 1.3m / 55°)
  // ===========================================================================
  {
    id: WeaponId.STAKE_HAMMER,
    displayName: 'STAKE & HAMMER',
    subtitle: 'Consecrated Iron-Wood Stake & Mallet (1.3m Reach / 55° Cone)',
    archetype: 'MELEE_STAKE_HAMMER',
    slotIndex: 2,
    switchTimeSec: 0.10,
    holsterAutoReloadSec: 0,
    ammo: {
      magazineSize: null,
      altFireBloodCost: 25,
    },
    meleeGeometry: {
      reach: 1.3,
      horizontal_arc: 55.0,
      vertical_tolerance: 1.35,
      timing: {
        windupMs: 55,
        activeSweepMs: 65,
        recoveryMs: 220,
      },
      shattersArmor: true,
      canParryProjectiles: false,
      pointBlankExplosionRadius: 2.5,
      pointBlankExplosionDamage: 65,
    },
    primaryFire: {
      deliveryType: 'MELEE_SECTOR',
      fireIntervalSec: 0.34,
      reachMeters: 1.3,
      cleaveConeDeg: 55.0,
      baseDamage: 95,
      poiseDamage: 135, // Massive stagger break!
      critChance: 0.25,
      critMultiplier: 2.2,
      bleedStacksOnHit: 1,
      bleedStacksOnCrit: 2,
      hitstopFramesNormal: 3,
      hitstopFramesCrit: 4,
      fovPunchDeg: 3.8,
    },
    altFire: {
      id: 'seismic_stake_drive',
      displayName: 'Heart-Piercer Seismic Drive',
      cooldownSec: 1.8,
      lungeDistanceMeters: 5.5,
      shockwaveRadius: 3.5,
      shockwaveConeDeg: 70.0,
      baseDamage: 195,
      poiseDamage: 220,
      hitstopFrames: 4,
      fovPunchDeg: 6.2,
    },
  },

  // ===========================================================================
  // 3. ALUCARD SWORD (Vampiric Heirloom Broadsword — 2.5m / 120° + Parry)
  // ===========================================================================
  {
    id: WeaponId.ALUCARD_SWORD,
    displayName: 'ALUCARD HEIRLOOM SWORD',
    subtitle: 'Cruciform Broadsword (2.5m Reach / 120° Arc / Projectile Parry)',
    archetype: 'MELEE_ALUCARD_SWORD',
    slotIndex: 3,
    switchTimeSec: 0.10,
    holsterAutoReloadSec: 0,
    ammo: {
      magazineSize: null,
      altFireBloodCost: 0,
    },
    meleeGeometry: {
      reach: 2.5,
      horizontal_arc: 120.0,
      vertical_tolerance: 1.45,
      timing: {
        windupMs: 40,
        activeSweepMs: 95,
        recoveryMs: 145,
      },
      shattersArmor: false,
      canParryProjectiles: true,
    },
    primaryFire: {
      deliveryType: 'MELEE_SECTOR',
      fireIntervalSec: 0.28,
      reachMeters: 2.5,
      cleaveConeDeg: 120.0,
      baseDamage: 68,
      poiseDamage: 48,
      critChance: 0.22,
      critMultiplier: 2.0,
      bleedStacksOnHit: 1,
      bleedStacksOnCrit: 2,
      siphonHpOnKill: 6,
      siphonBloodOnKill: 10,
      hitstopFramesNormal: 2,
      hitstopFramesCrit: 3,
      fovPunchDeg: 2.4,
    },
    altFire: {
      id: 'crimson_parry_and_riposte',
      displayName: 'Crimson Guard Parry & Blood-Wave Riposte',
      cooldownSec: 1.4,
      parryWindowSec: 0.18,         // 180ms Frontal Parry Window
      parryReturnDamageMult: 4.0,   // 400% return damage on deflected projectiles!
      parryShockwaveRadius: 4.5,
      parryShockwaveDamage: 125,
      parryShockwavePoise: 110,
      hitstopFrames: 4,
      fovPunchDeg: 5.5,
    },
  },

  // ===========================================================================
  // 4. OCCULT SCYTHE (4.0m Reach / 160° Arc + Sweet-Spot 3x DMG & Bleed)
  // ===========================================================================
  {
    id: WeaponId.OCCULT_SCYTHE,
    legacyId: 'occult_katana',
    displayName: 'OCCULT SCYTHE',
    subtitle: 'Crescent Grim-Reaper (4.0m Reach / 160° Arc / Outer Sweet-Spot 3x DMG)',
    archetype: 'MELEE_OCCULT_SCYTHE',
    slotIndex: 4,
    switchTimeSec: 0.10,
    holsterAutoReloadSec: 0,
    ammo: {
      magazineSize: null,
      altFireBloodCost: 0,
    },
    meleeGeometry: {
      reach: 4.0,
      horizontal_arc: 160.0,
      vertical_tolerance: 1.55,
      timing: {
        windupMs: 85,
        activeSweepMs: 130,
        recoveryMs: 260,
      },
      shattersArmor: false,
      canParryProjectiles: false,
      sweet_spot: {
        enabled: true,
        minRadiusRatio: 0.65,          // Outer 35% blade tip (2.6m - 4.0m at base reach)
        maxRadiusRatio: 1.00,
        tipDamageMultiplier: 3.0,      // 3x Damage at the blade tip!
        tipBleedStacks: 3,             // Heavy arterial hemorrhage
        shaftDamageMultiplier: 0.40,   // Glancing shaft hit if enemy is too close (<65% reach)
        shaftKnockbackImpulse: 12.0,   // Pushes close enemies outward into the sweet-spot!
      },
    },
    primaryFire: {
      deliveryType: 'MELEE_SECTOR',
      fireIntervalSec: 0.47,
      reachMeters: 4.0,
      cleaveConeDeg: 160.0,
      baseDamage: 55, // 165 DMG on Sweet-Spot Tip before crits!
      poiseDamage: 42,
      critChance: 0.25,
      critMultiplier: 2.0,
      bleedStacksOnHit: 1,
      bleedStacksOnCrit: 2,
      bleedDpsPerStack: 12.0,
      bleedDurationSec: 4.0,
      hitstopFramesNormal: 2,
      hitstopFramesCrit: 4,
      fovPunchDeg: 3.2,
    },
    altFire: {
      id: 'iaijutsu_blood_dash',
      displayName: 'Reaper Blood-Dash & Crescent Vortex',
      cooldownSec: 2.0,
      dashDistanceMeters: 11.5,
      dashDurationSec: 0.10,
      exitSpeedMetersPerSec: 15.5,
      sliceRadiusMeters: 2.4,
      baseDamage: 120,
      poiseDamage: 75,
      bleedRuptureMultiplier: 1.5,
      killResetWindowSec: 0.65,
      bloodRefundOnKill: 18,
      hitstopFrames: 3,
      fovPunchDeg: 6.2,
    },
  },
];

export function getWeaponDefinitionById(weaponIdOrSlot) {
  if (typeof weaponIdOrSlot === 'number') {
    return WeaponDefinitions[weaponIdOrSlot] || WeaponDefinitions[0];
  }
  return (
    WeaponDefinitions.find(
      (w) => w.id === weaponIdOrSlot || w.legacyId === weaponIdOrSlot
    ) || WeaponDefinitions[0]
  );
}

export const QuickMeleeConfig = {
  cooldownSec: 0.28,
  reachMeters: 3.8,
  executionRangeMeters: 4.6,
  clawSlash: {
    damage: 45,
    poiseDamage: 45,
    hitstopFrames: 2,
  },
  slideBloodKick: {
    damage: 55,
    poiseDamage: 110,
    bowlingLaunchSpeed: 24.0,
    bowlingCollisionDamage: 115,
    bowlingCollisionPoise: 100,
    bowlingRadius: 1.35,
    hitstopFrames: 3,
    fovPunchDeg: 4.2,
  },
  vampiricExecution: {
    damage: 500,
    healHp: 25,
    restoreBlood: 30,
    lungeDurationSec: 0.12,
    hitstopFrames: 4,
    fovPunchDeg: 5.0,
  },
};
