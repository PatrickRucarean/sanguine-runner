/**
 * SANGUINE_RUNNER — Phase 4: Blood Altar Draft & Per-Card Targeted Reroll Engine
 * Implements Section 5.4 of GAME_PLAN.md (ARAM Mayhem / TFT Style):
 *  - Independent Per-Slot Reroll (`Q / W / E` or `Hover + R`) — other slots remain held on bench
 *  - Slot Lock / Pin Guard (`HELD_READY` <-> `LOCKED_PINNED`)
 *  - Blood Dice Economy (+2 Free Rerolls/wave, banked up to 8-10)
 *  - Exponential Blood Tithe Paid Rerolls (`50 * 2^k` Vitae per shop session)
 *  - Persistent Bad Luck Protection Pity System (`p >= 6` purges Common; `p >= 10` guarantees Epic/Eldritch; resets ONLY on Epic/Eldritch draft)
 *  - Single-Weapon Deck Filtering
 */

import {
  PerkCatalog,
  PerkRarity,
  filterPerkCatalogForSingleWeapon,
} from './PerkCatalog.js';
import { WeaponId } from '../combat/CharacterCatalog.js';

export const SlotStatus = Object.freeze({
  HELD_READY: 'HELD_READY',
  LOCKED_PINNED: 'LOCKED_PINNED',
  REROLLING: 'REROLLING',
  SELECTED: 'SELECTED',
});

export class AltarDraftEngine {
  /**
   * @param {Object} opts
   * @param {import('./ScalingEngine.js').ScalingEngine} opts.scaling
   * @param {import('./BloodOrbManager.js').BloodOrbManager} [opts.bloodOrbs]
   * @param {import('../audio/AudioManager.js').AudioManager} [opts.audio]
   * @param {Function} [opts.onPerkDrafted] Callback `(perk, slotIndex) => void`
   */
  constructor({ scaling, bloodOrbs = null, audio = null, onPerkDrafted = null }) {
    this.scaling = scaling;
    this.bloodOrbs = bloodOrbs;
    this.audio = audio;
    this.onPerkDrafted = onPerkDrafted;

    this.singleWeaponId = WeaponId.OCCULT_SCYTHE;
    this.filteredPool = filterPerkCatalogForSingleWeapon(this.singleWeaponId);

    this.isOpen = false;
    this.waveNumber = 1;
    this.slots = [];

    // Reroll Economy & Persistent Pity State
    this.bloodDiceCurrent = 2;
    this.bloodDiceMax = 8;
    this.paidRerollsThisWave = 0;
    this.pityCounter = 0;
    this.sessionBanSet = new Set();
  }

  /**
   * Sets the single equipped weapon for the run so only universal + matching weapon perks appear.
   */
  setSingleWeaponFilter(weaponId) {
    this.singleWeaponId = weaponId;
    this.filteredPool = filterPerkCatalogForSingleWeapon(weaponId);
  }

  /**
   * Computes the cost of the next paid Blood Tithe reroll: Cost(k) = 50 * 2^k Vitae.
   */
  getNextBloodTitheCost() {
    return 50 * Math.pow(2, this.paidRerollsThisWave);
  }

  /**
   * Dynamic Rarity Weights (Wave w, Persistent Pity p) from Section 5.4.3:
   *  - At p >= 10: Guaranteed 75% EPIC / 25% ELDRITCH
   *  - At p >= 6:  COMMON is completely purged (0 weight)
   */
  computeRarityWeights(wave = this.waveNumber, pity = this.pityCounter) {
    if (pity >= 10) {
      return {
        [PerkRarity.COMMON]: 0,
        [PerkRarity.RARE]: 0,
        [PerkRarity.EPIC]: 75,
        [PerkRarity.ELDRITCH]: 25,
      };
    }

    const wCommon =
      pity >= 6 ? 0 : Math.max(10, 70 - 2.0 * wave - 8.5 * pity);
    const wRare = 22 + 1.2 * wave + 4.5 * pity;
    const wEpic = 7 + 0.6 * wave + 2.6 * pity;
    const wEldritch = 1 + 0.25 * wave + 1.4 * pity;

    return {
      [PerkRarity.COMMON]: wCommon,
      [PerkRarity.RARE]: wRare,
      [PerkRarity.EPIC]: wEpic,
      [PerkRarity.ELDRITCH]: wEldritch,
    };
  }

