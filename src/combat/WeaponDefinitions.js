/**
 * SANGUINE_RUNNER — Data-Driven Weapon & Context Melee Definitions
 * Matches Section 3.2 & 3.3 of GAME_PLAN.md.
 */

export const WeaponSlot = Object.freeze({
  JACKAL_AND_CASULL: 0,
  OCCULT_KATANA: 1,
});

export const WeaponDefinitions = [
  {
    id: 'jackal_and_casull',
    displayName: 'THE JACKAL & CASULL',
    subtitle: '13mm Twin Auto-Cannons (Silver & Mercury)',
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
      fireIntervalSec: 0.20, // 300 RPM rhythmic semi-auto / buffered auto
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
  {
    id: 'occult_katana',
    displayName: 'OCCULT KATANA',
    subtitle: 'Muramasa Blood-Edge (Hemorrhage & Dash-Reset)',
    archetype: 'MELEE_KATANA',
    slotIndex: 1,
    switchTimeSec: 0.10,
    holsterAutoReloadSec: 0,
    ammo: {
      magazineSize: null, // Infinite edge; uses Blood / Cooldown for Iaijutsu Dash
      altFireBloodCost: 0,
    },
    primaryFire: {
      deliveryType: 'MELEE_ARC',
      fireIntervalSec: 0.15, // 4.0 slashes/sec hyper-cadence
      reachMeters: 3.6,
      cleaveConeDeg: 105.0,
      baseDamage: 38,
      poiseDamage: 24,
      critChance: 0.25,
      critMultiplier: 2.0,
      bleedStacksOnHit: 1,
      bleedStacksOnCrit: 2,
      bleedDpsPerStack: 12.0,
      bleedDurationSec: 4.0,
      hitstopFramesNormal: 1,
      hitstopFramesCrit: 3,
      fovPunchDeg: 1.6,
    },
    altFire: {
      id: 'iaijutsu_blood_dash',
      displayName: 'Iaijutsu Blood-Dash Strike',
      cooldownSec: 2.0,
      dashDistanceMeters: 11.5,
      dashDurationSec: 0.10,
      exitSpeedMetersPerSec: 15.5,
      sliceRadiusMeters: 1.85,
      baseDamage: 110,
      poiseDamage: 65,
      bleedRuptureMultiplier: 1.5, // Instant burst = 150% of remaining bleed damage!
      killResetWindowSec: 0.65,    // Kills during or within 0.65s of dash refund 100% cooldown!
      bloodRefundOnKill: 18,
      hitstopFrames: 3,
      fovPunchDeg: 6.2,
    },
  },
];

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
    poiseDamage: 110, // Guarantees stagger break on standard husks
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
