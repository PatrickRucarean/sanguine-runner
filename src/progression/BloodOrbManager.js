/**
 * SANGUINE_RUNNER — Phase 4: High-Performance Pooled Blood Orbs (Vitae Essence) & Auto-Merge Engine
 * Implements Section 5.3.C of GAME_PLAN.md:
 *  - Zero-Allocation Struct-of-Arrays (SoA) Ring Buffer (`MAX_ORBS = 2048`)
 *  - Single `THREE.InstancedMesh` Octahedron Gem Renderer (3 Tiers: Crimson Drop, Sanguine Ruby, Royal Heart)
 *  - Magnetic Pull Physics & End-of-Wave Sanguine Harvest (65 m/s global vacuum)
 *  - Spatial-Hash Auto-Merge Coalescence when active orbs exceed 1,200
 */

export const MAX_ORBS = 2048;
export const COALESCE_THRESHOLD = 1200;

export const OrbTier = Object.freeze({
  CRIMSON_DROP: 0,  // 1 - 4 Vitae
  SANGUINE_RUBY: 1, // 5 - 24 Vitae
  ROYAL_HEART: 2,   // 25+ Vitae
});

export class BloodOrbManager {
  /**
   * @param {Object} opts
   * @param {any} [opts.THREE] Optional Three.js namespace
   * @param {any} [opts.scene] Optional Three.js Scene
   * @param {import('../audio/AudioManager.js').AudioManager} [opts.audio]
   * @param {Function} [opts.onVitaeCollected] Callback `(vitaeAmount) => void`
   */
  constructor({ THREE = null, scene = null, audio = null, onVitaeCollected = null } = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.audio = audio;
    this.onVitaeCollected = onVitaeCollected;

    // SoA Ring Buffer (Zero runtime heap allocation)
    this.active = new Uint8Array(MAX_ORBS);
    this.tier = new Uint8Array(MAX_ORBS);
    this.posX = new Float32Array(MAX_ORBS);
    this.posY = new Float32Array(MAX_ORBS);
    this.posZ = new Float32Array(MAX_ORBS);
    this.velX = new Float32Array(MAX_ORBS);
    this.velY = new Float32Array(MAX_ORBS);
    this.velZ = new Float32Array(MAX_ORBS);
    this.vitaeValue = new Float32Array(MAX_ORBS);

    this.cursor = 0;
    this.activeCount = 0;
    this.sanguineHarvestActive = false;

    // Player Vitae Economy State
    this.totalVitaeCollected = 0;
    this.currentVitae = 100; // Starting Vitae for testing Blood Tithe rerolls
    this.totalCoalesceMerges = 0;

    if (this.THREE && this.scene) {
      this._initInstancedMesh();
    }
  }

  _initInstancedMesh() {
    const THREE = this.THREE;
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();

    const geo = new THREE.OctahedronGeometry(0.22, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_ORBS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (let i = 0; i < MAX_ORBS; i++) {
      this.mesh.setMatrixAt(i, this._dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0xe60012));
    }

    this.scene.add(this.mesh);
  }

  _computeTier(value) {
    if (value >= 25) return OrbTier.ROYAL_HEART;
    if (value >= 5) return OrbTier.SANGUINE_RUBY;
    return OrbTier.CRIMSON_DROP;
  }

  /**
   * Spawns a pooled Vitae Blood Orb at (x, y, z) with initial ballistic fountain pop.
   */
  spawnOrb(x, y, z, vitaeValue = 3) {
    // Trigger spatial-hash auto-merge coalescence if active count exceeds budget threshold
    if (this.activeCount >= COALESCE_THRESHOLD) {
      this.coalesceNearbyOrbs();
    }

    let idx = -1;
    for (let attempt = 0; attempt < MAX_ORBS; attempt++) {
      const candidate = (this.cursor + attempt) % MAX_ORBS;
      if (!this.active[candidate]) {
        idx = candidate;
        this.cursor = (candidate + 1) % MAX_ORBS;
        break;
      }
    }
    if (idx < 0) {
      idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_ORBS;
    } else {
      this.activeCount++;
    }

    this.active[idx] = 1;
    this.vitaeValue[idx] = vitaeValue;
    this.tier[idx] = this._computeTier(vitaeValue);
    this.posX[idx] = x;
    this.posY[idx] = Math.max(0.35, y);
    this.posZ[idx] = z;

    const angle = (idx * 137.5 * Math.PI) / 180.0;
    this.velX[idx] = Math.cos(angle) * 2.8;
    this.velY[idx] = 4.5 + (idx % 3) * 1.2;
    this.velZ[idx] = Math.sin(angle) * 2.8;

    return idx;
  }

  /**
   * Activates End-of-Wave Sanguine Harvest: all orbs on the map fly into the player at 65 m/s!
   */
  triggerSanguineHarvest() {
    this.sanguineHarvestActive = true;
  }

