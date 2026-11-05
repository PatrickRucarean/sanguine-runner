/**
 * SANGUINE_RUNNER — Phase 5: Autonomous Occult Familiars Engine (Zero Hotkey Micromanagement)
 * Implements Section 5.3.B of GAME_PLAN.md:
 *  1. Shadow Bats ("Nocturne Swarm"): Orbit player at R=2.2m, dive nearest enemy every 0.65s for 28 Occult DMG + 1 Bleed + 1 Blood Orb.
 *  2. Spectral Skulls ("Baskerville Eyes"): Hover over shoulders, fire hitscan Occult Eye-Beams every 0.9s.
 *  3. Blood Wolves ("Hounds of Baskerville"): Ground pack hunters (18.0 m/s) that bite highest-poise targets for 75 DMG + 45 Poise.
 */

import { Vec3 } from '../physics/Vec3.js';
import { HuskState, MAX_HUSKS } from '../combat/TargetHuskManager.js';

export class FamiliarSystem {
  /**
   * @param {Object} opts
   * @param {import('../combat/TargetHuskManager.js').TargetHuskManager} opts.huskManager
   * @param {import('../progression/ScalingEngine.js').ScalingEngine} opts.scaling
   * @param {import('../progression/BloodOrbManager.js').BloodOrbManager} [opts.bloodOrbs]
   * @param {import('../combat/VFXAndPoolManager.js').VFXAndPoolManager} [opts.vfx]
   * @param {any} [opts.THREE]
   * @param {any} [opts.scene]
   */
  constructor({
    huskManager,
    scaling,
    bloodOrbs = null,
    vfx = null,
    THREE = null,
    scene = null,
  }) {
    this.husks = huskManager;
    this.scaling = scaling;
    this.bloodOrbs = bloodOrbs;
    this.vfx = vfx;
    this.THREE = THREE;
    this.scene = scene;

    this.batCount = 0;
    this.skullCount = 0;
    this.wolfCount = 0;

    this.orbitAngle = 0.0;
    this.batCooldown = 0.0;
    this.skullCooldown = 0.0;
    this.wolfCooldown = 0.0;

    this.totalBatStrikes = 0;
    this.totalSkullBeams = 0;
    this.totalWolfBites = 0;
  }

  /**
   * Syncs familiar counts from drafted perks in `ScalingEngine`.
   */
  syncFromScaling() {
    if (!this.scaling) return;
    this.batCount = (this.scaling.getPerkStacks('nocturne_shadow_bats') || 0) * 2;
    this.skullCount = this.scaling.getPerkStacks('baskerville_spectral_skulls') || 0;
    this.wolfCount = this.scaling.getPerkStacks('hounds_of_baskerville') || 0;
  }

  /**
   * Steps all active autonomous familiars at 120Hz.
   */
  step(dt, playerPos) {
    this.syncFromScaling();
    if (!playerPos) return;

    this.orbitAngle += 3.2 * dt;
    const occultMult = this.scaling ? this.scaling.getOccultDamageMultiplier() : 1.0;

    // 1. Shadow Bats (Orbit at R=2.2m, y+1.4m; dive nearest enemy within 12m every 0.65s)
    if (this.batCount > 0) {
      this.batCooldown -= dt;
      if (this.batCooldown <= 0) {
        this.batCooldown = 0.65 / Math.max(1, this.batCount * 0.5);
        const targetIdx = this._findNearestEnemy(playerPos, 12.0);
        if (targetIdx >= 0) {
          this.totalBatStrikes++;
          this.husks.applyDamage(targetIdx, 28 * occultMult, 15, {
            isCrit: false,
            addBleedStacks: 1,
            bleedDurationSec: 4.0,
          });
          if (this.bloodOrbs) {
            this.bloodOrbs.spawnOrb(playerPos.x, playerPos.y + 1.0, playerPos.z, 2);
          }
        }
      }
    }

    // 2. Spectral Skulls (Hover over shoulders; fire Occult Eye-Beams every 0.9s)
    if (this.skullCount > 0) {
      this.skullCooldown -= dt;
      if (this.skullCooldown <= 0) {
        this.skullCooldown = 0.9 / Math.max(1, this.skullCount);
        const targetIdx = this._findNearestEnemy(playerPos, 28.0);
        if (targetIdx >= 0) {
          this.totalSkullBeams++;
          const start = new Vec3(playerPos.x + 0.45, playerPos.y + 1.75, playerPos.z);
          const end = new Vec3(
            this.husks.posX[targetIdx],
            this.husks.posY[targetIdx] + 1.4,
            this.husks.posZ[targetIdx]
          );
          if (this.vfx) {
            this.vfx.spawnTracer(start, end, 0x9d00ff, 0.14);
          }
          this.husks.applyDamage(targetIdx, 45 * occultMult, 25, {
            isCrit: true,
          });
        }
      }
    }

    // 3. Blood Wolves (Ground Pack Hunters; bite highest-poise target within 28m for 75 DMG + 45 Poise)
    if (this.wolfCount > 0) {
      this.wolfCooldown -= dt;
      if (this.wolfCooldown <= 0) {
        this.wolfCooldown = 1.0 / Math.max(1, this.wolfCount);
        const targetIdx = this._findHighestPoiseEnemy(playerPos, 28.0);
        if (targetIdx >= 0) {
          this.totalWolfBites++;
          this.husks.applyDamage(targetIdx, 75 * occultMult, 45, {
            isCrit: true,
            causeGibsOnKill: true,
          });
          // Hold enemy in place briefly
          this.husks.velX[targetIdx] = 0;
          this.husks.velZ[targetIdx] = 0;
        }
      }
    }
  }

  _findNearestEnemy(playerPos, maxRadius) {
    let bestIdx = -1;
    let bestDistSq = maxRadius * maxRadius;
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - playerPos.x;
      const dz = this.husks.posZ[i] - playerPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  _findHighestPoiseEnemy(playerPos, maxRadius) {
    let bestIdx = -1;
    let bestPoise = -1;
    const rSq = maxRadius * maxRadius;
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - playerPos.x;
      const dz = this.husks.posZ[i] - playerPos.z;
      if (dx * dx + dz * dz > rSq) continue;
      if (this.husks.poise[i] > bestPoise) {
        bestPoise = this.husks.poise[i];
        bestIdx = i;
      }
    }
    return bestIdx;
  }
}
