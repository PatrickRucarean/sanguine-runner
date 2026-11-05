/**
 * SANGUINE_RUNNER — Procedural Low-Poly 3D First-Person Weapon Viewmodel Renderer
 * Renders all 5 Master Armory Weapons:
 *  0. The Jackal & Casull (Twin Auto-Cannons)
 *  1. Trench Blood-Shotgun (4-Gauge Scattergun)
 *  2. Stake & Hammer (Consecrated Stake + Inquisition Mallet)
 *  3. Alucard Heirloom Sword (Cruciform Broadsword)
 *  4. Occult Scythe (Crescent Grim-Reaper Scythe)
 */

import * as THREE from '../../vendor/three.module.js';
import { WeaponSlot } from '../combat/WeaponDefinitions.js';

export class ViewmodelRenderer {
  /**
   * @param {THREE.Camera} camera
   * @param {import('../combat/WeaponSystem.js').WeaponSystem} weaponSystem
   */
  constructor(camera, weaponSystem) {
    this.camera = camera;
    this.weaponSystem = weaponSystem;

    this.rootGroup = new THREE.Group();
    this.camera.add(this.rootGroup);

    this.pistolsGroup = new THREE.Group();
    this.shotgunGroup = new THREE.Group();
    this.stakeHammerGroup = new THREE.Group();
    this.swordGroup = new THREE.Group();
    this.scytheGroup = new THREE.Group();

    this.rootGroup.add(
      this.pistolsGroup,
      this.shotgunGroup,
      this.stakeHammerGroup,
      this.swordGroup,
      this.scytheGroup
    );

    this._buildDualPistolsMesh();
    this._buildShotgunMesh();
    this._buildStakeHammerMesh();
    this._buildAlucardSwordMesh();
    this._buildOccultScytheMesh();
  }

