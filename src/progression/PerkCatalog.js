/**
 * SANGUINE_RUNNER — Phase 4: Data-Driven Perk & Single-Weapon Keystone Catalog
 * Implements Section 5.3.A of GAME_PLAN.md.
 *
 * Includes universal perks (`KINETIC`, `OCCULT`, `MOVEMENT`, `FAMILIAR`, `BLOOD`)
 * and single-weapon specific augments (`JACKAL_CASULL`, `TRENCH_SHOTGUN`,
 * `STAKE_HAMMER`, `ALUCARD_SWORD`, `OCCULT_SCYTHE`).
 */

import { WeaponId } from '../combat/CharacterCatalog.js';

export const PerkRarity = Object.freeze({
  COMMON: 'COMMON',
  RARE: 'RARE',
  EPIC: 'EPIC',
  ELDRITCH: 'ELDRITCH',
});

export const WEAPON_TAGS = new Set([
  WeaponId.JACKAL_CASULL,
  WeaponId.TRENCH_SHOTGUN,
  WeaponId.STAKE_HAMMER,
  WeaponId.ALUCARD_SWORD,
  WeaponId.OCCULT_SCYTHE,
]);

export const PerkCatalog = [
  // ===========================================================================
  // COMMON TIER (Bone Slate #A09E97)
  // ===========================================================================
  {
    id: 'serrated_vitae_edge',
    name: 'Serrated Vitae Edge',
    rarity: PerkRarity.COMMON,
    tags: ['OCCULT', 'BLOOD'],
    maxStacks: null,
    description: '+18% Occult & Melee Damage, +12% Bleed Tick Speed.',
    statModifiers: [
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.18 },
      { stat: 'bleedTickRatePct', operation: 'ADD', value: 0.12 },
    ],
  },
  {
    id: 'blessed_mercury_powder',
    name: 'Blessed Mercury Powder',
    rarity: PerkRarity.COMMON,
    tags: ['KINETIC'],
    maxStacks: null,
    description: '+20% Kinetic Damage and +15% Bullet Velocity.',
    statModifiers: [
      { stat: 'kineticDamagePct', operation: 'ADD', value: 0.2 },
      { stat: 'bulletVelocityPct', operation: 'ADD', value: 0.15 },
    ],
  },
  {
    id: 'telescopic_crimson_haft',
    name: 'Telescopic Crimson Haft',
    rarity: PerkRarity.COMMON,
    tags: ['OCCULT'],
    maxStacks: null,
    description: '+20% Melee Reach Multiplier (scales sector reach & Scythe sweet-spot).',
    statModifiers: [{ stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.2 }],
  },
  {
    id: 'quicksilver_tendons',
    name: 'Quicksilver Tendons',
    rarity: PerkRarity.COMMON,
    tags: ['MOVEMENT', 'KINETIC'],
    maxStacks: null,
    description: '+15% Attack / Fire Rate and +10% Movement Speed.',
    statModifiers: [
      { stat: 'fireRatePct', operation: 'ADD', value: 0.15 },
      { stat: 'moveSpeedPct', operation: 'ADD', value: 0.1 },
    ],
  },
  {
    id: 'obsidian_ribcage',
    name: 'Obsidian Ribcage',
    rarity: PerkRarity.COMMON,
    tags: ['BLOOD'],
    maxStacks: null,
    description: '+25 Max HP and +15 Armor.',
    statModifiers: [
      { stat: 'maxHpFlat', operation: 'ADD', value: 25 },
      { stat: 'armorFlat', operation: 'ADD', value: 15 },
    ],
  },
  {
    id: 'arterial_lodestone',
    name: 'Arterial Lodestone',
    rarity: PerkRarity.COMMON,
    tags: ['BLOOD', 'MOVEMENT'],
    maxStacks: null,
    description: '+35% Vitae Magnetic Pickup Radius and +12% Slide Boost.',
    statModifiers: [
      { stat: 'magnetRadiusPct', operation: 'ADD', value: 0.35 },
      { stat: 'slideBoostPct', operation: 'ADD', value: 0.12 },
    ],
  },

  // ===========================================================================
  // RARE TIER (Sanguine Crimson #E60012)
  // ===========================================================================
  {
    id: 'executioners_needle',
    name: "Executioner's Needle",
    rarity: PerkRarity.RARE,
    tags: ['KINETIC'],
    maxStacks: null,
    description: '+1 Pierce Count and +25% Crit Chance.',
    statModifiers: [
      { stat: 'pierceCount', operation: 'ADD', value: 1.0 },
      { stat: 'critChancePct', operation: 'ADD', value: 0.25 },
    ],
  },
  {
    id: 'phantom_reach_riposte',
    name: 'Phantom Reach & Riposte',
    rarity: PerkRarity.RARE,
    tags: ['OCCULT', 'MOVEMENT'],
    maxStacks: null,
    description: '+35% Melee Reach Multiplier and +20% Crit Chance.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.35 },
      { stat: 'critChancePct', operation: 'ADD', value: 0.2 },
    ],
  },
  {
    id: 'scythe_crescent_grim_tip',
    name: 'Crescent Grim-Tip (Scythe)',
    rarity: PerkRarity.RARE,
    tags: ['OCCULT', WeaponId.OCCULT_SCYTHE],
    maxStacks: 5,
    weightMultiplier: 1.5,
    description: 'Occult Scythe Exclusive: +30% Melee Reach & +35% Occult Sweet-Spot Damage.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.3 },
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.35 },
    ],
  },
  {
    id: 'sword_heirloom_guard',
    name: 'Serrated Heirloom Edge (Sword)',
    rarity: PerkRarity.RARE,
    tags: ['OCCULT', WeaponId.ALUCARD_SWORD],
    maxStacks: 5,
    weightMultiplier: 1.5,
    description: 'Alucard Sword Exclusive: +25% Melee Reach, +25% Attack Speed, & +10% Life Leech.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.25 },
      { stat: 'fireRatePct', operation: 'ADD', value: 0.25 },
      { stat: 'lifeLeechPct', operation: 'ADD', value: 0.1 },
    ],
  },
  {
    id: 'stake_inquisitor_mallet',
    name: 'Consecrated Iron Mallet (Stake)',
    rarity: PerkRarity.RARE,
    tags: ['KINETIC', 'OCCULT', WeaponId.STAKE_HAMMER],
    maxStacks: 5,
    weightMultiplier: 1.5,
    description: 'Stake & Hammer Exclusive: +35% Reach, +40% Point-Blank Nova Damage, & +20 Armor.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.35 },
      { stat: 'bloodNovaDamagePct', operation: 'ADD', value: 0.4 },
      { stat: 'armorFlat', operation: 'ADD', value: 20 },
    ],
  },
  {
    id: 'pistols_silver_crucifix',
    name: 'Hollow-Point Silver Brand (Pistols)',
    rarity: PerkRarity.RARE,
    tags: ['KINETIC', WeaponId.JACKAL_CASULL],
    maxStacks: 5,
    weightMultiplier: 1.5,
    description: 'Jackal & Casull Exclusive: +30% Fire Rate, +1 Pierce, & +25% Kinetic Damage.',
    statModifiers: [
      { stat: 'fireRatePct', operation: 'ADD', value: 0.3 },
      { stat: 'pierceCount', operation: 'ADD', value: 1.0 },
      { stat: 'kineticDamagePct', operation: 'ADD', value: 0.25 },
    ],
  },
  {
    id: 'shotgun_hellfire_choke',
    name: 'Hellfire Choke Barrel (Shotgun)',
    rarity: PerkRarity.RARE,
    tags: ['KINETIC', WeaponId.TRENCH_SHOTGUN],
    maxStacks: 5,
    weightMultiplier: 1.5,
    description: 'Trench Shotgun Exclusive: +40% Tighter Spread, +0.5 Projectile Split, & +25% Damage.',
    statModifiers: [
      { stat: 'spreadReductionPct', operation: 'ADD', value: 0.4 },
      { stat: 'projectileSplit', operation: 'ADD', value: 0.5 },
      { stat: 'kineticDamagePct', operation: 'ADD', value: 0.25 },
    ],
  },

  // ===========================================================================
  // EPIC TIER (Abyssal Violet #9D00FF)
  // ===========================================================================
  {
    id: 'nocturne_shadow_bats',
    name: 'Nocturne Swarm (Shadow Bats)',
    rarity: PerkRarity.EPIC,
    tags: ['FAMILIAR', 'OCCULT'],
    maxStacks: 4,
    description:
      'Summons +2 autonomous orbiting Shadow Bats that dive through nearby enemies, applying Bleed and fetching Blood Orbs.',
    statModifiers: [{ stat: 'occultDamagePct', operation: 'ADD', value: 0.2 }],
    procHooks: [
      {
        trigger: 'ON_HIT',
        effectId: 'SUMMON_SHADOW_BATS',
        baseChance: 1.0,
        procCoefficient: 0.5,
        internalCooldownSec: 0.65,
        params: { batCount: 2 },
      },
    ],
  },
  {
    id: 'baskerville_spectral_skulls',
    name: 'Baskerville Eyes (Spectral Skulls)',
    rarity: PerkRarity.EPIC,
    tags: ['FAMILIAR', 'KINETIC'],
    maxStacks: 3,
    description:
      'Summons hovering Spectral Skulls over your shoulders that fire synchronized hitscan Occult Eye-Beams.',
    statModifiers: [{ stat: 'critChancePct', operation: 'ADD', value: 0.35 }],
    procHooks: [
      {
        trigger: 'ON_HIT',
        effectId: 'SUMMON_SPECTRAL_SKULLS',
        baseChance: 1.0,
        procCoefficient: 0.6,
        internalCooldownSec: 0.9,
        params: { skullCount: 1 },
      },
    ],
  },
  {
    id: 'hounds_of_baskerville',
    name: 'Hounds of Baskerville (Blood Wolves)',
    rarity: PerkRarity.EPIC,
    tags: ['FAMILIAR', 'BLOOD'],
    maxStacks: 3,
    description:
      'Summons autonomous Ground Pack-Hunter Blood Wolves (18 m/s) that hunt down High-Poise & Elite enemies.',
    statModifiers: [
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.25 },
      { stat: 'siphonOnHitPct', operation: 'ADD', value: 0.15 },
    ],
    procHooks: [
      {
        trigger: 'ON_KILL',
        effectId: 'SUMMON_BLOOD_WOLVES',
        baseChance: 1.0,
        procCoefficient: 0.7,
        internalCooldownSec: 1.0,
        params: { wolfCount: 1 },
      },
    ],
  },
  {
    id: 'corpse_blood_nova',
    name: 'Hemorrhagic Corpse Detonation',
    rarity: PerkRarity.EPIC,
    tags: ['OCCULT', 'BLOOD'],
    maxStacks: null,
    description:
      'Slain enemies violently rupture in a 3.5m Blood Nova dealing 35 + 15% Victim Max HP Occult Damage.',
    statModifiers: [{ stat: 'bloodNovaDamagePct', operation: 'ADD', value: 0.5 }],
    procHooks: [
      {
        trigger: 'ON_KILL',
        effectId: 'SPAWN_BLOOD_NOVA',
        baseChance: 1.0,
        procCoefficient: 0.35,
        internalCooldownSec: 0.05,
        params: { radius: 3.5 },
      },
    ],
  },
  {
    id: 'chalice_of_tepes',
    name: 'Chalice of Tepes (Blood Dice Relic)',
    rarity: PerkRarity.EPIC,
    tags: ['BLOOD'],
    maxStacks: 1,
    description:
      'Increases Max Stored Blood Dice cap by +2 (8 -> 10) and grants +35% Siphon Healing.',
    statModifiers: [
      { stat: 'maxBloodDiceFlat', operation: 'ADD', value: 2 },
      { stat: 'siphonOnHitPct', operation: 'ADD', value: 0.35 },
    ],
  },

  // ===========================================================================
  // ELDRITCH / ALUCARD TIER (Occult Gold #FFD700 — Single-Weapon Keystones)
  // ===========================================================================
  {
    id: 'restraint_level_zero',
    name: 'Cromwell Invocation: Restraint Level Zero',
    rarity: PerkRarity.ELDRITCH,
    tags: ['OCCULT', 'KINETIC', 'BLOOD'],
    maxStacks: 1,
    description:
      'ELDRITCH KEYSTONE: Multiplies all Kinetic & Occult Damage by 1.45x, grants +60% Crit Chance (unlocking Super/Obliteration Crits), and +40% Melee Reach.',
    statModifiers: [
      { stat: 'kineticDamagePct', operation: 'MULTIPLY', value: 1.45 },
      { stat: 'occultDamagePct', operation: 'MULTIPLY', value: 1.45 },
      { stat: 'critChancePct', operation: 'ADD', value: 0.6 },
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.4 },
    ],
  },
  {
    id: 'abyssal_reaper_ascension',
    name: 'Abyssal Eclipse Scythe (Scythe Keystone)',
    rarity: PerkRarity.ELDRITCH,
    tags: ['OCCULT', WeaponId.OCCULT_SCYTHE],
    maxStacks: 1,
    weightMultiplier: 2.0,
    description:
      'SCYTHE KEYSTONE: Multiplies Melee Reach by 1.35x, +65% Occult Damage, and Sweet-Spot hits trigger an instant Blood Nova.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'MULTIPLY', value: 1.35 },
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.65 },
      { stat: 'critChancePct', operation: 'ADD', value: 0.45 },
    ],
  },
  {
    id: 'vlad_tepes_impaler_ascension',
    name: 'Dracul Heart-Impaler (Stake Keystone)',
    rarity: PerkRarity.ELDRITCH,
    tags: ['KINETIC', 'OCCULT', WeaponId.STAKE_HAMMER],
    maxStacks: 1,
    weightMultiplier: 2.0,
    description:
      'STAKE & HAMMER KEYSTONE: +55% Melee Reach, +80% Kinetic/Occult Damage, and +40 Armor.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.55 },
      { stat: 'kineticDamagePct', operation: 'ADD', value: 0.8 },
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.8 },
      { stat: 'armorFlat', operation: 'ADD', value: 40 },
    ],
  },
  {
    id: 'alucard_crusader_ascension',
    name: 'Blade of the Crimson King (Sword Keystone)',
    rarity: PerkRarity.ELDRITCH,
    tags: ['OCCULT', WeaponId.ALUCARD_SWORD],
    maxStacks: 1,
    weightMultiplier: 2.0,
    description:
      'ALUCARD SWORD KEYSTONE: +45% Melee Reach, +50% Attack Rate, and +55% Occult Cleave Damage.',
    statModifiers: [
      { stat: 'meleeReachMultiplierPct', operation: 'ADD', value: 0.45 },
      { stat: 'fireRatePct', operation: 'ADD', value: 0.5 },
      { stat: 'occultDamagePct', operation: 'ADD', value: 0.55 },
    ],
  },
  {
    id: 'casull_jackal_infinite_barrage',
    name: 'Hellsing Twin-Caliber Apocalypse (Pistols Keystone)',
    rarity: PerkRarity.ELDRITCH,
    tags: ['KINETIC', WeaponId.JACKAL_CASULL],
    maxStacks: 1,
    weightMultiplier: 2.0,
    description:
      'JACKAL & CASULL KEYSTONE: +85% Fire Rate (overflows into Multi-Shot above 60Hz!), +2 Pierce, & +50% Crit Chance.',
    statModifiers: [
      { stat: 'fireRatePct', operation: 'ADD', value: 0.85 },
      { stat: 'pierceCount', operation: 'ADD', value: 2.0 },
      { stat: 'critChancePct', operation: 'ADD', value: 0.5 },
    ],
  },
  {
    id: 'trench_cathedral_cannons',
    name: 'Baskerville Hell-Scatter (Shotgun Keystone)',
    rarity: PerkRarity.ELDRITCH,
    tags: ['KINETIC', WeaponId.TRENCH_SHOTGUN],
    maxStacks: 1,
    weightMultiplier: 2.0,
    description:
      'SHOTGUN KEYSTONE: +1.0 Projectile Split (doubles pellets!), +60% Kinetic Damage, & +50% Tighter Spread.',
    statModifiers: [
      { stat: 'projectileSplit', operation: 'ADD', value: 1.0 },
      { stat: 'kineticDamagePct', operation: 'ADD', value: 0.6 },
      { stat: 'spreadReductionPct', operation: 'ADD', value: 0.5 },
    ],
  },
];

/**
 * Filters `PerkCatalog` for the Single-Weapon Run Rule:
 * Keeps all universal perks (no weapon-specific tag) PLUS perks matching `singleWeaponId`.
 * Excludes perks belonging to other unequipped weapons so the draft bench is never polluted!
 */
export function filterPerkCatalogForSingleWeapon(singleWeaponId) {
  return PerkCatalog.filter((perk) => {
    const weaponTagsOnPerk = perk.tags.filter((t) => WEAPON_TAGS.has(t));
    if (weaponTagsOnPerk.length === 0) return true; // Universal perk
    return weaponTagsOnPerk.includes(singleWeaponId);
  });
}
