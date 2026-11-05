/**
 * SANGUINE_RUNNER — Mandatory Object-Pooled VFX, Low-Poly Dismemberment Gibs,
 * Blood Particles, Hitscan Tracers, and Batched Floating Damage Numbers.
 * Zero runtime Instantiate/Destroy or DOM creation during active gameplay.
 */

import { Vec3, clamp } from '../physics/Vec3.js';

export const MAX_GIBS = 384;
export const MAX_BLOOD_PARTICLES = 512;
export const MAX_TRACERS = 32;
export const MAX_DAMAGE_LABELS = 48;
export const DAMAGE_BATCH_WINDOW_SEC = 0.40; // 400ms accumulation window per targetId

export class VFXAndPoolManager {
  /**
   * @param {Object} [opts]
   * @param {any} [opts.THREE] Optional Three.js namespace (null in headless Node tests)
   * @param {any} [opts.scene] Optional Three.js Scene
   * @param {HTMLElement|null} [opts.labelsContainer] Optional DOM container for pooled floating numbers
   */
  constructor({ THREE = null, scene = null, labelsContainer = null } = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.labelsContainer = labelsContainer;

    // =========================================================================
    // 1. LOW-POLY DISMEMBERMENT GIBS OBJECT POOL (SoA Ring Buffer)
    // =========================================================================
    this.gibActive = new Uint8Array(MAX_GIBS);
    this.gibPosX = new Float32Array(MAX_GIBS);
    this.gibPosY = new Float32Array(MAX_GIBS);
    this.gibPosZ = new Float32Array(MAX_GIBS);
    this.gibVelX = new Float32Array(MAX_GIBS);
    this.gibVelY = new Float32Array(MAX_GIBS);
    this.gibVelZ = new Float32Array(MAX_GIBS);
    this.gibRotX = new Float32Array(MAX_GIBS);
    this.gibRotY = new Float32Array(MAX_GIBS);
    this.gibScale = new Float32Array(MAX_GIBS);
    this.gibAge = new Float32Array(MAX_GIBS);
    this.gibMaxLife = new Float32Array(MAX_GIBS);
    this.gibCursor = 0;
    this.activeGibCount = 0;
    this.totalGibsSpawned = 0;

    // =========================================================================
    // 2. ARTERIAL BLOOD MIST PARTICLE POOL (SoA Ring Buffer)
    // =========================================================================
    this.bloodActive = new Uint8Array(MAX_BLOOD_PARTICLES);
    this.bloodPosX = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodPosY = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodPosZ = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodVelX = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodVelY = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodVelZ = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodAge = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodMaxLife = new Float32Array(MAX_BLOOD_PARTICLES);
    this.bloodCursor = 0;
    this.activeBloodCount = 0;

    // =========================================================================
    // 3. HITSCAN / SLASH TRACER POOL
    // =========================================================================
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      this.tracers.push({
        active: false,
        start: new Vec3(),
        end: new Vec3(),
        age: 0,
        maxLife: 0.12,
        colorHex: 0xe60012,
        mesh: null,
      });
    }
    this.tracerCursor = 0;

    // =========================================================================
    // 4. BATCHED FLOATING DAMAGE NUMBERS POOL (MAX_DAMAGE_LABELS = 48)
    // =========================================================================
    this.damageLabels = [];
    for (let i = 0; i < MAX_DAMAGE_LABELS; i++) {
      let domEl = null;
      if (this.labelsContainer && typeof document !== 'undefined') {
        domEl = document.createElement('div');
        domEl.className = 'dmg-number hidden';
        this.labelsContainer.appendChild(domEl);
      }
      this.damageLabels.push({
        active: false,
        targetId: -1,
        worldPos: new Vec3(),
        accumulatedDamage: 0,
        hitCount: 0,
        timeSinceLastHit: 0,
        totalAge: 0,
        maxLife: 0.85,
        isCrit: false,
        isBleed: false,
        isExecution: false,
        scalePunch: 1.0,
        domEl,
      });
    }
    this.labelCursor = 0;