  _rollRarity(rng = Math.random) {
    const weights = this.computeRarityWeights(this.waveNumber, this.pityCounter);
    const total =
      weights[PerkRarity.COMMON] +
      weights[PerkRarity.RARE] +
      weights[PerkRarity.EPIC] +
      weights[PerkRarity.ELDRITCH];
    let r = rng() * total;

    for (const rarity of [
      PerkRarity.COMMON,
      PerkRarity.RARE,
      PerkRarity.EPIC,
      PerkRarity.ELDRITCH,
    ]) {
      if (r < weights[rarity]) return rarity;
      r -= weights[rarity];
    }
    return PerkRarity.RARE;
  }

  /**
   * Picks a perk for a single slot, strictly excluding:
   *  1. Perks currently visible on other bench slots
   *  2. Perks already discarded in `sessionBanSet` during this Altar session
   *  3. Perks that have reached `maxStacks`
   */
  _pickPerkForSlot(excludeSlotIndex = -1, rng = Math.random) {
    const targetRarity = this._rollRarity(rng);

    const visibleIds = new Set();
    for (let i = 0; i < this.slots.length; i++) {
      if (i !== excludeSlotIndex && this.slots[i]?.perk) {
        visibleIds.add(this.slots[i].perk.id);
      }
    }

    const isEligible = (p, ignoreSessionBan = false) => {
      if (visibleIds.has(p.id)) return false;
      if (!ignoreSessionBan && this.sessionBanSet.has(p.id)) return false;
      const stacks = this.scaling ? this.scaling.getPerkStacks(p.id) : 0;
      if (p.maxStacks !== null && stacks >= p.maxStacks) return false;
      return true;
    };

    // 1. Try matching rolled rarity without session-banned perks
    let candidates = this.filteredPool.filter(
      (p) => p.rarity === targetRarity && isEligible(p, false)
    );

    // 2. Fallback: any eligible perk at or above rolled rarity (respecting p >= 6 no-common rule)
    if (candidates.length === 0) {
      candidates = this.filteredPool.filter(
        (p) =>
          (this.pityCounter < 6 || p.rarity !== PerkRarity.COMMON) &&
          isEligible(p, false)
      );
    }

    // 3. Final fallback if player rerolled through entire catalog in one wave
    if (candidates.length === 0) {
      candidates = this.filteredPool.filter((p) => isEligible(p, true));
    }
    if (candidates.length === 0) {
      candidates = PerkCatalog;
    }

    // Weighted selection using `weightMultiplier`
    let totalWeight = 0;
    for (const c of candidates) totalWeight += c.weightMultiplier || 1.0;
    let pickRoll = rng() * totalWeight;
    for (const c of candidates) {
      const w = c.weightMultiplier || 1.0;
      if (pickRoll <= w) return c;
      pickRoll -= w;
    }
    return candidates[candidates.length - 1];
  }

  /**
   * Opens the Blood Altar at the end of `waveNumber`:
   *  - Grants +2 Free Blood Dice (capped at `bloodDiceMax`)
   *  - Resets `paidRerollsThisWave = 0` and clears `sessionBanSet`
   *  - Deals 3 non-duplicate cards (preserving any `LOCKED_PINNED` slots from previous wave!)
   */
  openAltarForWave(waveNumber = 1, { grantWaveDice = true, rng = Math.random } = {}) {
    this.waveNumber = waveNumber;
    this.isOpen = true;
    this.paidRerollsThisWave = 0;
    this.sessionBanSet.clear();

    const bonusMaxDice = this.scaling ? this.scaling.stats.maxBloodDiceFlat || 0 : 0;
    this.bloodDiceMax = 8 + bonusMaxDice;

    if (grantWaveDice) {
      this.bloodDiceCurrent = Math.min(this.bloodDiceMax, this.bloodDiceCurrent + 2);
    }

    const selectHotkeys = ['1', '2', '3', '4'];
    const rerollHotkeys = ['Q', 'W', 'E', 'R'];

    const nextSlots = [];
    for (let i = 0; i < 3; i++) {
      const existing = this.slots[i];
      if (existing && existing.status === SlotStatus.LOCKED_PINNED && existing.perk) {
        nextSlots.push({
          ...existing,
          slotIndex: i,
          rerollCountThisWave: 0,
        });
      } else {
        this.slots = nextSlots;
        const perk = this._pickPerkForSlot(i, rng);
        nextSlots.push({
          slotIndex: i,
          selectHotkey: selectHotkeys[i],
          rerollHotkey: rerollHotkeys[i],
          perk,
          status: SlotStatus.HELD_READY,
          rerollCountThisWave: 0,
          wasPityBoosted: this.pityCounter > 0,
        });
      }
    }

    this.slots = nextSlots;
    return this.getStateSnapshot();
  }

