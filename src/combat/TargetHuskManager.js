/**
 * SANGUINE_RUNNER — Object-Pooled Swarm Enemy & Husk Manager
 * Implements:
 *  - 6 Gothic Archetypes (Thrall Husk, Feral Nightstalker, Hemomancer Acolyte,
 *    Censer Zealot, Iron Inquisitor with Armor Shield, Cathedral Executioner Boss)
 *  - Crimson Elite variants (Danger 1-5)
 *  - 2D Spatial Hash Grid + Interleaved Boid Flocking (1/4 ticks per agent)
 *  - Poise/Stagger, Living Bowling-Ball Physics, Hemorrhage Bleed, Silver Brand
 *  - Pooled Enemy Projectiles (Crimson Orbs) with Frontal Parry Deflection support
 */

import { Vec3, clamp } from '../physics/Vec3.js';

export const MAX_HUSKS = 48;
export const MAX_ENEMY_PROJECTILES = 64;

export const HuskState = Object.freeze({
  DEAD: 0,
  ACTIVE: 1,
  STAGGERED: 2,
  BOWLING_BALL: 3,
});

export const EnemyArchetype = Object.freeze({
  THRALL_HUSK: 0,
  FERAL_NIGHTSTALKER: 1,
  HEMOMANCER_ACOLYTE: 2,
  CENSER_ZEALOT: 3,
  IRON_INQUISITOR: 4,
  CATHEDRAL_EXECUTIONER: 5,
});

export const ArchetypeStats = Object.freeze({
  [EnemyArchetype.THRALL_HUSK]: {
    name: 'Thrall Husk',
    cost: 3,
    minWave: 1,
    baseHp: 40,
    speed: 6.5,
    poise: 20,
    scale: 1.0,
    vitaeDrop: 3,
    hasArmor: false,
  },
  [EnemyArchetype.FERAL_NIGHTSTALKER]: {
    name: 'Feral Nightstalker',
    cost: 7,
    minWave: 2,
    baseHp: 65,
    speed: 13.0,
    poise: 30,
    scale: 0.92,
    vitaeDrop: 6,
    hasArmor: false,
  },
  [EnemyArchetype.HEMOMANCER_ACOLYTE]: {
    name: 'Hemomancer Acolyte',
    cost: 10,
    minWave: 3,
    baseHp: 85,
    speed: 5.0,
    poise: 35,
    scale: 1.05,
    vitaeDrop: 8,
    hasArmor: false,
    rangedIntervalSec: 2.6,
  },
  [EnemyArchetype.CENSER_ZEALOT]: {
    name: 'Censer Zealot',
    cost: 16,
    minWave: 5,
    baseHp: 150,
    speed: 6.0,
    poise: 60,
    scale: 1.15,
    vitaeDrop: 12,
    hasArmor: false,
  },
  [EnemyArchetype.IRON_INQUISITOR]: {
    name: 'Iron Inquisitor',
    cost: 25,
    minWave: 6,
    baseHp: 320,
    speed: 7.8,
    poise: 110,
    scale: 1.28,
    vitaeDrop: 18,
    hasArmor: true,
  },
  [EnemyArchetype.CATHEDRAL_EXECUTIONER]: {
    name: 'Cathedral Executioner',
    cost: 55,
    minWave: 8,
    baseHp: 850,
    speed: 7.2,
    poise: 240,
    scale: 1.65,
    vitaeDrop: 45,
    hasArmor: true,
    rangedIntervalSec: 3.0,
  },
});

const SPATIAL_CELL_SIZE = 4.0;

