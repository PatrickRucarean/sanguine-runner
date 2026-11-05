/**
 * SANGUINE_RUNNER — Pre-Run Loadout Selector & Blood Altar Per-Card Reroll UI
 * Implements:
 *  - Brotato-style Decoupled Character + Single-Weapon Loadout Picker + Danger 0-5 + Modular Arena
 *  - ARAM Mayhem / TFT-style Blood Altar UI with Per-Card Reroll (`Q / W / E`), Pin/Lock Guard,
 *    Stored Blood Dice readout, Exponential Blood Tithe (`50 * 2^k` Vitae), and Pity Counter
 */

import {
  CharacterCatalog,
  getCharacterById,
} from '../combat/CharacterCatalog.js';
import { getWeaponDefinitionById } from '../combat/WeaponDefinitions.js';
import { DangerConfigs } from '../ai/WaveDirector.js';
import { ModularArenaCatalog } from '../world/ArenaGeometryData.js';
import { SlotStatus } from '../progression/AltarDraftEngine.js';

export class HudAndAltarUI {
  /**
   * @param {Object} opts
   * @param {import('../progression/AltarDraftEngine.js').AltarDraftEngine} opts.altarEngine
   * @param {import('../progression/BloodOrbManager.js').BloodOrbManager} opts.bloodOrbs
   * @param {Function} opts.onStartRun Callback `({ characterId, weaponId, dangerTier, arenaId }) => void`
   * @param {Function} opts.onCardDrafted Callback `(perk) => void`
   */
  constructor({ altarEngine, bloodOrbs, onStartRun, onCardDrafted }) {
    this.altar = altarEngine;
    this.bloodOrbs = bloodOrbs;
    this.onStartRun = onStartRun;
    this.onCardDrafted = onCardDrafted;

    this.selectedCharacterId = CharacterCatalog[0].id;
    this.selectedWeaponId = CharacterCatalog[0].allowedStartingWeapons[0];
    this.selectedDangerTier = 0;
    this.selectedArenaId = ModularArenaCatalog[0].id;

    this._initLoadoutSelectors();
    this._initAltarModal();
  }

