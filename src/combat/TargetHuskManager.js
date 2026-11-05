/**
 * SANGUINE_RUNNER — Object-Pooled Swarm Target Husks with Spatial Partitioning,
 * Interleaved Boid Flocking, Poise/Stagger, Living Bowling-Ball Physics,
 * Hemorrhage Bleed Stacking, and Silver-Brand Mercury Detonations.
 */

import { Vec3, clamp } from '../physics/Vec3.js';

export const MAX_HUSKS = 48;

export const HuskState = Object.freeze({
  DEAD: 0,
  ACTIVE: 1,
  STAGGERED: 2,
  BOWLING_BALL: 3,
});

const SPATIAL_CELL_SIZE = 4.0;

export class TargetHuskManager {
  /**
   * @param {Object} opts
   * @param {import('./VFXAndPoolManager.js').VFXAndPoolManager} opts.vfx
   * @param {import('../audio/AudioManager.js').AudioManager} opts.audio
   * @param {any} [opts.THREE] Optional Three.js namespace
   * @param {any} [opts.scene] Optional Three.js Scene
   */
  constructor({ vfx, audio, THREE = null, scene = null }) {
    this.vfx = vfx;
    this.audio = audio;
    this.THREE = THREE;
    this.scene = scene;

    // =========================================================================
    // Struct-of-Arrays (SoA) Pre-Allocated Husk Pool (Zero Runtime Allocation)
    // =========================================================================
    this.state = new Uint8Array(MAX_HUSKS);
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
    this.staggerTimer = new Float32Array(MAX_HUSKS);
    this.bowlingTimer = new Float32Array(MAX_HUSKS);
    this.respawnTimer = new Float32Array(MAX_HUSKS);

    // Status Effects (Silver Brand & Hemorrhage Bleed)
    this.silverBrandTimer = new Float32Array(MAX_HUSKS);
    this.bleedStacks = new Uint16Array(MAX_HUSKS);
    this.bleedDuration = new Float32Array(MAX_HUSKS);
    this.bleedTickAccum = new Float32Array(MAX_HUSKS);
    this.hitFlashTimer = new Float32Array(MAX_HUSKS);

    // 2D Spatial Hash Grid Map (cellKey -> array of husk indices)
    this.spatialGrid = new Map();
    this.tickCounter = 0;
    this.aiPursuitEnabled = true;

    // Telemetry
    this.totalKills = 0;
    this.totalGibKills = 0;
    this.totalBowlingStrikes = 0;
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

    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < MAX_HUSKS; i++) {
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);
      this.headMesh.setMatrixAt(i, this._dummy.matrix);
      this.bodyMesh.setColorAt(i, new THREE.Color(0x5a1822));
      this.headMesh.setColorAt(i, new THREE.Color(0xd8cfc4));
    }

    this.scene.add(this.bodyMesh);
    this.scene.add(this.headMesh);
  }

  /**
   * Spawns or resets a husk in a specific slot.
   */
  spawnHusk(index, x, y, z, { maxHp = 110, maxPoise = 65, moveSpeed = 5.2 } = {}) {
    if (index < 0 || index >= MAX_HUSKS) return -1;
    this.state[index] = HuskState.ACTIVE;
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
    this.staggerTimer[index] = 0;
    this.bowlingTimer[index] = 0;
    this.respawnTimer[index] = 0;
    this.silverBrandTimer[index] = 0;
    this.bleedStacks[index] = 0;
    this.bleedDuration[index] = 0;
    this.bleedTickAccum[index] = 0;
    this.hitFlashTimer[index] = 0;
    return index;
  }

  /**
   * Populates the Courtyard & Arena with tactical packs of Thrall Husks for combat testing.
   */
  populateArenaWave() {
    let idx = 0;
    // Pack 1: Courtyard Firing Line & Bowling Pins (in front of player spawn at z=14 facing -Z)
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
        this.spawnHusk(idx++, x, y, z, { maxHp: 110, maxPoise: 60, moveSpeed: 4.5 });
      }
    }

    // Pack 2: Speedway Swarm Pack (z = 42..75) for Katana Blood-Dash Chains & Boid Flocking
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
   * Steps all active husks at 120Hz using Spatial Partitioning and Interleaved Boid Flocking.
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

      // Handle Dead Husk Respawn Timer
      if (st === HuskState.DEAD) {
        if (this.respawnTimer[i] > 0) {
          this.respawnTimer[i] -= dt;
          if (this.respawnTimer[i] <= 0) {
            this.spawnHusk(i, this.spawnX[i], this.spawnY[i], this.spawnZ[i], {
              maxHp: this.maxHp[i],
              maxPoise: this.maxPoise[i],
              moveSpeed: this.moveSpeed[i],
            });
          }
        }
        continue;
      }

      if (this.hitFlashTimer[i] > 0) this.hitFlashTimer[i] = Math.max(0, this.hitFlashTimer[i] - dt);
      if (this.silverBrandTimer[i] > 0) this.silverBrandTimer[i] = Math.max(0, this.silverBrandTimer[i] - dt);

      // Process Hemorrhage Bleed Ticks (ticks every 0.25s, batched into a single growing damage number!)
      if (this.bleedStacks[i] > 0 && this.bleedDuration[i] > 0) {
        this.bleedDuration[i] -= dt;
        this.bleedTickAccum[i] += dt;
        if (this.bleedTickAccum[i] >= 0.25) {
          this.bleedTickAccum[i] -= 0.25;
          const bleedDmg = this.bleedStacks[i] * 3.0; // 12 DPS per stack
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

        // Check bowling collision against neighboring husks via Spatial Grid
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

        if (dist > 1.35 && dist < 26.0) {
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

        // Keep courtyard husks on courtyard bounds (-32..32)
        this.posX[i] = clamp(this.posX[i] + this.velX[i] * dt, -32, 32);
        this.posZ[i] = clamp(this.posZ[i] + this.velZ[i] * dt, -30, 135);
      }
    }

    this.interleavedBoidQueriesLastTick = boidQueries;
    this._syncVisualInstances();
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
          knockbackDir: new Vec3(dx, 0.2, dz).normalize(),
        });
      }
    }
  }

  /**
   * Applies damage, poise damage, bleed stacks, and checks for Stagger Break,
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
      knockbackDir = null,
    } = {}
  ) {
    if (idx < 0 || idx >= MAX_HUSKS || this.state[idx] === HuskState.DEAD) {
      return { killed: false, staggered: false, mercuryDetonated: false, totalDamageDealt: 0 };
    }

    let finalDamage = damage;
    let mercuryDetonated = false;

    // Check Jackal hitting a Silver-Branded target -> Mercury AoE Detonation!
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

    this.hp[idx] -= finalDamage;
    this.hitFlashTimer[idx] = 0.10;

    const hitPos = new Vec3(this.posX[idx], this.posY[idx] + 1.45, this.posZ[idx]);
    if (this.vfx) {
      this.vfx.recordDamageNumber(idx, hitPos, finalDamage, {
        isCrit: isCrit || mercuryDetonated,
        isBleed,
        isExecution,
      });
      if (!isBleed) {
        this.vfx.spawnBloodSplash(hitPos, isCrit ? 12 : 6);
      }
    }

    // Check Kill & Dismemberment Gibs
    if (this.hp[idx] <= 0) {
      this.state[idx] = HuskState.DEAD;
      this.respawnTimer[idx] = 4.5; // Auto-respawn in 4.5s for continuous arena testing
      this.totalKills++;

      const shouldGib = isCrit || isExecution || causeGibsOnKill || mercuryDetonated;
      if (shouldGib) {
        this.totalGibKills++;
        if (this.vfx) {
          this.vfx.spawnGibExplosion(
            new Vec3(this.posX[idx], this.posY[idx], this.posZ[idx]),
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

      this._syncVisualInstances();
      return { killed: true, staggered: false, mercuryDetonated, totalDamageDealt: finalDamage };
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
      this.audio.playHitmarker(isCrit, justStaggered);
    }

    return { killed: false, staggered: justStaggered, mercuryDetonated, totalDamageDealt: finalDamage };
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
   * Ruptures all active Hemorrhage Bleed stacks on husk `idx` (triggered by Katana RMB Blood-Dash).
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
   * Returns all intersected husks sorted by distance `t` for multi-pierce weapons.
   * @param {Vec3} origin
   * @param {Vec3} dir Normalized ray direction
   * @param {number} maxDist
   * @returns {Array<{ huskIndex: number, distance: number, isHeadshot: boolean, point: Vec3 }>}
   */
  raycastHusks(origin, dir, maxDist = 140.0) {
    const hits = [];

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) continue;

      const hx = this.posX[i];
      const hy = this.posY[i];
      const hz = this.posZ[i];

      // 1. Test Head Weakpoint Sphere (center at y + 1.56m, radius = 0.35m)
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

      // 2. Test Body Torso Sphere/Capsule (sampled at y + 1.05m and y + 0.55m, radius = 0.46m)
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
   * Finds the best Staggered enemy within `coneDeg` of the player's aim vector for
   * Jackal & Casull RMB Weakpoint Snap.
   */
  findWeakpointSnapTarget(origin, aimDir, maxRange = 60.0, coneDeg = 8.5) {
    const minCos = Math.cos((coneDeg * Math.PI) / 180.0);
    let bestIdx = -1;
    let bestCos = minCos;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.state[i] === HuskState.DEAD) continue;
      // Prefer STAGGERED targets, or any target within narrow snap cone
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

      // Body transform
      this._dummy.position.set(x, y + 0.68, z);
      const tiltZ = st === HuskState.STAGGERED ? 0.28 : 0.0;
      this._dummy.rotation.set(0, this.yaw[i], tiltZ);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, this._dummy.matrix);

      // Head transform
      this._dummy.position.set(x, y + 1.56, z);
      this._dummy.rotation.set(0, this.yaw[i], 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.headMesh.setMatrixAt(i, this._dummy.matrix);

      // Dynamic status coloring (Hit flash -> Staggered Gold -> Silver Brand -> Bleed Crimson -> Default)
      if (this.hitFlashTimer[i] > 0) {
        this._color.setHex(0xffffff);
        this.bodyMesh.setColorAt(i, this._color);
        this.headMesh.setColorAt(i, this._color);
      } else if (st === HuskState.STAGGERED || st === HuskState.BOWLING_BALL) {
        this._color.setHex(0xffd700); // Occult Gold stagger highlight!
        this.bodyMesh.setColorAt(i, this._color);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.silverBrandTimer[i] > 0) {
        this._color.setHex(0xc0d8ff); // Silver Brand shimmer
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xff3b00);
        this.headMesh.setColorAt(i, this._color);
      } else if (this.bleedStacks[i] > 0) {
        this._color.setHex(0xb8000e); // Arterial Hemorrhage glow
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xe5e2dc);
        this.headMesh.setColorAt(i, this._color);
      } else {
        this._color.setHex(0x4a141c);
        this.bodyMesh.setColorAt(i, this._color);
        this._color.setHex(0xd4cfc7);
        this.headMesh.setColorAt(i, this._color);
      }
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
  }
}