  _buildDualPistolsMesh() {
    this.casullGroup = new THREE.Group();
    this.casullGroup.position.set(0.27, -0.22, -0.45);

    const silverMat = new THREE.MeshLambertMaterial({ color: 0xdce4f2, flatShading: true });
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x1c1817, flatShading: true });
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    const cSlide = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.36), silverMat);
    const cGrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), gripMat);
    cGrip.position.set(0, -0.10, 0.11);
    cGrip.rotation.x = 0.22;
    const cCross = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.015, 0.18), goldMat);
    cCross.position.set(0, 0.02, -0.02);

    this.casullGroup.add(cSlide, cGrip, cCross);
    this.pistolsGroup.add(this.casullGroup);

    this.jackalGroup = new THREE.Group();
    this.jackalGroup.position.set(-0.27, -0.22, -0.46);

    const blackIronMat = new THREE.MeshLambertMaterial({ color: 0x1e2029, flatShading: true });
    const crimsonMat = new THREE.MeshBasicMaterial({ color: 0xe60012 });

    const jSlide = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.098, 0.42), blackIronMat);
    const jGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.095), gripMat);
    jGrip.position.set(0, -0.11, 0.13);
    jGrip.rotation.x = 0.22;
    const jStripe = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.018, 0.32), crimsonMat);
    jStripe.position.set(0, 0.022, -0.03);

    this.jackalGroup.add(jSlide, jGrip, jStripe);
    this.pistolsGroup.add(this.jackalGroup);
  }

  _buildShotgunMesh() {
    this.shotgunPivot = new THREE.Group();
    this.shotgunPivot.position.set(0.22, -0.25, -0.48);

    const ironMat = new THREE.MeshLambertMaterial({ color: 0x262832, flatShading: true });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x3b1d16, flatShading: true });
    const crimsonMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });

    const barrelL = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.048, 0.62), ironMat);
    barrelL.position.set(-0.028, 0.03, -0.12);
    const barrelR = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.048, 0.62), ironMat);
    barrelR.position.set(0.028, 0.03, -0.12);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.32), woodMat);
    stock.position.set(0, -0.03, 0.22);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.56), crimsonMat);
    rib.position.set(0, 0.06, -0.12);

    this.shotgunPivot.add(barrelL, barrelR, stock, rib);
    this.shotgunGroup.add(this.shotgunPivot);
  }

  _buildStakeHammerMesh() {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x4b2418, flatShading: true });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x626a7a, flatShading: true });
    const crimsonMat = new THREE.MeshBasicMaterial({ color: 0xe60012 });

    // Left Hand: Consecrated Iron-Shod Stake
    this.stakePivot = new THREE.Group();
    this.stakePivot.position.set(-0.24, -0.24, -0.44);
    this.stakePivot.rotation.set(-0.35, 0.25, 0);
    const stakeShaft = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.52, 5), woodMat);
    stakeShaft.rotation.x = -Math.PI * 0.5;
    const stakeTip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), crimsonMat);
    stakeTip.rotation.x = -Math.PI * 0.5;
    stakeTip.position.z = -0.24;
    this.stakePivot.add(stakeShaft, stakeTip);

    // Right Hand: Heavy Inquisition Mallet
    this.hammerPivot = new THREE.Group();
    this.hammerPivot.position.set(0.26, -0.22, -0.44);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), woodMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.22), steelMat);
    head.position.set(0, 0.16, -0.02);
    this.hammerPivot.add(handle, head);

    this.stakeHammerGroup.add(this.stakePivot, this.hammerPivot);
  }

  _buildAlucardSwordMesh() {
    this.swordPivot = new THREE.Group();
    this.swordPivot.position.set(0.28, -0.26, -0.46);
    this.swordPivot.rotation.set(0.30, -0.30, 0.25);

    const silverBladeMat = new THREE.MeshLambertMaterial({ color: 0xd0d8e8, flatShading: true });
    const crimsonFullerMat = new THREE.MeshBasicMaterial({ color: 0xe60012 });
    const goldGuardMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x181416, flatShading: true });

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.068, 0.96), silverBladeMat);
    blade.position.set(0, 0.05, -0.40);
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.020, 0.86), crimsonFullerMat);
    fuller.position.set(0, 0.05, -0.36);
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.035), goldGuardMat);
    crossguard.position.set(0, 0.05, 0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.22), gripMat);
    grip.position.set(0, 0.05, 0.20);

    this.swordPivot.add(blade, fuller, crossguard, grip);
    this.swordGroup.add(this.swordPivot);
  }

  _buildOccultScytheMesh() {
    this.scythePivot = new THREE.Group();
    this.scythePivot.position.set(0.32, -0.28, -0.52);
    this.scythePivot.rotation.set(0.22, -0.38, 0.35);

    const shaftMat = new THREE.MeshLambertMaterial({ color: 0x1a151c, flatShading: true });
    const crimsonTipMat = new THREE.MeshBasicMaterial({ color: 0xff0a1e });
    const goldCollarMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    // Long 4.0m Reach Occult Pole Shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 1.18), shaftMat);
    shaft.position.set(0, 0.02, -0.35);

    // Collar & Crescent Sweet-Spot Blade Tip
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), goldCollarMat);
    collar.position.set(0, 0.03, -0.88);

    const crescentBlade = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.022, 0.14), crimsonTipMat);
    crescentBlade.position.set(-0.22, 0.03, -0.92);
    crescentBlade.rotation.y = 0.28;

    this.scythePivot.add(shaft, collar, crescentBlade);
    this.scytheGroup.add(this.scythePivot);
  }

  update(dt) {
    const ws = this.weaponSystem;
    const slot = ws.currentSlot;

    this.pistolsGroup.visible = slot === WeaponSlot.JACKAL_CASULL;
    this.shotgunGroup.visible = slot === WeaponSlot.TRENCH_SHOTGUN;
    this.stakeHammerGroup.visible = slot === WeaponSlot.STAKE_HAMMER;
    this.swordGroup.visible = slot === WeaponSlot.ALUCARD_SWORD;
    this.scytheGroup.visible = slot === WeaponSlot.OCCULT_SCYTHE;

    const kick = ws.vmKickBack;
    const pitch = ws.vmPitchKick;
    const swing = ws.vmSwingPhase;
    const dir = ws.katanaComboStep % 2 === 0 ? 1 : -1;

    if (slot === WeaponSlot.JACKAL_CASULL) {
      const reloadSpin = ws.isReloading
        ? Math.sin((ws.reloadTimer / ws.weapons[0].ammo.reloadDurationSec) * Math.PI * 2) * 1.4
        : 0;
      const casullBias = ws.lastFiredBarrel === 'CASULL' ? 1.0 : 0.35;
      const jackalBias = ws.lastFiredBarrel === 'JACKAL' ? 1.0 : 0.35;

      this.casullGroup.position.z = -0.45 + kick * casullBias * 0.45;
      this.casullGroup.rotation.x = pitch * casullBias + reloadSpin;

      this.jackalGroup.position.z = -0.46 + kick * jackalBias * 0.55;
      this.jackalGroup.rotation.x = pitch * jackalBias + reloadSpin;
    } else if (slot === WeaponSlot.TRENCH_SHOTGUN) {
      this.shotgunPivot.position.z = -0.48 + kick * 0.55;
      this.shotgunPivot.rotation.x = pitch * 1.1 + (ws.isReloading ? -0.55 : 0);
    } else if (slot === WeaponSlot.STAKE_HAMMER) {
      this.stakePivot.position.z = -0.44 - swing * 0.28;
      this.hammerPivot.position.z = -0.44 - swing * 0.32;
      this.hammerPivot.rotation.x = -swing * 1.15;
    } else if (slot === WeaponSlot.ALUCARD_SWORD) {
      if (ws.parryWindowTimer > 0) {
        this.swordPivot.position.set(0.05, -0.14, -0.42);
        this.swordPivot.rotation.set(0.1, 0.0, 1.35);
      } else {
        this.swordPivot.position.set(
          0.28 - swing * 0.36 * dir,
          -0.26 + swing * 0.10,
          -0.46 - swing * 0.14
        );
        this.swordPivot.rotation.set(
          0.30 - swing * 0.80,
          -0.30 + swing * 1.30 * dir,
          0.25 + swing * 0.90 * dir
        );
      }
    } else if (slot === WeaponSlot.OCCULT_SCYTHE) {
      if (ws.isBloodDashing) {
        this.scythePivot.position.set(0.08, -0.16, -0.68);
        this.scythePivot.rotation.set(-0.15, 0.1, -1.2);
      } else {
        this.scythePivot.position.set(
          0.32 - swing * 0.42 * dir,
          -0.28 + swing * 0.12,
          -0.52 - swing * 0.16
        );
        this.scythePivot.rotation.set(
          0.22 - swing * 0.85,
          -0.38 + swing * 1.45 * dir,
          0.35 + swing * 0.95 * dir
        );
      }
    }
  }
}