  _initLoadoutSelectors() {
    this.charSelectEl = document.getElementById('loadout-char-select');
    this.weaponSelectEl = document.getElementById('loadout-weapon-select');
    this.dangerSelectEl = document.getElementById('loadout-danger-select');
    this.arenaSelectEl = document.getElementById('loadout-arena-select');
    this.charSummaryEl = document.getElementById('loadout-char-summary');
    this.startBtnEl = document.getElementById('loadout-start-btn');

    if (!this.charSelectEl) return;

    // Populate Characters
    this.charSelectEl.innerHTML = '';
    for (const c of CharacterCatalog) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} — ${c.subtitle.split('—')[0].trim()}`;
      this.charSelectEl.appendChild(opt);
    }

    // Populate Danger 0-5
    if (this.dangerSelectEl) {
      this.dangerSelectEl.innerHTML = '';
      for (const d of DangerConfigs) {
        const opt = document.createElement('option');
        opt.value = String(d.tier);
        opt.textContent = `Danger ${d.tier}: ${d.title} (${d.enemyHpMultiplier.toFixed(2)}x HP / ${Math.round(d.eliteSpawnChancePct * 100)}% Elites)`;
        this.dangerSelectEl.appendChild(opt);
      }
    }

    // Populate Modular Arenas
    if (this.arenaSelectEl) {
      this.arenaSelectEl.innerHTML = '';
      for (const a of ModularArenaCatalog) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.name}`;
        this.arenaSelectEl.appendChild(opt);
      }
    }

    this.charSelectEl.addEventListener('change', (e) => {
      e.stopPropagation();
      this.selectedCharacterId = this.charSelectEl.value;
      this._refreshAllowedWeaponsForCharacter();
    });

    if (this.weaponSelectEl) {
      this.weaponSelectEl.addEventListener('change', (e) => {
        e.stopPropagation();
        this.selectedWeaponId = this.weaponSelectEl.value;
      });
    }

    if (this.dangerSelectEl) {
      this.dangerSelectEl.addEventListener('change', (e) => {
        e.stopPropagation();
        this.selectedDangerTier = parseInt(this.dangerSelectEl.value, 10) || 0;
      });
    }

    if (this.arenaSelectEl) {
      this.arenaSelectEl.addEventListener('change', (e) => {
        e.stopPropagation();
        this.selectedArenaId = this.arenaSelectEl.value;
      });
    }

    if (this.startBtnEl) {
      this.startBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStartRun) {
          this.onStartRun({
            characterId: this.selectedCharacterId,
            weaponId: this.selectedWeaponId,
            dangerTier: this.selectedDangerTier,
            arenaId: this.selectedArenaId,
          });
        }
      });
    }

    this._refreshAllowedWeaponsForCharacter();
  }

  _refreshAllowedWeaponsForCharacter() {
    const charDef = getCharacterById(this.selectedCharacterId);
    if (this.charSummaryEl) {
      this.charSummaryEl.textContent = `${charDef.uniquePassiveName}: ${charDef.uniquePassiveDesc}`;
    }
    if (!this.weaponSelectEl) return;

    this.weaponSelectEl.innerHTML = '';
    for (const wId of charDef.allowedStartingWeapons) {
      const wDef = getWeaponDefinitionById(wId);
      const opt = document.createElement('option');
      opt.value = wDef.id;
      opt.textContent = `${wDef.displayName} — ${wDef.subtitle}`;
      this.weaponSelectEl.appendChild(opt);
    }
    this.selectedWeaponId = charDef.allowedStartingWeapons[0];
  }

  _initAltarModal() {
    this.modalEl = document.getElementById('blood-altar-modal');
    this.cardsContainerEl = document.getElementById('altar-cards-row');
    this.diceReadoutEl = document.getElementById('altar-dice-val');
    this.vitaeReadoutEl = document.getElementById('altar-vitae-val');
    this.pityReadoutEl = document.getElementById('altar-pity-val');
    this.titheReadoutEl = document.getElementById('altar-tithe-val');
  }

  /**
   * Renders the Blood Altar Draft modal with 3 interactive Perk Cards and per-slot Reroll/Lock controls.
   */
  renderAltar() {
    if (!this.modalEl || !this.cardsContainerEl) return;

    const snap = this.altar.getStateSnapshot();
    if (!snap.isOpen) {
      this.modalEl.classList.add('hidden');
      return;
    }

    this.modalEl.classList.remove('hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const curVitae = this.bloodOrbs ? Math.floor(this.bloodOrbs.currentVitae) : 0;
    if (this.diceReadoutEl) {
      this.diceReadoutEl.textContent = `${snap.bloodDiceCurrent} / ${snap.bloodDiceMax}`;
    }
    if (this.vitaeReadoutEl) {
      this.vitaeReadoutEl.textContent = `${curVitae}`;
    }
    if (this.pityReadoutEl) {
      this.pityReadoutEl.textContent = `${snap.pityCounter} / 10`;
    }
    if (this.titheReadoutEl) {
      this.titheReadoutEl.textContent = `${snap.nextBloodTitheCost} VITAE`;
    }

    this.cardsContainerEl.innerHTML = '';

    for (let i = 0; i < snap.slots.length; i++) {
      const slot = snap.slots[i];
      const perk = slot.perk;
      const isLocked = slot.status === SlotStatus.LOCKED_PINNED;

      const card = document.createElement('div');
      card.className = `altar-card rarity-${perk.rarity.toLowerCase()} ${
        isLocked ? 'locked' : ''
      }`;

      const rerollLabel =
        snap.bloodDiceCurrent > 0
          ? `[${slot.rerollHotkey}] REROLL (1 DIE)`
          : `[${slot.rerollHotkey}] BLOOD TITHE (${snap.nextBloodTitheCost} VITAE)`;

      card.innerHTML = `
        <div class="altar-card-header">
          <span class="altar-rarity-badge">${perk.rarity}</span>
          <span class="altar-slot-key">[${slot.selectHotkey}] DRAFT</span>
        </div>
        <div class="altar-card-title">${perk.name}</div>
        <div class="altar-card-tags">${perk.tags.join(' • ')}</div>
        <div class="altar-card-desc">${perk.description}</div>
        <div class="altar-card-actions">
          <button class="altar-btn-draft" data-slot="${i}">[${slot.selectHotkey}] SELECT PERK</button>
          <div class="altar-sub-actions">
            <button class="altar-btn-reroll ${snap.bloodDiceCurrent === 0 ? 'tithe' : ''}" data-slot="${i}" ${isLocked ? 'disabled' : ''}>
              ${isLocked ? 'SLOT LOCKED' : rerollLabel}
            </button>
            <button class="altar-btn-lock" data-slot="${i}">
              ${isLocked ? 'UNLOCK' : 'PIN / LOCK'}
            </button>
          </div>
        </div>
      `;

      const draftBtn = card.querySelector('.altar-btn-draft');
      const rerollBtn = card.querySelector('.altar-btn-reroll');
      const lockBtn = card.querySelector('.altar-btn-lock');

      draftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleSelectSlot(i);
      });
      rerollBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleRerollSlot(i);
      });
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.altar.toggleLockSlot(i);
        this.renderAltar();
      });

      this.cardsContainerEl.appendChild(card);
    }
  }

  handleRerollSlot(slotIndex) {
    const res = this.altar.rerollSlot(slotIndex);
    this.renderAltar();
    return res;
  }

  handleSelectSlot(slotIndex) {
    const res = this.altar.selectSlot(slotIndex);
    this.renderAltar();
    if (res.selected && this.onCardDrafted) {
      this.onCardDrafted(res.perk);
    }
    return res;
  }
}
