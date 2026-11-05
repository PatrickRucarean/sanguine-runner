/**
 * SANGUINE_RUNNER — Phase 5: Autonomous Occult Familiars Engine (Zero Hotkey Micromanagement)
 * Implements Section 5.3.B of GAME_PLAN.md with 3D Pooled `THREE.InstancedMesh` Visuals:
 *  1. Shadow Bats ("Nocturne Swarm"): Orbit player at R=2.2m, y+1.4m; dive nearest enemy every 0.65s for 28 Occult DMG + 1 Bleed + 1 Blood Orb.
 *  2. Spectral Skulls ("Baskerville Eyes"): Hover over shoulders with spring-lag follow; fire hitscan Occult Eye-Beams every 0.9s.
 *  3. Blood Wolves ("Hounds of Baskerville"): Ground pack hunters (18.0 m/s) that physically pursue and bite highest-poise targets for 75 DMG + 45 Poise.
 */

import { Vec3 } from '../physics/Vec3.js';
import { HuskState, MAX_HUSKS } from '../combat/TargetHuskManager.js';

export const MAX_BATS = 8;
export const MAX_SKULLS = 6;
export const MAX_WOLVES = 6;

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

    // Ground Pack-Hunter Blood Wolves physical positions & velocities
    this.wolfPosX = new Float32Array(MAX_WOLVES);
    this.wolfPosY = new Float32Array(MAX_WOLVES);
    this.wolfPosZ = new Float32Array(MAX_WOLVES);
    this.wolfYaw = new Float32Array(MAX_WOLVES);
    this.wolfInitialized = new Uint8Array(MAX_WOLVES);

    // Telemetry
    this.totalBatStrikes = 0;
    this.totalSkullBeams = 0;
    this.totalWolfBites = 0;

    if (this.THREE && this.scene) {
      this._initInstancedMeshes();
    }
  }

  _initInstancedMeshes() {
    const THREE = this.THREE;
    this._dummy = new THREE.Object3D();

    // 1. Shadow Bats InstancedMesh (Abyssal Violet winged diamond)
    const batGeo = new THREE.OctahedronGeometry(0.24, 0);
    batGeo.scale(1.8, 0.45, 0.9);
    const batMat = new THREE.MeshBasicMaterial({ color: 0x9d00ff });
    this.batMesh = new THREE.InstancedMesh(batGeo, batMat, MAX_BATS);
    this.batMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.batMesh.frustumCulled = false;

    // 2. Spectral Skulls InstancedMesh (Occult Gold & Violet cranium)
    const skullGeo = new THREE.OctahedronGeometry(0.22, 0);
    const skullMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.skullMesh = new THREE.InstancedMesh(skullGeo, skullMat, MAX_SKULLS);
    this.skullMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skullMesh.frustumCulled = false;

    // 3. Blood Wolves InstancedMesh (Arterial Crimson low-poly hound body)
    const wolfGeo = new THREE.BoxGeometry(0.42, 0.48, 0.95);
    const wolfMat = new THREE.MeshLambertMaterial({
      color: 0xe60012,
      flatShading: true,
    });
    this.wolfMesh = new THREE.InstancedMesh(wolfGeo, wolfMat, MAX_WOLVES);
    this.wolfMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wolfMesh.frustumCulled = false;

    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < MAX_BATS; i++) this.batMesh.setMatrixAt(i, this._dummy.matrix);
    for (let i = 0; i < MAX_SKULLS; i++) this.skullMesh.setMatrixAt(i, this._dummy.matrix);
    for (let i = 0; i < MAX_WOLVES; i++) this.wolfMesh.setMatrixAt(i, this._dummy.matrix);

    this.scene.add(this.batMesh, this.skullMesh, this.wolfMesh);
  }

  /**
   * Syncs familiar counts from drafted perks in `ScalingEngine`.
   */
  syncFromScaling() {
    if (!this.scaling) return;
    this.batCount = Math.min(
      MAX_BATS,
      (this.scaling.getPerkStacks('nocturne_shadow_bats') || 0) * 2
    );
    this.skullCount = Math.min(
      MAX_SKULLS,
      this.scaling.getPerkStacks('baskerville_spectral_skulls') || 0
    );
    this.wolfCount = Math.min(
      MAX_WOLVES,
      this.scaling.getPerkStacks('hounds_of_baskerville') || 0
    );
  }

  /**
   * Steps all active autonomous familiars at 120Hz.
   */
  step(dt, playerPos, playerYaw = 0) {
    this.syncFromScaling();
    if (!playerPos) return;

    this.orbitAngle += 3.6 * dt;
    const occultMult = this.scaling ? this.scaling.getOccultDamageMultiplier() : 1.0;

    // 1. Shadow Bats (Orbit at R=2.2m, y+1.4m; dive nearest enemy within 12m every 0.65s)
    if (this.batCount > 0) {
      this.batCooldown -= dt;
      if (this.batCooldown <= 0) {
        this.batCooldown = 0.65 / Math.max(1, this.batCount * 0.5);
        const targetIdx = this._findNearestEnemy(playerPos, 12.0);
        if (targetIdx >= 0) {
          this.totalBatStrikes++;
          if (this.vfx) {
            const batOrigin = new Vec3(
              playerPos.x + Math.cos(this.orbitAngle) * 2.2,
              playerPos.y + 1.4,
              playerPos.z + Math.sin(this.orbitAngle) * 2.2
            );
            const targetPt = new Vec3(
              this.husks.posX[targetIdx],
              this.husks.posY[targetIdx] + 1.2,
              this.husks.posZ[targetIdx]
            );
            this.vfx.spawnTracer(batOrigin, targetPt, 0x9d00ff, 0.10);
          }
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

    // 3. Blood Wolves (Ground Pack Hunters at 18.0 m/s; hunt & bite highest-poise target within 28m)
    if (this.wolfCount > 0) {
      const targetIdx = this._findHighestPoiseEnemy(playerPos, 28.0);
      for (let w = 0; w < this.wolfCount; w++) {
        if (!this.wolfInitialized[w]) {
          this.wolfInitialized[w] = 1;
          this.wolfPosX[w] = playerPos.x + (w % 2 === 0 ? -1.8 : 1.8);
          this.wolfPosY[w] = playerPos.y;
          this.wolfPosZ[w] = playerPos.z - 1.5;
        }

        const goalX =
          targetIdx >= 0
            ? this.husks.posX[targetIdx]
            : playerPos.x + Math.cos(this.orbitAngle + w * 2.1) * 3.0;
        const goalZ =
          targetIdx >= 0
            ? this.husks.posZ[targetIdx]
            : playerPos.z + Math.sin(this.orbitAngle + w * 2.1) * 3.0;

        const dx = goalX - this.wolfPosX[w];
        const dz = goalZ - this.wolfPosZ[w];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.6) {
          const stepDist = Math.min(dist, 18.0 * dt);
          this.wolfPosX[w] += (dx / dist) * stepDist;
          this.wolfPosZ[w] += (dz / dist) * stepDist;
          this.wolfYaw[w] = Math.atan2(dx, dz);
        }
        this.wolfPosY[w] = Math.max(0, playerPos.y);
      }

      this.wolfCooldown -= dt;
      if (this.wolfCooldown <= 0 && targetIdx >= 0) {
        this.wolfCooldown = 1.0 / Math.max(1, this.wolfCount);
        this.totalWolfBites++;
        this.husks.applyDamage(targetIdx, 75 * occultMult, 45, {
          isCrit: true,
          causeGibsOnKill: true,
        });
        this.husks.velX[targetIdx] = 0;
        this.husks.velZ[targetIdx] = 0;
      }
    }

    this._syncVisualInstances(playerPos, playerYaw);
  }

  _syncVisualInstances(playerPos, playerYaw) {
    if (!this.batMesh || !this.skullMesh || !this.wolfMesh) return;

    // 1. Update Orbiting Shadow Bats
    for (let i = 0; i < MAX_BATS; i++) {
      if (i >= this.batCount) {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.batMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      const phi = this.orbitAngle + (2.0 * Math.PI * i) / Math.max(1, this.batCount);
      const bx = playerPos.x + Math.cos(phi) * 2.2;
      const by = playerPos.y + 1.4 + Math.sin(phi * 3.0) * 0.18;
      const bz = playerPos.z + Math.sin(phi) * 2.2;
      this._dummy.position.set(bx, by, bz);
      this._dummy.rotation.set(0, -phi, Math.sin(this.orbitAngle * 5.0 + i) * 0.35);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.batMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.batMesh.instanceMatrix.needsUpdate = true;

    // 2. Update Shoulder-Hovering Spectral Skulls
    for (let i = 0; i < MAX_SKULLS; i++) {
      if (i >= this.skullCount) {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.skullMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      const side = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2);
      const offsetAngle = playerYaw + side * 0.85;
      const sx = playerPos.x + Math.sin(offsetAngle) * (0.95 + tier * 0.35);
      const sy = playerPos.y + 1.75 + tier * 0.25 + Math.cos(this.orbitAngle * 2.0 + i) * 0.08;
      const sz = playerPos.z + Math.cos(offsetAngle) * (0.95 + tier * 0.35);
      this._dummy.position.set(sx, sy, sz);
      this._dummy.rotation.set(0, playerYaw, 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.skullMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.skullMesh.instanceMatrix.needsUpdate = true;

    // 3. Update Ground Pack-Hunter Blood Wolves
    for (let i = 0; i < MAX_WOLVES; i++) {
      if (i >= this.wolfCount) {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.wolfMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      const bounceY = Math.abs(Math.sin(this.orbitAngle * 4.5 + i)) * 0.22;
      this._dummy.position.set(
        this.wolfPosX[i],
        this.wolfPosY[i] + 0.28 + bounceY,
        this.wolfPosZ[i]
      );
      this._dummy.rotation.set(0, this.wolfYaw[i], 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.wolfMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.wolfMesh.instanceMatrix.needsUpdate = true;
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
