/**
 * SANGUINE_RUNNER — Decoupled Character / Bloodline Catalog (Brotato-Style Loadout)
 * Matches Section 3.0 of GAME_PLAN.md.
 *
 * Classes define ONLY stat offsets, unique bloodline passives, and a starting pool
 * of 2-3 selectable weapons from the Master Armory.
 */

export const WeaponId = Object.freeze({
  JACKAL_CASULL: 'JACKAL_CASULL',
  TRENCH_SHOTGUN: 'TRENCH_SHOTGUN',
  STAKE_HAMMER: 'STAKE_HAMMER',
  ALUCARD_SWORD: 'ALUCARD_SWORD',
  OCCULT_SCYTHE: 'OCCULT_SCYTHE',
});

export const CharacterId = Object.freeze({
  NOSFERATU_SOVEREIGN: 'NOSFERATU_SOVEREIGN',
  HELLSING_GUNSLINGER: 'HELLSING_GUNSLINGER',
  WRAITH_STRIDER: 'WRAITH_STRIDER',
  EXECUTIONER_INQUISITOR: 'EXECUTIONER_INQUISITOR',
});

export const CharacterCatalog = [
  {
    id: CharacterId.NOSFERATU_SOVEREIGN,
    name: 'Nosferatu Sovereign',
    subtitle: 'Aristocratic Hemomancer — Overblood Siphon & Close-Quarters Rupture',
    statOffsets: {
      maxHpFlat: 35,
      armorFlat: -10,
      moveSpeedPct: 0.0,
      critChancePct: 0.0,
      lifeLeechPct: 0.25,
      meleeReachMultiplierPct: 0.0,
      kineticDamagePct: 0.0,
      occultDamagePct: 0.15,
    },
    uniquePassiveId: 'CRIMSON_ARISTOCRACY',
    uniquePassiveName: 'Crimson Aristocracy',
    uniquePassiveDesc:
      'Overhealing converts into an Overblood Barrier (up to 50% Max HP). Bleed ticks restore +1 HP.',
    allowedStartingWeapons: [
      WeaponId.ALUCARD_SWORD,
      WeaponId.STAKE_HAMMER,
      WeaponId.OCCULT_SCYTHE,
    ],
  },
  {
    id: CharacterId.HELLSING_GUNSLINGER,
    name: 'Hellsing Gunslinger',
    subtitle: 'Ballistic Executioner — Weakpoint Precision & Active Reload Mastery',
    statOffsets: {
      maxHpFlat: -15,
      armorFlat: 0,
      moveSpeedPct: 0.08,
      critChancePct: 0.30,
      lifeLeechPct: 0.0,
      meleeReachMultiplierPct: 0.0,
      kineticDamagePct: 0.25,
      occultDamagePct: 0.0,
    },
    uniquePassiveId: 'SILVER_INQUISITION',
    uniquePassiveName: 'Silver Inquisition',
    uniquePassiveDesc:
      'Active Blood Reloads grant +1 extra Pierce and +25% Weakpoint Crit Multiplier for the magazine.',
    allowedStartingWeapons: [
      WeaponId.JACKAL_CASULL,
      WeaponId.TRENCH_SHOTGUN,
      WeaponId.ALUCARD_SWORD,
    ],
  },
  {
    id: CharacterId.WRAITH_STRIDER,
    name: 'Wraith Strider',
    subtitle: 'Supersonic Reaper — Momentum Scaling & Extended Sweeping Reach',
    statOffsets: {
      maxHpFlat: -20,
      armorFlat: 0,
      moveSpeedPct: 0.20,
      critChancePct: 0.15,
      lifeLeechPct: 0.05,
      meleeReachMultiplierPct: 0.15,
      kineticDamagePct: 0.0,
      occultDamagePct: 0.10,
    },
    uniquePassiveId: 'PHANTOM_MOMENTUM',
    uniquePassiveName: 'Phantom Momentum',
    uniquePassiveDesc:
      'Every 1 m/s of horizontal velocity above 10 m/s grants +3% total weapon damage and +2% Crit Chance.',
    allowedStartingWeapons: [
      WeaponId.OCCULT_SCYTHE,
      WeaponId.ALUCARD_SWORD,
      WeaponId.TRENCH_SHOTGUN,
    ],
  },
  {
    id: CharacterId.EXECUTIONER_INQUISITOR,
    name: 'Executioner Inquisitor',
    subtitle: 'Brutalist Juggernaut — Armor Shatter & Seismic Stagger Dominance',
    statOffsets: {
      maxHpFlat: 50,
      armorFlat: 25,
      moveSpeedPct: -0.05,
      critChancePct: 0.05,
      lifeLeechPct: 0.10,
      meleeReachMultiplierPct: 0.0,
      kineticDamagePct: 0.20,
      occultDamagePct: 0.10,
    },
    uniquePassiveId: 'IRON_CONFESSIONAL',
    uniquePassiveName: 'Iron Confessional',
    uniquePassiveDesc:
      '+40% Stagger/Poise Damage. Shattering enemy poise or armor triggers a 4.0m Crimson Shockwave.',
    allowedStartingWeapons: [
      WeaponId.STAKE_HAMMER,
      WeaponId.TRENCH_SHOTGUN,
      WeaponId.OCCULT_SCYTHE,
    ],
  },
];

export function getCharacterById(characterId) {
  return (
    CharacterCatalog.find((c) => c.id === characterId) || CharacterCatalog[0]
  );
}

/**
 * Validates whether a weapon is allowed in a character's starting pool.
 */
export function isWeaponAllowedForCharacter(characterId, weaponId) {
  const charDef = getCharacterById(characterId);
  return charDef.allowedStartingWeapons.includes(weaponId);
}