    if (this.THREE && this.scene) {
      this._initThreeInstancedPools();
    }
  }

  _initThreeInstancedPools() {
    const THREE = this.THREE;
    this._dummyObj = new THREE.Object3D();

    // 1. Instanced Low-Poly Gibs (Jagged Dodecahedron / Octahedron chunks)
    const gibGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const gibMat = new THREE.MeshLambertMaterial({
      color: 0xc80010,
      emissive: 0x380004,
      flatShading: true,
    });
    this.gibInstancedMesh = new THREE.InstancedMesh(gibGeo, gibMat, MAX_GIBS);
    this.gibInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gibInstancedMesh.frustumCulled = false;

    // Hide all instances initially at scale 0
    this._dummyObj.scale.set(0, 0, 0);
    this._dummyObj.updateMatrix();
    for (let i = 0; i < MAX_GIBS; i++) {
      this.gibInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
    }
    this.scene.add(this.gibInstancedMesh);

    // 2. Instanced Arterial Blood Droplets
    const bloodGeo = new THREE.OctahedronGeometry(0.09, 0);
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0xff0818 });
    this.bloodInstancedMesh = new THREE.InstancedMesh(bloodGeo, bloodMat, MAX_BLOOD_PARTICLES);
    this.bloodInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodInstancedMesh.frustumCulled = false;
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      this.bloodInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
    }
    this.scene.add(this.bloodInstancedMesh);

    // 3. Pre-allocated Tracer Line Meshes
    for (let i = 0; i < MAX_TRACERS; i++) {
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 1.0,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers[i].mesh = line;
    }
  }

  /**
   * Spawns a low-poly Hellsing/Alucard dismemberment gib explosion from the pre-allocated pool.
   * Rapidly despawns in 1.1s - 1.6s to preserve 120+ FPS.
   * @param {Vec3} origin
   * @param {number} [chunkCount=10]
   * @param {Vec3} [directionalBias]
   */
  spawnGibExplosion(origin, chunkCount = 10, directionalBias = null) {
    for (let c = 0; c < chunkCount; c++) {
      const idx = this.gibCursor;
      this.gibCursor = (this.gibCursor + 1) % MAX_GIBS;

      if (!this.gibActive[idx]) {
        this.activeGibCount++;
      }
      this.gibActive[idx] = 1;
      this.totalGibsSpawned++;

      this.gibPosX[idx] = origin.x + (Math.random() - 0.5) * 0.5;
      this.gibPosY[idx] = origin.y + 0.6 + Math.random() * 0.8;
      this.gibPosZ[idx] = origin.z + (Math.random() - 0.5) * 0.5;

      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = 3.5 + Math.random() * 8.5;
      this.gibVelX[idx] = Math.cos(angle) * horizSpeed + (directionalBias ? directionalBias.x * 0.4 : 0);
      this.gibVelY[idx] = 4.5 + Math.random() * 7.5;
      this.gibVelZ[idx] = Math.sin(angle) * horizSpeed + (directionalBias ? directionalBias.z * 0.4 : 0);

      this.gibRotX[idx] = Math.random() * Math.PI;
      this.gibRotY[idx] = Math.random() * Math.PI;
      this.gibScale[idx] = 0.75 + Math.random() * 0.85;
      this.gibAge[idx] = 0.0;
      this.gibMaxLife[idx] = 1.15 + Math.random() * 0.45; // Rapid despawn for 120+ FPS
    }

    // Accompanying arterial mist burst
    this.spawnBloodSplash(origin, 16);
  }

  /**
   * Spawns pooled arterial blood droplets on hit/slash.
   */
  spawnBloodSplash(origin, dropletCount = 8) {
    for (let i = 0; i < dropletCount; i++) {
      const idx = this.bloodCursor;
      this.bloodCursor = (this.bloodCursor + 1) % MAX_BLOOD_PARTICLES;

      if (!this.bloodActive[idx]) {
        this.activeBloodCount++;
      }
      this.bloodActive[idx] = 1;

      this.bloodPosX[idx] = origin.x + (Math.random() - 0.5) * 0.35;
      this.bloodPosY[idx] = origin.y + (Math.random() - 0.5) * 0.35;
      this.bloodPosZ[idx] = origin.z + (Math.random() - 0.5) * 0.35;

      const angle = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 6.5;
      this.bloodVelX[idx] = Math.cos(angle) * spd;
      this.bloodVelY[idx] = 1.5 + Math.random() * 4.5;
      this.bloodVelZ[idx] = Math.sin(angle) * spd;

      this.bloodAge[idx] = 0.0;
      this.bloodMaxLife[idx] = 0.35 + Math.random() * 0.30;
    }
  }

  /**
   * Spawns a pooled hitscan or slash tracer line between `start` and `end`.
   */
  spawnTracer(start, end, colorHex = 0xffd700, durationSec = 0.11) {
    const idx = this.tracerCursor;
    this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS;
    const tr = this.tracers[idx];

    tr.active = true;
    tr.start.copy(start);
    tr.end.copy(end);
    tr.age = 0.0;
    tr.maxLife = durationSec;
    tr.colorHex = colorHex;

    if (tr.mesh) {
      const posAttr = tr.mesh.geometry.attributes.position;
      posAttr.setXYZ(0, start.x, start.y, start.z);
      posAttr.setXYZ(1, end.x, end.y, end.z);
      posAttr.needsUpdate = true;
      tr.mesh.material.color.setHex(colorHex);
      tr.mesh.material.opacity = 1.0;
      tr.mesh.visible = true;
    }
  }

  /**
   * Batches floating damage numbers per targetId within DAMAGE_BATCH_WINDOW_SEC (400ms).
   * If 10 rapid hits/bleed ticks land on the same target in 1 second, they accumulate
   * into a single growing number rather than rendering 10 overlapping text nodes.
   */
  recordDamageNumber(targetId, worldPos, damageAmount, { isCrit = false, isBleed = false, isExecution = false } = {}) {
    const roundedDmg = Math.max(1, Math.round(damageAmount));

    // 1. Search for an existing active label for `targetId` within the batch window
    if (targetId !== null && targetId !== undefined && targetId >= 0) {
      for (let i = 0; i < MAX_DAMAGE_LABELS; i++) {
        const lbl = this.damageLabels[i];
        if (
          lbl.active &&
          lbl.targetId === targetId &&
          lbl.timeSinceLastHit <= DAMAGE_BATCH_WINDOW_SEC
        ) {
          lbl.accumulatedDamage += roundedDmg;
          lbl.hitCount += 1;
          lbl.timeSinceLastHit = 0.0;
          lbl.totalAge = Math.min(lbl.totalAge, 0.15); // Keep alive while stacking!
          lbl.worldPos.copy(worldPos);
          lbl.isCrit = lbl.isCrit || isCrit;
          lbl.isExecution = lbl.isExecution || isExecution;
          lbl.scalePunch = Math.min(1.65, 1.15 + lbl.hitCount * 0.06);
          this._syncLabelDomText(lbl);
          return lbl;
        }
      }
    }

    // 2. Otherwise claim the next pooled label slot
    const idx = this.labelCursor;
    this.labelCursor = (this.labelCursor + 1) % MAX_DAMAGE_LABELS;
    const lbl = this.damageLabels[idx];

    lbl.active = true;
    lbl.targetId = targetId ?? -1;
    lbl.worldPos.copy(worldPos);
    lbl.accumulatedDamage = roundedDmg;
    lbl.hitCount = 1;
    lbl.timeSinceLastHit = 0.0;
    lbl.totalAge = 0.0;
    lbl.maxLife = isExecution ? 1.15 : isCrit ? 0.95 : 0.75;
    lbl.isCrit = isCrit;
    lbl.isBleed = isBleed;
    lbl.isExecution = isExecution;
    lbl.scalePunch = isCrit || isExecution ? 1.35 : 1.0;

    this._syncLabelDomText(lbl);
    return lbl;
  }

  _syncLabelDomText(lbl) {
    if (!lbl.domEl) return;
    lbl.domEl.classList.remove('hidden', 'crit', 'bleed', 'exec');
    if (lbl.isExecution) lbl.domEl.classList.add('exec');
    else if (lbl.isCrit) lbl.domEl.classList.add('crit');
    else if (lbl.isBleed) lbl.domEl.classList.add('bleed');

    const suffix = lbl.isExecution ? '!! EXEC' : lbl.isCrit ? '!' : '';
    const comboTag = lbl.hitCount > 1 ? ` [x${lbl.hitCount}]` : '';
    lbl.domEl.textContent = `${lbl.accumulatedDamage}${suffix}${comboTag}`;
  }

  /** Returns the count of currently active floating damage labels */
  getActiveDamageLabelCount() {
    let count = 0;
    for (let i = 0; i < MAX_DAMAGE_LABELS; i++) {
      if (this.damageLabels[i].active) count++;
    }
    return count;
  }

  /**
   * Advances all pooled gibs, blood droplets, tracers, and batched damage numbers.
   * @param {number} dt Timestep seconds
   * @param {any} [camera] Optional Three.js camera for 3D->2D damage number projection
   */
  update(dt, camera = null) {
    // 1. Update Low-Poly Gibs
    let gibMatrixDirty = false;
    for (let i = 0; i < MAX_GIBS; i++) {
      if (!this.gibActive[i]) continue;
      gibMatrixDirty = true;

      this.gibAge[i] += dt;
      if (this.gibAge[i] >= this.gibMaxLife[i]) {
        this.gibActive[i] = 0;
        this.activeGibCount = Math.max(0, this.activeGibCount - 1);
        if (this.gibInstancedMesh) {
          this._dummyObj.scale.set(0, 0, 0);
          this._dummyObj.updateMatrix();
          this.gibInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
        }
        continue;
      }

      // Ballistic integration + floor bounce at y = 0.12
      this.gibVelY[i] -= 26.0 * dt;
      this.gibPosX[i] += this.gibVelX[i] * dt;
      this.gibPosY[i] += this.gibVelY[i] * dt;
      this.gibPosZ[i] += this.gibVelZ[i] * dt;

      if (this.gibPosY[i] < 0.12) {
        this.gibPosY[i] = 0.12;
        this.gibVelY[i] = Math.abs(this.gibVelY[i]) * 0.42;
        this.gibVelX[i] *= 0.72;
        this.gibVelZ[i] *= 0.72;
      }

      this.gibRotX[i] += 7.0 * dt;
      this.gibRotY[i] += 9.5 * dt;

      if (this.gibInstancedMesh) {
        const lifeRatio = this.gibAge[i] / this.gibMaxLife[i];
        // Rapid shrink in final 35% of life
        const shrink = lifeRatio > 0.65 ? 1.0 - (lifeRatio - 0.65) / 0.35 : 1.0;
        const s = this.gibScale[i] * Math.max(0, shrink);

        this._dummyObj.position.set(this.gibPosX[i], this.gibPosY[i], this.gibPosZ[i]);
        this._dummyObj.rotation.set(this.gibRotX[i], this.gibRotY[i], 0);
        this._dummyObj.scale.set(s, s, s);
        this._dummyObj.updateMatrix();
        this.gibInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
      }
    }
    if (gibMatrixDirty && this.gibInstancedMesh) {
      this.gibInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update Arterial Blood Mist Particles
    let bloodMatrixDirty = false;
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      if (!this.bloodActive[i]) continue;
      bloodMatrixDirty = true;

      this.bloodAge[i] += dt;
      if (this.bloodAge[i] >= this.bloodMaxLife[i]) {
        this.bloodActive[i] = 0;
        this.activeBloodCount = Math.max(0, this.activeBloodCount - 1);
        if (this.bloodInstancedMesh) {
          this._dummyObj.scale.set(0, 0, 0);
          this._dummyObj.updateMatrix();
          this.bloodInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
        }
        continue;
      }

      this.bloodVelY[i] -= 18.0 * dt;
      this.bloodPosX[i] += this.bloodVelX[i] * dt;
      this.bloodPosY[i] += this.bloodVelY[i] * dt;
      this.bloodPosZ[i] += this.bloodVelZ[i] * dt;

      if (this.bloodInstancedMesh) {
        const s = 1.0 - this.bloodAge[i] / this.bloodMaxLife[i];
        this._dummyObj.position.set(this.bloodPosX[i], this.bloodPosY[i], this.bloodPosZ[i]);
        this._dummyObj.scale.set(s, s, s);
        this._dummyObj.updateMatrix();
        this.bloodInstancedMesh.setMatrixAt(i, this._dummyObj.matrix);
      }
    }
    if (bloodMatrixDirty && this.bloodInstancedMesh) {
      this.bloodInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Update Hitscan / Slash Tracers
    for (let i = 0; i < MAX_TRACERS; i++) {
      const tr = this.tracers[i];
      if (!tr.active) continue;
      tr.age += dt;
      if (tr.age >= tr.maxLife) {
        tr.active = false;
        if (tr.mesh) tr.mesh.visible = false;
      } else if (tr.mesh) {
        tr.mesh.material.opacity = 1.0 - tr.age / tr.maxLife;
      }
    }

    // 4. Update Batched Floating Damage Numbers
    for (let i = 0; i < MAX_DAMAGE_LABELS; i++) {
      const lbl = this.damageLabels[i];
      if (!lbl.active) continue;

      lbl.timeSinceLastHit += dt;
      lbl.totalAge += dt;
      lbl.worldPos.y += 1.15 * dt; // Float gently upward
      lbl.scalePunch = Math.max(1.0, lbl.scalePunch - 2.5 * dt);

      if (lbl.totalAge >= lbl.maxLife) {
        lbl.active = false;
        lbl.targetId = -1;
        if (lbl.domEl) lbl.domEl.classList.add('hidden');
        continue;
      }

      if (lbl.domEl && camera && this.THREE && typeof window !== 'undefined') {
        const proj = new this.THREE.Vector3(lbl.worldPos.x, lbl.worldPos.y, lbl.worldPos.z);
        proj.project(camera);

        if (proj.z > 1.0) {
          lbl.domEl.classList.add('hidden');
        } else {
          lbl.domEl.classList.remove('hidden');
          const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
          const opacity = clamp(1.0 - (lbl.totalAge / lbl.maxLife) ** 2, 0, 1);
          lbl.domEl.style.transform = `translate(-50%, -50%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${lbl.scalePunch.toFixed(2)})`;
          lbl.domEl.style.opacity = opacity.toFixed(2);
        }
      }
    }
  }
}