  /**
   * Spatial-Hash Auto-Merge Coalescence (Section 5.3.C.3):
   * Merges neighboring Tier 0 orbs within 1.5m into high-value Tier 1 / Tier 2 gems
   * so active instance count never breaches budget even at Wave 50.
   */
  coalesceNearbyOrbs() {
    const cellSize = 1.5;
    const cellFirstOrb = new Map();
    let mergedCount = 0;

    for (let i = 0; i < MAX_ORBS; i++) {
      if (!this.active[i] || this.tier[i] === OrbTier.ROYAL_HEART) continue;

      const cx = Math.floor(this.posX[i] / cellSize);
      const cz = Math.floor(this.posZ[i] / cellSize);
      const key = (cx << 16) ^ (cz & 0xffff);

      const hostIdx = cellFirstOrb.get(key);
      if (hostIdx === undefined) {
        cellFirstOrb.set(key, i);
      } else {
        // Merge orb `i` into `hostIdx`!
        this.vitaeValue[hostIdx] += this.vitaeValue[i];
        this.tier[hostIdx] = this._computeTier(this.vitaeValue[hostIdx]);
        this.active[i] = 0;
        this.activeCount = Math.max(0, this.activeCount - 1);
        mergedCount++;
        this.totalCoalesceMerges++;
      }
    }

    return mergedCount;
  }

  /**
   * Steps all active Blood Orbs (ballistic settle + magnetic pull toward player + collection).
   */
  step(dt, playerPos, magnetRadius = 4.5) {
    if (!playerPos) return 0;

    let collectedThisStep = 0;
    const px = playerPos.x;
    const py = playerPos.y + 1.0;
    const pz = playerPos.z;
    const collectRadius = 1.35;

    for (let i = 0; i < MAX_ORBS; i++) {
      if (!this.active[i]) continue;

      const dx = px - this.posX[i];
      const dy = py - this.posY[i];
      const dz = pz - this.posZ[i];
      const dist = Math.hypot(dx, dy, dz);

      if (dist <= collectRadius) {
        // Collected!
        const val = this.vitaeValue[i];
        this.active[i] = 0;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.currentVitae += val;
        this.totalVitaeCollected += val;
        collectedThisStep += val;

        if (this.onVitaeCollected) {
          this.onVitaeCollected(val);
        }
        continue;
      }

      if (this.sanguineHarvestActive) {
        // End-of-Wave Sanguine Harvest Vacuum (65 m/s)
        const invD = 1.0 / Math.max(0.01, dist);
        this.velX[i] = dx * invD * 65.0;
        this.velY[i] = dy * invD * 65.0;
        this.velZ[i] = dz * invD * 65.0;
      } else if (dist <= magnetRadius) {
        // Magnetic Pull Physics: v += (35 + 120 / max(0.5, d)) * dir * dt
        const invD = 1.0 / Math.max(0.01, dist);
        const pullAccel = 35.0 + 120.0 / Math.max(0.5, dist);
        this.velX[i] += dx * invD * pullAccel * dt;
        this.velY[i] += dy * invD * pullAccel * dt;
        this.velZ[i] += dz * invD * pullAccel * dt;
      } else {
        // Gravity settle onto cathedral floor
        this.velY[i] -= 18.0 * dt;
        this.velX[i] *= Math.max(0, 1.0 - 4.0 * dt);
        this.velZ[i] *= Math.max(0, 1.0 - 4.0 * dt);
      }

      this.posX[i] += this.velX[i] * dt;
      this.posY[i] += this.velY[i] * dt;
      this.posZ[i] += this.velZ[i] * dt;

      if (this.posY[i] < 0.35 && !this.sanguineHarvestActive) {
        this.posY[i] = 0.35;
        this.velY[i] = 0;
      }
    }

    if (this.activeCount === 0) {
      this.sanguineHarvestActive = false;
    }

    this._syncVisuals();
    return collectedThisStep;
  }

  _syncVisuals() {
    if (!this.mesh) return;
    for (let i = 0; i < MAX_ORBS; i++) {
      if (!this.active[i]) {
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      const t = this.tier[i];
      const s = t === OrbTier.ROYAL_HEART ? 1.85 : t === OrbTier.SANGUINE_RUBY ? 1.35 : 0.95;
      this._dummy.position.set(this.posX[i], this.posY[i], this.posZ[i]);
      this._dummy.rotation.set(0, (i + performance.now() * 0.004) % 6.28, 0);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);

      const hex =
        t === OrbTier.ROYAL_HEART
          ? 0xffd700
          : t === OrbTier.SANGUINE_RUBY
          ? 0xff1e42
          : 0xe60012;
      this._color.setHex(hex);
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
