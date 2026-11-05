/**
 * SANGUINE_RUNNER — Phase 2: Core Combat, Stagger/Executions, Object-Pooled VFX/Gibs,
 * Batched Damage Numbers, Interleaved Boid Husks, & Initial Arsenal (Jackal/Casull + Katana)
 */

import * as THREE from '../vendor/three.module.js';
import { CollisionWorld } from './physics/CollisionWorld.js';
import { KinematicController } from './physics/KinematicController.js';
import { MovementConfig, MovementState, WallSide } from './physics/MovementConfig.js';
import { CameraRig } from './core/CameraRig.js';
import { InputManager } from './core/InputManager.js';
import { ArenaSpawnPoints, buildGreyboxCollisionWorld } from './world/ArenaGeometryData.js';
import { ArenaBuilder } from './world/ArenaBuilder.js';
import { AudioManager } from './audio/AudioManager.js';
import { VFXAndPoolManager } from './combat/VFXAndPoolManager.js';
import { TargetHuskManager } from './combat/TargetHuskManager.js';
import { WeaponSystem } from './combat/WeaponSystem.js';
import { WeaponSlot } from './combat/WeaponDefinitions.js';
import { ViewmodelRenderer } from './rendering/ViewmodelRenderer.js';

class SanguineGreyboxApp {
  constructor() {
    this.canvasContainer = document.getElementById('viewport');
    this.speedLinesCanvas = document.getElementById('speed-lines');
    this.speedLinesCtx = this.speedLinesCanvas.getContext('2d');
    this.damageLabelsContainer = document.getElementById('damage-numbers-layer');

    // 1. Initialize Three.js Renderer, Scene & Camera
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      MovementConfig.BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      320.0
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // 2. Build Deterministic Collision World & Visual Greybox Arena
    this.collisionWorld = new CollisionWorld();
    buildGreyboxCollisionWorld(this.collisionWorld);
    ArenaBuilder.buildThreeScene(this.scene, this.collisionWorld);

    // 3. Initialize 120Hz Kinematic Controller & First-Person Camera Rig
    this.activeSpawnKey = 'COURTYARD';
    const initialSpawn = ArenaSpawnPoints[this.activeSpawnKey];
    this.controller = new KinematicController(this.collisionWorld, initialSpawn.position);
    this.controller.yaw = initialSpawn.yaw;
    this.cameraRig = new CameraRig(this.controller);

    // 4. Initialize Phase 2 Combat Systems (Audio, Object-Pooled VFX/Gibs, Swarm Husks, Weapons, Viewmodels)
    this.audio = new AudioManager();
    this.vfx = new VFXAndPoolManager({
      THREE,
      scene: this.scene,
      labelsContainer: this.damageLabelsContainer,
    });
    this.huskManager = new TargetHuskManager({
      vfx: this.vfx,
      audio: this.audio,
      THREE,
      scene: this.scene,
    });
    this.huskManager.populateArenaWave();

    this.weaponSystem = new WeaponSystem({
      controller: this.controller,
      huskManager: this.huskManager,
      vfx: this.vfx,
      audio: this.audio,
      cameraRig: this.cameraRig,
    });
    this.viewmodel = new ViewmodelRenderer(this.camera, this.weaponSystem);

    // 5. Input Manager & Teleport Hotkeys
    this.lastMoveInput = { moveForward: 0, moveRight: 0 };
    this.footstepAccum = 0.0;
    this.input = new InputManager(
      this.renderer.domElement,
      (dx, dy) => this.cameraRig.applyMouseDelta(dx, dy),
      (code) => this._handleHotkey(code)
    );

    const lockOverlay = document.getElementById('pointer-lock-overlay');
    lockOverlay.addEventListener('click', () => this.input.requestPointerLock());
    this.renderer.domElement.addEventListener('click', () => this.input.requestPointerLock());

    document.addEventListener('pointerlockchange', () => {
      if (this.input.isPointerLocked) {
        lockOverlay.classList.add('hidden');
      } else {
        lockOverlay.classList.remove('hidden');
      }
    });

    // 6. Cache HUD Elements for Zero-GC Telemetry Updates
    this._cacheHudElements();

    // 7. Fixed 120Hz Timestep Loop State
    this.fixedDt = MovementConfig.DT;
    this.accumulator = 0.0;
    this.lastFrameTime = performance.now();
    this.fpsFrameCount = 0;
    this.fpsLastSample = performance.now();
    this.displayedFps = 120;
    this.physicsStepMs = 0.04;

    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    requestAnimationFrame((now) => this._loop(now));
  }

