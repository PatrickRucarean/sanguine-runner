/**
 * SANGUINE_RUNNER — Procedural Low-Poly 3D First-Person Weapon Viewmodel Renderer
 * Renders The Jackal & Casull (Twin Auto-Cannons) and the Occult Katana
 * with spring-damped recoil kick, reload spin, and slash arcs.
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
    this.katanaGroup = new THREE.Group();
    this.rootGroup.add(this.pistolsGroup);
    this.rootGroup.add(this.katanaGroup);

    this._buildDualPistolsMesh();
    this._buildKatanaMesh();
  }

  _buildDualPistolsMesh() {
    // 1. RIGHT HAND: CASULL (.454 Blessed Silver Handcannon)
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

    // 2. LEFT HAND: THE JACKAL (13mm Blackened Iron Monster Cannon)
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

  _buildKatanaMesh() {
    this.katanaPivot = new THREE.Group();
    this.katanaPivot.position.set(0.30, -0.26, -0.48);
    this.katanaPivot.rotation.set(0.25, -0.35, 0.38);

    const obsidianMat = new THREE.MeshLambertMaterial({ color: 0x111218, flatShading: true });
    const crimsonEdgeMat = new THREE.MeshBasicMaterial({ color: 0xff0a1e });
    const goldGuardMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    // Blade Spine
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.042, 0.92), obsidianMat);
    blade.position.set(0, 0.05, -0.38);

    // Glowing Arterial Edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.93), crimsonEdgeMat);
    edge.position.set(0, 0.025, -0.38);

    // Tsuba Guard & Tsuka Grip
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), goldGuardMat);
    guard.position.set(0, 0.04, 0.08);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.24), obsidianMat);
    handle.position.set(0, 0.04, 0.20);

    this.katanaPivot.add(blade, edge, guard, handle);
    this.katanaGroup.add(this.katanaPivot);
  }

  update(dt) {
    const ws = this.weaponSystem;
    const isPistols = ws.currentSlot === WeaponSlot.JACKAL_AND_CASULL;
    this.pistolsGroup.visible = isPistols;
    this.katanaGroup.visible = !isPistols;

    if (isPistols) {
      const kick = ws.vmKickBack;
      const pitch = ws.vmPitchKick;
      const reloadSpin = ws.isReloading
        ? Math.sin((ws.reloadTimer / ws.weapons[0].ammo.reloadDurationSec) * Math.PI * 2) * 1.4
        : 0;

      const casullBias = ws.lastFiredBarrel === 'CASULL' ? 1.0 : 0.35;
      const jackalBias = ws.lastFiredBarrel === 'JACKAL' ? 1.0 : 0.35;

      this.casullGroup.position.z = -0.45 + kick * casullBias * 0.45;
      this.casullGroup.rotation.x = pitch * casullBias + reloadSpin;

      this.jackalGroup.position.z = -0.46 + kick * jackalBias * 0.55;
      this.jackalGroup.rotation.x = pitch * jackalBias + reloadSpin;
    } else {
      const swing = ws.vmSwingPhase;
      const dir = ws.katanaComboStep % 2 === 0 ? 1 : -1;

      if (ws.isBloodDashing) {
        this.katanaPivot.position.set(0.08, -0.16, -0.68);
        this.katanaPivot.rotation.set(-0.15, 0.1, -1.2);
      } else {
        this.katanaPivot.position.set(
          0.30 - swing * 0.38 * dir,
          -0.26 + swing * 0.12,
          -0.48 - swing * 0.14
        );
        this.katanaPivot.rotation.set(
          0.25 - swing * 0.85,
          -0.35 + swing * 1.35 * dir,
          0.38 + swing * 0.95 * dir
        );
      }
    }
  }
}
