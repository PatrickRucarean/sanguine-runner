/**
 * SANGUINE_RUNNER — Phase 1: 120Hz Kinematic Controller & Movement Greybox Bootstrapper
 */

import * as THREE from '../vendor/three.module.js';
import { CollisionWorld } from './physics/CollisionWorld.js';
import { KinematicController } from './physics/KinematicController.js';
import { MovementConfig, MovementState, WallSide } from './physics/MovementConfig.js';
import { CameraRig } from './core/CameraRig.js';
import { InputManager } from './core/InputManager.js';
import { ArenaSpawnPoints, buildGreyboxCollisionWorld } from './world/ArenaGeometryData.js';
import { ArenaBuilder } from './world/ArenaBuilder.js';

class SanguineGreyboxApp {
  constructor() {
    this.canvasContainer = document.getElementById('viewport');
    this.speedLinesCanvas = document.getElementById('speed-lines');
    this.speedLinesCtx = this.speedLinesCanvas.getContext('2d');

    // 1. Initialize Three.js Renderer, Scene & Camera
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // Crisp retro PSX/boomer-shooter edges + max FPS
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

    // 4. Input Manager & Teleport Hotkeys
    this.lastMoveInput = { moveForward: 0, moveRight: 0 };
    this.input = new InputManager(
      this.renderer.domElement,
      (dx, dy) => this.cameraRig.applyMouseDelta(dx, dy),
      (code) => this._handleHotkey(code)
    );

    // Click overlay / canvas to engage Pointer Lock
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

    // 5. Cache HUD Elements for Zero-GC Telemetry Updates
    this._cacheHudElements();

    // 6. Fixed 120Hz Timestep Loop State
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
    } else if (code === 'KeyR') {
      const sp = ArenaSpawnPoints[this.activeSpawnKey];
      this.controller.respawn(sp.position, sp.yaw);
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
      milestones: {
        sprintReached: document.getElementById('ms-sprint'),
        slideExecuted: document.getElementById('ms-slide'),
        slideJumpBhop: document.getElementById('ms-slidejump'),
        slopeBoost20: document.getElementById('ms-slope'),
        wallRunLocked: document.getElementById('ms-wallrun'),
        wallKickExecuted: document.getElementById('ms-wallkick'),
        ledgeMantled: document.getElementById('ms-mantle'),
      },
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

    // 1. Execute Fixed 120Hz Simulation Steps
    const t0 = performance.now();
    let ticksExecuted = 0;
    while (this.accumulator >= this.fixedDt && ticksExecuted < 8) {
      const tickInput = this.input.sampleTickInput();
      this.lastMoveInput = tickInput;
      this.controller.step(tickInput, this.fixedDt);

      // Safety respawn if falling below abyss floor
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

    // 2. Interpolate Camera Rig & Update Dynamic FOV
    const alpha = this.accumulator / this.fixedDt;
    this.cameraRig.update(frameDt, alpha, this.lastMoveInput);

    this.camera.position.set(
      this.cameraRig.eyePosition.x,
      this.cameraRig.eyePosition.y,
      this.cameraRig.eyePosition.z
    );
    this.camera.rotation.set(
      this.cameraRig.eulerYXZ.pitch,
      this.cameraRig.eulerYXZ.yaw,
      this.cameraRig.eulerYXZ.roll,
      'YXZ'
    );

    if (Math.abs(this.camera.fov - this.cameraRig.currentFov) > 0.05) {
      this.camera.fov = this.cameraRig.currentFov;
      this.camera.updateProjectionMatrix();
    }

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

    if (hSpeed < 16.5) return;

    const intensity = Math.min(1.0, (hSpeed - 16.5) / 12.0);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const numLines = Math.floor(14 + intensity * 24);

    ctx.strokeStyle = `rgba(230, 0, 18, ${(0.18 + intensity * 0.35).toFixed(2)})`;
    ctx.lineWidth = 2;

    const seed = Math.floor(now * 0.03);
    for (let i = 0; i < numLines; i++) {
      const angle = ((i * 137.5 + seed * 19) % 360) * (Math.PI / 180);
      const rInner = Math.min(w, h) * (0.36 + ((i * 29) % 10) * 0.012);
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
    const hSpeed = ctrl.getHorizontalSpeed();

    this.hud.speedValue.textContent = hSpeed.toFixed(1);
    this.hud.peakValue.textContent = ctrl.peakHorizontalSpeed.toFixed(1);
    this.hud.bhopCount.textContent = `${ctrl.bhopChainCount}x`;

    const speedPct = Math.min(100, (hSpeed / 28.0) * 100);
    this.hud.speedBar.style.width = `${speedPct.toFixed(1)}%`;

    // State display & styling
    let stateLabel = ctrl.state;
    if (ctrl.state === MovementState.WALL_RUN) {
      stateLabel = ctrl.wallSide === WallSide.LEFT ? 'WALL_RUN [LEFT]' : 'WALL_RUN [RIGHT]';
    }
    this.hud.statePill.textContent = stateLabel;
    this.hud.statePill.dataset.state = ctrl.state;

    // Camera FOV & Roll
    this.hud.fovVal.textContent = `${this.cameraRig.currentFov.toFixed(1)}°`;
    const rollDeg = (this.cameraRig.currentRollRad * 180) / Math.PI;
    this.hud.rollVal.textContent = `${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`;

    // Position readout
    this.hud.posVal.textContent = `${ctrl.position.x.toFixed(1)}, ${ctrl.position.y.toFixed(1)}, ${ctrl.position.z.toFixed(1)}`;

    // Center Crosshair Arcs (Wall-Run duration & Slide Boost Cooldown)
    const wallRatio =
      ctrl.state === MovementState.WALL_RUN
        ? Math.max(0, 1.0 - ctrl.wallRunTimer / ctrl.cfg.WALL_MAX_DURATION)
        : 1.0;
    this.hud.wallArc.style.transform = `scaleY(${wallRatio.toFixed(2)})`;

    const slideReadyRatio =
      ctrl.slideBoostCooldown > 0
        ? 1.0 - ctrl.slideBoostCooldown / ctrl.cfg.SLIDE_BOOST_COOLDOWN
        : 1.0;
    this.hud.slideArc.style.transform = `scaleY(${slideReadyRatio.toFixed(2)})`;

    // Update Course Verification Checklist
    for (const [key, elem] of Object.entries(this.hud.milestones)) {
      if (elem && ctrl.milestones[key]) {
        elem.classList.add('done');
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__SANGUINE_APP__ = new SanguineGreyboxApp();
});