  _handleHotkey(code) {
    const spawnMap = {
      Digit1: 'COURTYARD',
      Digit2: 'WALL_RUN_CHASM',
      Digit3: 'SLOPE_AQUEDUCT',
      Digit4: 'MANTLE_TOWER',
      Digit5: 'BHOP_SPEEDWAY',
    };

    if (spawnMap[code]) {
      this.activeSpawnKey = spawnMap[code];
      const sp = ArenaSpawnPoints[this.activeSpawnKey];
      this.controller.respawn(sp.position, sp.yaw);
      this._updateZoneBanner(sp.name);
    } else if (code === 'Backspace') {
      const sp = ArenaSpawnPoints[this.activeSpawnKey];
      this.controller.respawn(sp.position, sp.yaw);
      this.huskManager.populateArenaWave();
    }
  }

  _updateZoneBanner(zoneName) {
    if (this.hud.zoneName) {
      this.hud.zoneName.textContent = zoneName;
    }
  }

  _cacheHudElements() {
    this.hud = {
      speedValue: document.getElementById('hud-speed-val'),
      peakValue: document.getElementById('hud-peak-val'),
      speedBar: document.getElementById('hud-speed-bar'),
      bhopCount: document.getElementById('hud-bhop-val'),
      statePill: document.getElementById('hud-state-pill'),
      fovVal: document.getElementById('hud-fov-val'),
      rollVal: document.getElementById('hud-roll-val'),
      fpsVal: document.getElementById('hud-fps-val'),
      physVal: document.getElementById('hud-phys-val'),
      posVal: document.getElementById('hud-pos-val'),
      wallArc: document.getElementById('hud-wallrun-bar'),
      slideArc: document.getElementById('hud-slide-bar'),
      zoneName: document.getElementById('hud-zone-name'),
      // Combat HUD
      hpVal: document.getElementById('hud-hp-val'),
      bloodVal: document.getElementById('hud-blood-val'),
      bloodBar: document.getElementById('hud-blood-bar'),
      weaponName: document.getElementById('hud-weapon-name'),
      ammoVal: document.getElementById('hud-ammo-val'),
      empoweredBadge: document.getElementById('hud-empowered-badge'),
      reloadWrap: document.getElementById('hud-reload-wrap'),
      reloadCursor: document.getElementById('hud-reload-cursor'),
      combatEvent: document.getElementById('hud-combat-event'),
      killsVal: document.getElementById('hud-kills-val'),
      gibsVal: document.getElementById('hud-gibs-val'),
      hitstopOverlay: document.getElementById('hitstop-flash'),
    };
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.speedLinesCanvas.width = w;
    this.speedLinesCanvas.height = h;
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const frameDt = Math.min((now - this.lastFrameTime) * 0.001, 0.1);
    this.lastFrameTime = now;
    this.accumulator += frameDt;

    // 1. Execute Fixed 120Hz Simulation Steps (respecting Micro-Hitstop Freeze Frames!)
    const t0 = performance.now();
    let ticksExecuted = 0;
    while (this.accumulator >= this.fixedDt && ticksExecuted < 8) {
      const tickInput = this.input.sampleTickInput();
      this.lastMoveInput = tickInput;

      if (this.weaponSystem.hitstopTicksRemaining > 0) {
        // Micro-Hitstop Freeze Frame: pause physics & swarm step for 2-4 ticks while keeping input & camera shake alive!
        this.weaponSystem.hitstopTicksRemaining--;
      } else {
        this.controller.step(tickInput, this.fixedDt);
        this.weaponSystem.step(tickInput, this.fixedDt);
        this.huskManager.step(this.fixedDt, this.controller.position);

        // Pitch-varied footsteps during grounded RUN or WALL_RUN
        const hSpd = this.controller.getHorizontalSpeed();
        if (
          (this.controller.state === MovementState.RUN && this.controller.grounded) ||
          this.controller.state === MovementState.WALL_RUN
        ) {
          this.footstepAccum += hSpd * this.fixedDt;
          if (this.footstepAccum >= 3.6) {
            this.footstepAccum = 0.0;
            this.audio.playFootstep();
          }
        }
      }

      if (this.controller.position.y < -15.0) {
        const sp = ArenaSpawnPoints[this.activeSpawnKey];
        this.controller.respawn(sp.position, sp.yaw);
      }

      this.accumulator -= this.fixedDt;
      ticksExecuted++;
    }
    if (ticksExecuted > 0) {
      this.physicsStepMs = (performance.now() - t0) / ticksExecuted;
    }

    // 2. Interpolate Camera Rig, Apply Directional Trauma Shake & Update Viewmodels + Pooled VFX
    const alpha = this.accumulator / this.fixedDt;
    this.cameraRig.update(frameDt, alpha, this.lastMoveInput);

    // Quadratic Trauma Shake (Shake = MaxAngle * Trauma^2)
    const traumaSq = this.weaponSystem.cameraTrauma * this.weaponSystem.cameraTrauma;
    const shakePitch = traumaSq * (Math.sin(now * 0.065) * 0.032);
    const shakeYaw = traumaSq * (Math.cos(now * 0.082) * 0.028);
    const shakeRoll = traumaSq * (Math.sin(now * 0.095) * 0.045);

    this.camera.position.set(
      this.cameraRig.eyePosition.x,
      this.cameraRig.eyePosition.y,
      this.cameraRig.eyePosition.z
    );
    this.camera.rotation.set(
      this.cameraRig.eulerYXZ.pitch + shakePitch,
      this.cameraRig.eulerYXZ.yaw + shakeYaw,
      this.cameraRig.eulerYXZ.roll + shakeRoll,
      'YXZ'
    );

    if (Math.abs(this.camera.fov - this.cameraRig.currentFov) > 0.05) {
      this.camera.fov = this.cameraRig.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.viewmodel.update(frameDt);
    this.vfx.update(frameDt, this.camera);

    // 3. Render 3D Scene
    this.renderer.render(this.scene, this.camera);

    // 4. Update Speed Lines & Telemetry HUD
    this._renderSpeedLines(now);
    this._updateHud(now);
  }

  _renderSpeedLines(now) {
    const hSpeed = this.controller.getHorizontalSpeed();
    const ctx = this.speedLinesCtx;
    const w = this.speedLinesCanvas.width;
    const h = this.speedLinesCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (hSpeed < 16.0 && !this.weaponSystem.isBloodDashing) return;

    const intensity = this.weaponSystem.isBloodDashing
      ? 1.0
      : Math.min(1.0, (hSpeed - 16.0) / 12.0);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const numLines = Math.floor(14 + intensity * 26);

    ctx.strokeStyle = `rgba(230, 0, 18, ${(0.20 + intensity * 0.38).toFixed(2)})`;
    ctx.lineWidth = 2;

    const seed = Math.floor(now * 0.03);
    for (let i = 0; i < numLines; i++) {
      const angle = ((i * 137.5 + seed * 19) % 360) * (Math.PI / 180);
      const rInner = Math.min(w, h) * (0.35 + ((i * 29) % 10) * 0.012);
      const rOuter = Math.min(w, h) * (0.52 + intensity * 0.18);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
      ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
      ctx.stroke();
    }
  }

  _updateHud(now) {
    this.fpsFrameCount++;
    if (now - this.fpsLastSample >= 250) {
      this.displayedFps = Math.round((this.fpsFrameCount * 1000) / (now - this.fpsLastSample));
      this.fpsFrameCount = 0;
      this.fpsLastSample = now;
      this.hud.fpsVal.textContent = `${this.displayedFps}`;
      this.hud.physVal.textContent = `${this.physicsStepMs.toFixed(2)} ms`;
    }

    const ctrl = this.controller;
    const ws = this.weaponSystem;
    const hSpeed = ctrl.getHorizontalSpeed();

    this.hud.speedValue.textContent = hSpeed.toFixed(1);
    this.hud.peakValue.textContent = ctrl.peakHorizontalSpeed.toFixed(1);
    this.hud.bhopCount.textContent = `${ctrl.bhopChainCount}x`;

    const speedPct = Math.min(100, (hSpeed / 28.0) * 100);
    this.hud.speedBar.style.width = `${speedPct.toFixed(1)}%`;

    let stateLabel = ctrl.state;
    if (ws.isBloodDashing) {
      stateLabel = 'BLOOD-DASH [115 m/s]';
    } else if (ctrl.state === MovementState.WALL_RUN) {
      stateLabel = ctrl.wallSide === WallSide.LEFT ? 'WALL_RUN [LEFT]' : 'WALL_RUN [RIGHT]';
    }
    this.hud.statePill.textContent = stateLabel;
    this.hud.statePill.dataset.state = ctrl.state;

    this.hud.fovVal.textContent = `${this.cameraRig.currentFov.toFixed(1)}°`;
    const rollDeg = (this.cameraRig.currentRollRad * 180) / Math.PI;
    this.hud.rollVal.textContent = `${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`;
    this.hud.posVal.textContent = `${ctrl.position.x.toFixed(1)}, ${ctrl.position.y.toFixed(1)}, ${ctrl.position.z.toFixed(1)}`;

    // Center Crosshair Arcs (Left = Blood Gauge, Right = Dash/Wall-Run Ready)
    const bloodRatio = ws.blood / ws.maxBlood;
    this.hud.slideArc.style.transform = `scaleY(${bloodRatio.toFixed(2)})`;

    let rightArcRatio = 1.0;
    if (ws.currentSlot === WeaponSlot.OCCULT_KATANA && ws.katanaDashCooldown > 0) {
      rightArcRatio = 1.0 - ws.katanaDashCooldown / ws.weapons[1].altFire.cooldownSec;
    } else if (ctrl.state === MovementState.WALL_RUN) {
      rightArcRatio = Math.max(0, 1.0 - ctrl.wallRunTimer / ctrl.cfg.WALL_MAX_DURATION);
    }
    this.hud.wallArc.style.transform = `scaleY(${rightArcRatio.toFixed(2)})`;

    // Combat HUD Updates
    this.hud.hpVal.textContent = `${Math.round(ws.hp)} // ${ws.maxHp}`;
    this.hud.bloodVal.textContent = `${Math.round(ws.blood)} // ${ws.maxBlood}`;
    this.hud.bloodBar.style.width = `${(bloodRatio * 100).toFixed(1)}%`;

    const activeWeapon = ws.weapons[ws.currentSlot];
    this.hud.weaponName.textContent = activeWeapon.displayName;
    if (ws.currentSlot === WeaponSlot.JACKAL_AND_CASULL) {
      this.hud.ammoVal.textContent = `${ws.pistolAmmo} / ${ws.pistolMaxAmmo} [${ws.pistolNextBarrel}]`;
      this.hud.empoweredBadge.style.display = ws.isEmpoweredMag ? 'inline-block' : 'none';
    } else {
      const dashReady = ws.katanaDashCooldown <= 0 ? 'DASH READY' : `DASH ${(ws.katanaDashCooldown).toFixed(1)}s`;
      this.hud.ammoVal.textContent = `INF EDGE [${dashReady}]`;
      this.hud.empoweredBadge.style.display = 'none';
    }

    // Active Blood Reload Bar
    if (ws.isReloading) {
      this.hud.reloadWrap.classList.remove('hidden');
      const pct = (ws.reloadTimer / ws.weapons[0].ammo.reloadDurationSec) * 100;
      this.hud.reloadCursor.style.left = `${Math.min(100, pct).toFixed(1)}%`;
    } else {
      this.hud.reloadWrap.classList.add('hidden');
    }

    this.hud.combatEvent.textContent = ws.lastCombatEvent;
    this.hud.killsVal.textContent = `${this.huskManager.totalKills}`;
    this.hud.gibsVal.textContent = `${this.huskManager.totalGibKills}`;

    if (ws.hitstopTicksRemaining > 0) {
      this.hud.hitstopOverlay.classList.add('active');
    } else {
      this.hud.hitstopOverlay.classList.remove('active');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__SANGUINE_APP__ = new SanguineGreyboxApp();
});