export class TargetHuskManager {
  /**
   * @param {Object} opts
   * @param {import('./VFXAndPoolManager.js').VFXAndPoolManager} opts.vfx
   * @param {import('../audio/AudioManager.js').AudioManager} opts.audio
   * @param {any} [opts.THREE] Optional Three.js namespace
   * @param {any} [opts.scene] Optional Three.js Scene
   * @param {Function} [opts.onEnemyKilled] Optional callback when enemy dies
   * @param {Function} [opts.onPlayerDamaged] Optional callback when player takes hit
   */
  constructor({
    vfx,
    audio,
    THREE = null,
    scene = null,
    onEnemyKilled = null,
    onPlayerDamaged = null,
  } = {}) {
    this.vfx = vfx;
    this.audio = audio;
    this.THREE = THREE;
    this.scene = scene;
    this.onEnemyKilled = onEnemyKilled;
    this.onPlayerDamaged = onPlayerDamaged;

    // =========================================================================
    // Struct-of-Arrays (SoA) Pre-Allocated Husk Pool (Zero Runtime Allocation)
    // =========================================================================
    this.state = new Uint8Array(MAX_HUSKS);
    this.archetype = new Uint8Array(MAX_HUSKS);
    this.isElite = new Uint8Array(MAX_HUSKS);
    this.hasArmorShield = new Uint8Array(MAX_HUSKS);

    this.posX = new Float32Array(MAX_HUSKS);
    this.posY = new Float32Array(MAX_HUSKS);
    this.posZ = new Float32Array(MAX_HUSKS);
    this.spawnX = new Float32Array(MAX_HUSKS);
    this.spawnY = new Float32Array(MAX_HUSKS);
    this.spawnZ = new Float32Array(MAX_HUSKS);
    this.velX = new Float32Array(MAX_HUSKS);
    this.velY = new Float32Array(MAX_HUSKS);
    this.velZ = new Float32Array(MAX_HUSKS);
    this.yaw = new Float32Array(MAX_HUSKS);

    // Cached Interleaved Boid Separation Vector (updated once every 4 ticks per husk!)
    this.sepX = new Float32Array(MAX_HUSKS);
    this.sepZ = new Float32Array(MAX_HUSKS);

    // Combat Stats & Timers
    this.hp = new Float32Array(MAX_HUSKS);
    this.maxHp = new Float32Array(MAX_HUSKS);
    this.poise = new Float32Array(MAX_HUSKS);
    this.maxPoise = new Float32Array(MAX_HUSKS);
    this.moveSpeed = new Float32Array(MAX_HUSKS);
    this.damageMult = new Float32Array(MAX_HUSKS);
    this.staggerTimer = new Float32Array(MAX_HUSKS);
    this.bowlingTimer = new Float32Array(MAX_HUSKS);
    this.respawnTimer = new Float32Array(MAX_HUSKS);
    this.attackCooldown = new Float32Array(MAX_HUSKS);

    // Status Effects (Silver Brand & Hemorrhage Bleed)
    this.silverBrandTimer = new Float32Array(MAX_HUSKS);
    this.bleedStacks = new Uint16Array(MAX_HUSKS);
    this.bleedDuration = new Float32Array(MAX_HUSKS);
    this.bleedTickAccum = new Float32Array(MAX_HUSKS);
    this.hitFlashTimer = new Float32Array(MAX_HUSKS);

    // =========================================================================
    // Pooled Enemy Projectiles (Crimson Orbs — Parryable by Alucard Sword!)
    // =========================================================================
    this.projActive = new Uint8Array(MAX_ENEMY_PROJECTILES);
    this.projDeflected = new Uint8Array(MAX_ENEMY_PROJECTILES);
    this.projX = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projY = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projZ = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projVX = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projVY = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projVZ = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projDamage = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projLife = new Float32Array(MAX_ENEMY_PROJECTILES);
    this.projCursor = 0;

    // 2D Spatial Hash Grid Map (cellKey -> array of husk indices)
    this.spatialGrid = new Map();
    this.tickCounter = 0;
    this.aiPursuitEnabled = true;
    this.autoRespawn = true; // Set false when WaveDirector manages spawns
    this.bleedTickIntervalSec = 0.25;

    // Telemetry
    this.totalKills = 0;
    this.totalGibKills = 0;
    this.totalBowlingStrikes = 0;
    this.totalArmorShatters = 0;
    this.totalParriedProjectiles = 0;
    this.interleavedBoidQueriesLastTick = 0;

    if (this.THREE && this.scene) {
      this._initInstancedMeshes();
    }
  }