  /**
   * Toggles the Pin / Lock Guard on `slotIndex` (`HELD_READY` <-> `LOCKED_PINNED`).
   */
  toggleLockSlot(slotIndex) {
    const slot = this.slots[slotIndex];
    if (!slot) return { toggled: false };
    slot.status =
      slot.status === SlotStatus.LOCKED_PINNED
        ? SlotStatus.HELD_READY
        : SlotStatus.LOCKED_PINNED;
    return { toggled: true, slotIndex, status: slot.status };
  }

  /**
   * Executes a Surgical Per-Slot Reroll on ONLY `slotIndex` (`Q / W / E` or `Hover + R`).
   * Other slots remain untouched on the bench!
   */
  rerollSlot(slotIndex, rng = Math.random) {
    if (!this.isOpen || slotIndex < 0 || slotIndex >= this.slots.length) {
      return { rerolled: false, reason: 'INVALID_SLOT' };
    }

    const slot = this.slots[slotIndex];
    if (slot.status === SlotStatus.LOCKED_PINNED) {
      return { rerolled: false, reason: 'SLOT_LOCKED' };
    }

    let paymentType = 'FREE_BLOOD_DIE';
    let vitaeSpent = 0;

    if (this.bloodDiceCurrent > 0) {
      this.bloodDiceCurrent -= 1;
    } else {
      const titheCost = this.getNextBloodTitheCost();
      const currentVitae = this.bloodOrbs ? this.bloodOrbs.currentVitae : 0;
      if (currentVitae < titheCost) {
        return { rerolled: false, reason: 'INSUFFICIENT_VITAE', requiredVitae: titheCost };
      }
      if (this.bloodOrbs) {
        this.bloodOrbs.currentVitae -= titheCost;
      }
      vitaeSpent = titheCost;
      this.paidRerollsThisWave += 1;
      paymentType = 'BLOOD_TITHE';
    }

    // Add discarded perk to sessionBanSet so it cannot reappear this shop
    const previousPerk = slot.perk;
    if (previousPerk) {
      this.sessionBanSet.add(previousPerk.id);
    }

    // Increment Bad Luck Protection Pity Counter BEFORE rolling the replacement card!
    this.pityCounter += 1;

    const newPerk = this._pickPerkForSlot(slotIndex, rng);
    slot.perk = newPerk;
    slot.rerollCountThisWave += 1;
    slot.wasPityBoosted = true;

    return {
      rerolled: true,
      slotIndex,
      paymentType,
      vitaeSpent,
      previousPerkId: previousPerk?.id,
      newPerk,
      pityCounter: this.pityCounter,
      bloodDiceRemaining: this.bloodDiceCurrent,
      nextBloodTitheCost: this.getNextBloodTitheCost(),
    };
  }

  /**
   * Selects (Drafts) the card in `slotIndex` (`1 / 2 / 3` or LMB Click):
   *  - Applies the perk to `ScalingEngine`
   *  - Resets `pityCounter = 0` ONLY if selected rarity is `EPIC` or `ELDRITCH`;
   *    preserves `pityCounter` if `COMMON` or `RARE`!
   *  - Closes the Altar (`isOpen = false`).
   */
  selectSlot(slotIndex) {
    if (!this.isOpen || slotIndex < 0 || slotIndex >= this.slots.length) {
      return { selected: false, reason: 'INVALID_SLOT' };
    }

    const slot = this.slots[slotIndex];
    const perk = slot.perk;
    slot.status = SlotStatus.SELECTED;

    if (this.scaling) {
      this.scaling.applyPerk(perk);
    }

    const wasHighTier =
      perk.rarity === PerkRarity.EPIC || perk.rarity === PerkRarity.ELDRITCH;
    if (wasHighTier) {
      this.pityCounter = 0;
    }

    this.isOpen = false;

    if (this.onPerkDrafted) {
      this.onPerkDrafted(perk, slotIndex);
    }

    return {
      selected: true,
      slotIndex,
      perk,
      pityReset: wasHighTier,
      pityCounterAfter: this.pityCounter,
    };
  }

  getStateSnapshot() {
    return {
      isOpen: this.isOpen,
      waveNumber: this.waveNumber,
      slots: this.slots.map((s) => ({ ...s })),
      bloodDiceCurrent: this.bloodDiceCurrent,
      bloodDiceMax: this.bloodDiceMax,
      paidRerollsThisWave: this.paidRerollsThisWave,
      nextBloodTitheCost: this.getNextBloodTitheCost(),
      pityCounter: this.pityCounter,
      sessionBanCount: this.sessionBanSet.size,
    };
  }
}