  _initInstancedMeshes() {
    const THREE = this.THREE;
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();

    // 1. Brutalist Gothic Husk Torso (Low-Poly Tapered Pillar/Armor)
    const bodyGeo = new THREE.CylinderGeometry(0.34, 0.44, 1.32, 6);
    const bodyMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
    });
    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_HUSKS);
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.frustumCulled = false;

    // 2. Husk Head / Cranium Weakpoint (Octahedron Skull)
    const headGeo = new THREE.OctahedronGeometry(0.30, 0);
    const headMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
    });
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, MAX_HUSKS);
    this.headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.headMesh.frustumCulled = false;

    // 3. Pooled Enemy Projectile Mesh (Crimson / Gold Deflected Orbs)
    const projGeo = new THREE.OctahedronGeometry(0.24, 0);
    const projMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projMesh = new THREE.InstancedMesh(projGeo, projMat, MAX_ENEMY_PROJECTILES);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;

    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < MAX_HUSKS; i++) {
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);
      this.headMesh.setMatrixAt(i, this._dummy.matrix);
      this.bodyMesh.setColorAt(i, new THREE.Color(0x5a1822));
      this.headMesh.setColorAt(i, new THREE.Color(0xd8cfc4));
    }
    for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) {
      this.projMesh.setMatrixAt(i, this._dummy.matrix);
      this.projMesh.setColorAt(i, new THREE.Color(0xff3b00));
    }

    this.scene.add(this.bodyMesh);
    this.scene.add(this.headMesh);
    this.scene.add(this.projMesh);
  }

  /**
   * Returns an available dead slot index, or -1 if at cap.
   */
  findFreeSlot() {
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) return i;
    }
    return -1;
  }

  /**
   * Count of currently alive enemies.
   */
  getActiveCount() {
    let c = 0;
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] !== HuskState.DEAD) c++;
    }
    return c;
  }

  /**
   * Spawns or resets a husk in a specific slot.
   */
  spawnHusk(
    index,
    x,
    y,
    z,
    {
      maxHp = 110,
      maxPoise = 65,
      moveSpeed = 5.2,
      archetype = EnemyArchetype.THRALL_HUSK,
      isElite = false,
      hasArmorShield = false,
      damageMult = 1.0,
    } = {}
  ) {
    if (index < 0 || index >= MAX_HUSKS) return -1;
    const archCfg = ArchetypeStats[archetype] || ArchetypeStats[EnemyArchetype.THRALL_HUSK];

    this.state[index] = HuskState.ACTIVE;
    this.archetype[index] = archetype;
    this.isElite[index] = isElite ? 1 : 0;
    this.hasArmorShield[index] = hasArmorShield || archCfg.hasArmor ? 1 : 0;

    this.posX[index] = x;
    this.posY[index] = y;
    this.posZ[index] = z;
    this.spawnX[index] = x;
    this.spawnY[index] = y;
    this.spawnZ[index] = z;
    this.velX[index] = 0;
    this.velY[index] = 0;
    this.velZ[index] = 0;
    this.sepX[index] = 0;
    this.sepZ[index] = 0;
    this.hp[index] = maxHp;
    this.maxHp[index] = maxHp;
    this.poise[index] = maxPoise;
    this.maxPoise[index] = maxPoise;
    this.moveSpeed[index] = moveSpeed;
    this.damageMult[index] = damageMult;
    this.staggerTimer[index] = 0;
    this.bowlingTimer[index] = 0;
    this.respawnTimer[index] = 0;
    this.attackCooldown[index] = 1.2 + (index % 5) * 0.3;
    this.silverBrandTimer[index] = 0;
    this.bleedStacks[index] = 0;
    this.bleedDuration[index] = 0;
    this.bleedTickAccum[index] = 0;
    this.hitFlashTimer[index] = 0;
    return index;
  }

  /**
   * Spawns a pooled enemy projectile (Crimson Orb).
   */
  spawnEnemyProjectile(x, y, z, vx, vy, vz, damage = 18, isDeflected = false) {
    const idx = this.projCursor;
    this.projCursor = (this.projCursor + 1) % MAX_ENEMY_PROJECTILES;

    this.projActive[idx] = 1;
    this.projDeflected[idx] = isDeflected ? 1 : 0;
    this.projX[idx] = x;
    this.projY[idx] = y;
    this.projZ[idx] = z;
    this.projVX[idx] = vx;
    this.projVY[idx] = vy;
    this.projVZ[idx] = vz;
    this.projDamage[idx] = damage;
    this.projLife[idx] = 4.0;
    return idx;
  }

  /**
   * Deflects all frontal enemy projectiles within `radius` and `coneDeg` back along `aimDir`
   * at `returnDamageMult` (used by Alucard Sword RMB Crimson Parry!).
   */
  deflectProjectilesInCone(origin, aimDir, radius = 4.2, coneDeg = 130.0, returnDamageMult = 4.0) {
    const minCos = Math.cos((coneDeg * 0.5 * Math.PI) / 180.0);
    let deflectedCount = 0;

    for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) {
      if (!this.projActive[i] || this.projDeflected[i]) continue;
      const dx = this.projX[i] - origin.x;
      const dy = this.projY[i] - origin.y;
      const dz = this.projZ[i] - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;

      if (dist > 0.25) {
        const cos = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / dist;
        if (cos < minCos) continue;
      }

      const speed = Math.max(36.0, Math.hypot(this.projVX[i], this.projVY[i], this.projVZ[i]) * 1.65);
      this.projDeflected[i] = 1;
      this.projVX[i] = aimDir.x * speed;
      this.projVY[i] = aimDir.y * speed;
      this.projVZ[i] = aimDir.z * speed;
      this.projDamage[i] *= returnDamageMult;
      this.projLife[i] = 3.5;
      deflectedCount++;
      this.totalParriedProjectiles++;
    }

    return deflectedCount;
  }

  /**
   * Populates the Courtyard & Arena with tactical packs of Thrall Husks for combat testing.
   */
  populateArenaWave() {
    let idx = 0;
    const courtyardCoords = [
      [0, 0, 5],
      [-2.2, 0, 3.5],
      [2.2, 0, 3.5],
      [-1.1, 0, 1.5],
      [1.1, 0, 1.5],
      [0, 0, 1.5],
      [-6.5, 0, 6],
      [6.5, 0, 6],
      [-8.5, 0, 4],
      [8.5, 0, 4],
      [-8, 0, -9],
      [8, 0, -9],
      [0, 0, -11],
      [-2.5, 0, -12],
      [2.5, 0, -12],
      [-10, 0, -18],
      [10, 0, -18],
      [0, 0, -20],
    ];
    for (const [x, y, z] of courtyardCoords) {
      if (idx < MAX_HUSKS) {
        const isInq = idx === 5 || idx === 12;
        const isHemo = idx === 8 || idx === 9;
        this.spawnHusk(idx++, x, y, z, {
          maxHp: isInq ? 260 : 110,
          maxPoise: isInq ? 100 : 60,
          moveSpeed: 4.5,
          archetype: isInq
            ? EnemyArchetype.IRON_INQUISITOR
            : isHemo
            ? EnemyArchetype.HEMOMANCER_ACOLYTE
            : EnemyArchetype.THRALL_HUSK,
          hasArmorShield: isInq,
        });
      }
    }

    for (let row = 0; row < 5; row++) {
      for (let col = -1; col <= 1; col++) {
        if (idx < MAX_HUSKS) {
          this.spawnHusk(idx++, col * 2.8, 0, 44 + row * 6.5, {
            maxHp: 95,
            maxPoise: 50,
            moveSpeed: 5.8,
          });
        }
      }
    }
  }

  _cellKey(x, z) {
    const cx = Math.floor(x / SPATIAL_CELL_SIZE);
    const cz = Math.floor(z / SPATIAL_CELL_SIZE);
    return (cx << 16) ^ (cz & 0xffff);
  }

  _rebuildSpatialGrid() {
    this.spatialGrid.clear();
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) continue;
      const key = this._cellKey(this.posX[i], this.posZ[i]);
      let bucket = this.spatialGrid.get(key);
      if (!bucket) {
        bucket = [];
        this.spatialGrid.set(key, bucket);
      }
      bucket.push(i);
    }
  }

  /**
   * Computes lightweight boid separation for husk `idx` by querying only its 3x3 neighboring spatial cells.
   */
  _computeBoidSeparation(idx) {
    const px = this.posX[idx];
    const pz = this.posZ[idx];
    const baseCx = Math.floor(px / SPATIAL_CELL_SIZE);
    const baseCz = Math.floor(pz / SPATIAL_CELL_SIZE);
    const minSepDist = 1.45;
    const minSepSq = minSepDist * minSepDist;

    let sx = 0;
    let sz = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = ((baseCx + dx) << 16) ^ ((baseCz + dz) & 0xffff);
        const bucket = this.spatialGrid.get(key);
        if (!bucket) continue;

        for (let b = 0; b < bucket.length; b++) {
          const other = bucket[b];
          if (other === idx || this.state[other] === HuskState.DEAD) continue;

          const ox = px - this.posX[other];
          const oz = pz - this.posZ[other];
          const distSq = ox * ox + oz * oz;
          if (distSq > 1e-5 && distSq < minSepSq) {
            const dist = Math.sqrt(distSq);
            const push = (minSepDist - dist) / minSepDist;
            sx += (ox / dist) * push * 5.5;
            sz += (oz / dist) * push * 5.5;
          }
        }
      }
    }

    this.sepX[idx] = sx;
    this.sepZ[idx] = sz;
  }

  /**
   * Steps all active husks and enemy projectiles at 120Hz.
   * @param {number} dt
   * @param {Vec3} playerPos
   */
  step(dt, playerPos) {
    this.tickCounter++;
    this._rebuildSpatialGrid();

    const interleavedGroup = this.tickCounter & 3; // 0, 1, 2, or 3 (updates 25% of swarm per tick)
    let boidQueries = 0;

    for (let i = 0; i < MAX_HUSKS; i++) {
      const st = this.state[i];

      // Handle Dead Husk Respawn Timer (if autoRespawn enabled)
      if (st === HuskState.DEAD) {
        if (this.autoRespawn && this.respawnTimer[i] > 0) {
          this.respawnTimer[i] -= dt;
          if (this.respawnTimer[i] <= 0) {
            this.spawnHusk(i, this.spawnX[i], this.spawnY[i], this.spawnZ[i], {
              maxHp: this.maxHp[i],
              maxPoise: this.maxPoise[i],
              moveSpeed: this.moveSpeed[i],
              archetype: this.archetype[i],
              isElite: this.isElite[i] === 1,
            });
          }
        }
        continue;
      }

      if (this.hitFlashTimer[i] > 0) this.hitFlashTimer[i] = Math.max(0, this.hitFlashTimer[i] - dt);
      if (this.silverBrandTimer[i] > 0) this.silverBrandTimer[i] = Math.max(0, this.silverBrandTimer[i] - dt);

      // Process Hemorrhage Bleed Ticks (batched into a single growing damage number!)
      if (this.bleedStacks[i] > 0 && this.bleedDuration[i] > 0) {
        this.bleedDuration[i] -= dt;
        this.bleedTickAccum[i] += dt;
        if (this.bleedTickAccum[i] >= this.bleedTickIntervalSec) {
          this.bleedTickAccum[i] -= this.bleedTickIntervalSec;
          const bleedDmg = this.bleedStacks[i] * 3.0;
          this.applyDamage(i, bleedDmg, 0, {
            isCrit: false,
            isBleed: true,
            causeGibsOnKill: this.bleedStacks[i] >= 4,
          });
          if (this.state[i] === HuskState.DEAD) continue;
        }
        if (this.bleedDuration[i] <= 0) {
          this.bleedStacks[i] = 0;
        }
      }

      // Handle STAGGERED state
      if (st === HuskState.STAGGERED) {
        this.staggerTimer[i] -= dt;
        this.velX[i] *= Math.max(0, 1.0 - 8.0 * dt);
        this.velZ[i] *= Math.max(0, 1.0 - 8.0 * dt);
        this.posX[i] += this.velX[i] * dt;
        this.posZ[i] += this.velZ[i] * dt;

        if (this.staggerTimer[i] <= 0) {
          this.state[i] = HuskState.ACTIVE;
          this.poise[i] = this.maxPoise[i];
        }
        continue;
      }

      // Handle BOWLING_BALL state (launched by Slide Blood-Kick!)
      if (st === HuskState.BOWLING_BALL) {
        this.bowlingTimer[i] -= dt;
        this.posX[i] += this.velX[i] * dt;
        this.posZ[i] += this.velZ[i] * dt;

        this._checkBowlingCollisions(i);

        if (this.bowlingTimer[i] <= 0) {
          this.state[i] = HuskState.STAGGERED;
          this.staggerTimer[i] = 1.5;
          this.velX[i] = 0;
          this.velZ[i] = 0;
        }
        continue;
      }

      // ACTIVE Melee Swarm Pursuit + Interleaved Boid Flocking
      if ((i & 3) === interleavedGroup) {
        this._computeBoidSeparation(i);
        boidQueries++;
      }

      if (this.aiPursuitEnabled && playerPos) {
        const dx = playerPos.x - this.posX[i];
        const dz = playerPos.z - this.posZ[i];
        const dist = Math.hypot(dx, dz);
        const arch = this.archetype[i];

        // Ranged Hemomancer / Cathedral Executioner fires Crimson Orbs
        if (
          (arch === EnemyArchetype.HEMOMANCER_ACOLYTE ||
            arch === EnemyArchetype.CATHEDRAL_EXECUTIONER) &&
          dist < 34.0
        ) {
          this.attackCooldown[i] -= dt;
          if (this.attackCooldown[i] <= 0) {
            this.attackCooldown[i] = arch === EnemyArchetype.CATHEDRAL_EXECUTIONER ? 2.4 : 2.8;
            const dy = (playerPos.y + 1.2) - (this.posY[i] + 1.4);
            const len3 = Math.hypot(dx, dy, dz) || 1.0;
            const orbSpd = 22.0;
            this.spawnEnemyProjectile(
              this.posX[i],
              this.posY[i] + 1.4,
              this.posZ[i],
              (dx / len3) * orbSpd,
              (dy / len3) * orbSpd,
              (dz / len3) * orbSpd,
              14 * (this.damageMult[i] || 1.0),
              false
            );
          }
        }

        const preferredMinDist = arch === EnemyArchetype.HEMOMANCER_ACOLYTE ? 12.0 : 1.35;

        if (dist > preferredMinDist && dist < 32.0) {
          const dirX = dx / dist;
          const dirZ = dz / dist;
          const spd = this.moveSpeed[i];
          this.velX[i] = dirX * spd + this.sepX[i];
          this.velZ[i] = dirZ * spd + this.sepZ[i];
          this.yaw[i] = Math.atan2(dirX, dirZ);
        } else {
          this.velX[i] = this.sepX[i];
          this.velZ[i] = this.sepZ[i];
        }

        this.posX[i] = clamp(this.posX[i] + this.velX[i] * dt, -32, 32);
        this.posZ[i] = clamp(this.posZ[i] + this.velZ[i] * dt, -30, 135);
      }
    }

    this._stepEnemyProjectiles(dt, playerPos);

    this.interleavedBoidQueriesLastTick = boidQueries;
    this._syncVisualInstances();
  }

  _stepEnemyProjectiles(dt, playerPos) {
    for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) {
      if (!this.projActive[i]) continue;
      this.projLife[i] -= dt;
      if (this.projLife[i] <= 0) {
        this.projActive[i] = 0;
        continue;
      }

      this.projX[i] += this.projVX[i] * dt;
      this.projY[i] += this.projVY[i] * dt;
      this.projZ[i] += this.projVZ[i] * dt;

      if (this.projDeflected[i]) {
        // Deflected projectile hits enemies for 400% damage!
        for (let h = 0; h < MAX_HUSKS; h++) {
          if (this.state[h] === HuskState.DEAD) continue;
          const dx = this.posX[h] - this.projX[i];
          const dy = (this.posY[h] + 1.1) - this.projY[i];
          const dz = this.posZ[h] - this.projZ[i];
          if (dx * dx + dy * dy + dz * dz <= 1.2 * 1.2) {
            this.projActive[i] = 0;
            this.applyDamage(h, this.projDamage[i], 85, {
              isCrit: true,
              causeGibsOnKill: true,
              shatterArmor: true,
            });
            break;
          }
        }
      } else if (playerPos) {
        // Enemy projectile checks hit against player
        const dx = playerPos.x - this.projX[i];
        const dy = (playerPos.y + 1.1) - this.projY[i];
        const dz = playerPos.z - this.projZ[i];
        if (dx * dx + dy * dy + dz * dz <= 0.85 * 0.85) {
          this.projActive[i] = 0;
          if (this.onPlayerDamaged) {
            this.onPlayerDamaged(this.projDamage[i]);
          }
        }
      }
    }
  }

  _checkBowlingCollisions(bowlingIdx) {
    const bx = this.posX[bowlingIdx];
    const bz = this.posZ[bowlingIdx];
    const radiusSq = 1.55 * 1.55;

    for (let j = 0; j < MAX_HUSKS; j++) {
      if (j === bowlingIdx || this.state[j] === HuskState.DEAD) continue;
      const dx = this.posX[j] - bx;
      const dz = this.posZ[j] - bz;
      if (dx * dx + dz * dz <= radiusSq) {
        this.totalBowlingStrikes++;
        this.applyDamage(j, 115, 100, {
          isCrit: true,
          causeGibsOnKill: true,
          shatterArmor: true,
          knockbackDir: new Vec3(dx, 0.2, dz).normalize(),
        });
      }
    }
  }

  /**
   * Applies damage, poise damage, armor shatter, bleed stacks, and checks for Stagger Break,
   * Silver-Brand Mercury Detonation, and Low-Poly Gib Dismemberment.
   */
  applyDamage(
    idx,
    damage,
    poiseDamage = 0,
    {
      isCrit = false,
      isBleed = false,
      isExecution = false,
      causeGibsOnKill = false,
      applySilverBrandSec = 0,
      triggerMercuryDetonation = false,
      addBleedStacks = 0,
      bleedDurationSec = 4.0,
      shatterArmor = false,
      isPiercing = false,
      knockbackDir = null,
      knockbackImpulse = 0,
    } = {}
  ) {
    if (idx < 0 || idx >= MAX_HUSKS || this.state[idx] === HuskState.DEAD) {
      return {
        killed: false,
        staggered: false,
        mercuryDetonated: false,
        armorShattered: false,
        totalDamageDealt: 0,
      };
    }

    let finalDamage = damage;
    let mercuryDetonated = false;
    let armorShattered = false;

    // 1. Check Iron Inquisitor / Executioner Armor Shield Interaction
    if (this.hasArmorShield[idx] === 1) {
      if (shatterArmor || isExecution) {
        // STAKE & HAMMER / SLIDE KICK SHATTERS ARMOR!
        this.hasArmorShield[idx] = 0;
        armorShattered = true;
        this.totalArmorShatters++;
        finalDamage *= 1.5; // +50% Armor-Break bonus damage
        poiseDamage += 150; // Instant stagger break
      } else if (!isPiercing && !isBleed) {
        // Non-piercing hits against intact frontal armor are mitigated by 65%
        finalDamage *= 0.35;
        poiseDamage *= 0.35;
      }
    }

    // 2. Check Jackal hitting a Silver-Branded target -> Mercury AoE Detonation!
    if (triggerMercuryDetonation && this.silverBrandTimer[idx] > 0) {
      this.silverBrandTimer[idx] = 0;
      mercuryDetonated = true;
      finalDamage += 65;
      poiseDamage += 55;
      this._triggerMercuryAoE(idx, 3.2, 65, 55);
    }

    if (applySilverBrandSec > 0) {
      this.silverBrandTimer[idx] = Math.max(this.silverBrandTimer[idx], applySilverBrandSec);
    }

    if (addBleedStacks > 0) {
      this.bleedStacks[idx] += addBleedStacks;
      this.bleedDuration[idx] = Math.max(this.bleedDuration[idx], bleedDurationSec);
    }

    // Apply outward knockback impulse (e.g. Occult Scythe inner shaft pushing target into Sweet-Spot!)
    if (knockbackImpulse > 0 && knockbackDir) {
      this.posX[idx] = clamp(this.posX[idx] + knockbackDir.x * (knockbackImpulse * 0.14), -32, 32);
      this.posZ[idx] = clamp(this.posZ[idx] + knockbackDir.z * (knockbackImpulse * 0.14), -30, 135);
      this.velX[idx] = knockbackDir.x * knockbackImpulse;
      this.velZ[idx] = knockbackDir.z * knockbackImpulse;
    }

    this.hp[idx] -= finalDamage;
    this.hitFlashTimer[idx] = 0.10;

    const hitPos = new Vec3(this.posX[idx], this.posY[idx] + 1.45, this.posZ[idx]);
    if (this.vfx) {
      this.vfx.recordDamageNumber(idx, hitPos, finalDamage, {
        isCrit: isCrit || mercuryDetonated || armorShattered,
        isBleed,
        isExecution,
      });
      if (!isBleed) {
        this.vfx.spawnBloodSplash(hitPos, isCrit || armorShattered ? 12 : 6);
      }
    }

    // Check Kill & Dismemberment Gibs
    if (this.hp[idx] <= 0) {
      const deadX = this.posX[idx];
      const deadY = this.posY[idx];
      const deadZ = this.posZ[idx];
      const deadArch = this.archetype[idx];
      const deadElite = this.isElite[idx] === 1;

      this.state[idx] = HuskState.DEAD;
      this.respawnTimer[idx] = this.autoRespawn ? 4.5 : 0;
      this.totalKills++;

      const shouldGib = isCrit || isExecution || causeGibsOnKill || mercuryDetonated || armorShattered;
      if (shouldGib) {
        this.totalGibKills++;
        if (this.vfx) {
          this.vfx.spawnGibExplosion(
            new Vec3(deadX, deadY, deadZ),
            isExecution ? 14 : 10,
            knockbackDir
          );
        }
        if (this.audio) {
          this.audio.playGibExplosion();
        }
      } else if (this.audio) {
        this.audio.playHitmarker(false, false);
      }

      if (this.onEnemyKilled) {
        this.onEnemyKilled({
          huskIndex: idx,
          x: deadX,
          y: deadY,
          z: deadZ,
          archetype: deadArch,
          isElite: deadElite,
        });
      }

      this._syncVisualInstances();
      return {
        killed: true,
        staggered: false,
        mercuryDetonated,
        armorShattered,
        totalDamageDealt: finalDamage,
      };
    }

    // Check Poise & Stagger Break
    let justStaggered = false;
    if (this.state[idx] === HuskState.ACTIVE && poiseDamage > 0) {
      this.poise[idx] -= poiseDamage;
      if (this.poise[idx] <= 0) {
        this.poise[idx] = 0;
        this.state[idx] = HuskState.STAGGERED;
        this.staggerTimer[idx] = 2.8;
        justStaggered = true;
      }
    }

    if (this.audio && !isBleed) {
      this.audio.playHitmarker(isCrit || armorShattered, justStaggered);
    }

    return {
      killed: false,
      staggered: justStaggered,
      mercuryDetonated,
      armorShattered,
      totalDamageDealt: finalDamage,
    };
  }

  _triggerMercuryAoE(centerIdx, radius, aoeDmg, aoePoise) {
    const cx = this.posX[centerIdx];
    const cz = this.posZ[centerIdx];
    const rSq = radius * radius;

    if (this.vfx) {
      this.vfx.spawnGibExplosion(new Vec3(cx, this.posY[centerIdx] + 0.5, cz), 8);
    }

    for (let j = 0; j < MAX_HUSKS; j++) {
      if (j === centerIdx || this.state[j] === HuskState.DEAD) continue;
      const dx = this.posX[j] - cx;
      const dz = this.posZ[j] - cz;
      if (dx * dx + dz * dz <= rSq) {
        this.applyDamage(j, aoeDmg, aoePoise, {
          isCrit: true,
          causeGibsOnKill: true,
        });
      }
    }
  }

  /**
   * Ruptures all active Hemorrhage Bleed stacks on husk `idx`
   * Deals instant burst damage = remainingBleedDamage * multiplier.
   */
  ruptureBleed(idx, multiplier = 1.5) {
    if (idx < 0 || idx >= MAX_HUSKS || this.state[idx] === HuskState.DEAD) {
      return { ruptured: false, burstDamage: 0, killed: false };
    }
    const stacks = this.bleedStacks[idx];
    if (stacks === 0 || this.bleedDuration[idx] <= 0) {
      return { ruptured: false, burstDamage: 0, killed: false };
    }

    const remainingBleed = stacks * 12.0 * this.bleedDuration[idx];
    const burstDamage = Math.round(remainingBleed * multiplier);
    this.bleedStacks[idx] = 0;
    this.bleedDuration[idx] = 0;

    const res = this.applyDamage(idx, burstDamage, 35, {
      isCrit: true,
      causeGibsOnKill: true,
    });
    return { ruptured: true, burstDamage, killed: res.killed };
  }

  /**
   * Launches a husk as a Living Bowling Ball along `launchDirXZ` at `speed` (Slide Blood-Kick).
   */
  launchAsBowlingBall(idx, launchDirXZ, speed = 24.0) {
    if (idx < 0 || idx >= MAX_HUSKS || this.state[idx] === HuskState.DEAD) return false;
    this.state[idx] = HuskState.BOWLING_BALL;
    this.bowlingTimer[idx] = 0.65;
    this.velX[idx] = launchDirXZ.x * speed;
    this.velZ[idx] = launchDirXZ.z * speed;
    return true;
  }

  /**
   * Analytical Hitscan Ray vs Husk Pool (checks Head Weakpoint Sphere & Body Cylinder).
   */
  raycastHusks(origin, dir, maxDist = 140.0) {
    const hits = [];

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) continue;

      const hx = this.posX[i];
      const hy = this.posY[i];
      const hz = this.posZ[i];

      const headCenterY = hy + 1.56;
      const headT = this._raySphereIntersect(origin, dir, hx, headCenterY, hz, 0.35);
      if (headT > 0 && headT <= maxDist) {
        hits.push({
          huskIndex: i,
          distance: headT,
          isHeadshot: true,
          point: new Vec3(
            origin.x + dir.x * headT,
            origin.y + dir.y * headT,
            origin.z + dir.z * headT
          ),
        });
        continue;
      }

      const bodyT1 = this._raySphereIntersect(origin, dir, hx, hy + 1.05, hz, 0.46);
      const bodyT2 = this._raySphereIntersect(origin, dir, hx, hy + 0.55, hz, 0.46);
      let bestBodyT = -1;
      if (bodyT1 > 0 && bodyT2 > 0) bestBodyT = Math.min(bodyT1, bodyT2);
      else if (bodyT1 > 0) bestBodyT = bodyT1;
      else if (bodyT2 > 0) bestBodyT = bodyT2;

      if (bestBodyT > 0 && bestBodyT <= maxDist) {
        hits.push({
          huskIndex: i,
          distance: bestBodyT,
          isHeadshot: false,
          point: new Vec3(
            origin.x + dir.x * bestBodyT,
            origin.y + dir.y * bestBodyT,
            origin.z + dir.z * bestBodyT
          ),
        });
      }
    }

    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  _raySphereIntersect(origin, dir, cx, cy, cz, radius) {
    const ocX = origin.x - cx;
    const ocY = origin.y - cy;
    const ocZ = origin.z - cz;
    const b = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
    const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const sqrtD = Math.sqrt(disc);
    const t1 = -b - sqrtD;
    if (t1 > 0.05) return t1;
    const t2 = -b + sqrtD;
    return t2 > 0.05 ? t2 : -1;
  }

  /**
   * Finds the best Staggered enemy within `coneDeg` of the player's aim vector.
   */
  findWeakpointSnapTarget(origin, aimDir, maxRange = 60.0, coneDeg = 8.5) {
    const minCos = Math.cos((coneDeg * Math.PI) / 180.0);
    let bestIdx = -1;
    let bestCos = minCos;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) continue;
      const headPos = new Vec3(this.posX[i], this.posY[i] + 1.56, this.posZ[i]);
      const toHead = headPos.clone().sub(origin);
      const dist = toHead.length();
      if (dist > maxRange || dist < 0.5) continue;
      toHead.scale(1.0 / dist);

      const cosAngle = aimDir.dot(toHead);
      const bonus = this.state[i] === HuskState.STAGGERED ? 0.03 : 0.0;
      if (cosAngle + bonus >= bestCos) {
        bestCos = cosAngle + bonus;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  _syncVisualInstances() {
    if (!this.bodyMesh || !this.headMesh) return;

    for (let i = 0; i < MAX_HUSKS; i++) {
      const st = this.state[i];
      if (st === HuskState.DEAD) {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.bodyMesh.setMatrixAt(i, this._dummy.matrix);
        this.headMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      const x = this.posX[i];
      const y = this.posY[i];
      const z = this.posZ[i];
      const archCfg = ArchetypeStats[this.archetype[i]] || ArchetypeStats[0];
      const s = archCfg.scale * (this.isElite[i] ? 1.18 : 1.0);

      // Body transform
      this._dummy.position.set(x, y + 0.68 * s, z);
      const tiltZ = st === HuskState.STAGGERED ? 0.28 : 0.0;
      this._dummy.rotation.set(0, this.yaw[i], tiltZ);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);

      // Head transform
      this._dummy.position.set(x, y + 1.56 * s, z);
      this._dummy.rotation.set(0, this.yaw[i], 0);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();
      this.headMesh.setMatrixAt(i, this._dummy.matrix);

      // Dynamic status coloring
      if (this.hitFlashTimer[i] > 0) {
        this._color.setHex(0xffffff);
        this.bodyMesh.setColorAt(i, this._color);
        this.headMesh.setColorAt(i, this._color);
      } else if (st === HuskState.STAGGERED || st === HuskState.BOWLING_BALL) {
        this._color.setHex(0xffd700);
        this.bodyMesh.setColorAt(i, this._color);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.hasArmorShield[i] === 1) {
        this._color.setHex(0x6e7888); // Armored Iron Inquisitor steel
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xffd700);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.silverBrandTimer[i] > 0) {
        this._color.setHex(0xc0d8ff);
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xff3b00);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.bleedStacks[i] > 0) {
        this._color.setHex(0xb8000e);
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xe5e2dc);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.isElite[i]) {
        this._color.setHex(0xe60012); // Crimson Elite glow
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xffd700);
        this.headMesh.setColorAt(i, this._color);
      } else {
        this._color.setHex(0x4a141c);
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xd4cfc7);
        this.headMesh.setColorAt(i, this._color);
      }
    }

    if (this.projMesh) {
      for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) {
        if (!this.projActive[i]) {
          this._dummy.scale.set(0, 0, 0);
          this._dummy.updateMatrix();
          this.projMesh.setMatrixAt(i, this._dummy.matrix);
          continue;
        }
        this._dummy.position.set(this.projX[i], this.projY[i], this.projZ[i]);
        this._dummy.rotation.set(this.tickCounter * 0.08, this.tickCounter * 0.12, 0);
        const ps = this.projDeflected[i] ? 1.45 : 1.0;
        this._dummy.scale.set(ps, ps, ps);
        this._dummy.updateMatrix();
        this.projMesh.setMatrixAt(i, this._dummy.matrix);
        this._color.setHex(this.projDeflected[i] ? 0xffd700 : 0xff3b00);
        this.projMesh.setColorAt(i, this._color);
      }
      this.projMesh.instanceMatrix.needsUpdate = true;
      if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
  }
}
