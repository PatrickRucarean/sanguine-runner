/**
 * SANGUINE_RUNNER — Data-Driven Weapon & Context Combat Engine
 * Orchestrates The Jackal & Casull (Slot 0), Occult Katana (Slot 1),
 * Context-Sensitive Quick Melee (Slide Blood-Kick, Vampiric Execution, Sanguine Claw),
 * Active Blood Reload, Micro-Hitstop Freeze Frames, FOV Punch, and Camera Trauma.
 */

import { Vec3, clamp } from '../physics/Vec3.js';
import { MovementState } from '../physics/MovementConfig.js';
import { WeaponDefinitions, WeaponSlot, QuickMeleeConfig } from './WeaponDefinitions.js';
import { HuskState, MAX_HUSKS } from './TargetHuskManager.js';

const DEG2RAD = Math.PI / 180.0;

export class WeaponSystem {
  /**
   * @param {Object} opts
   * @param {import('../physics/KinematicController.js').KinematicController} opts.controller
   * @param {import('./TargetHuskManager.js').TargetHuskManager} opts.huskManager
   * @param {import('./VFXAndPoolManager.js').VFXAndPoolManager} opts.vfx
   * @param {import('../audio/AudioManager.js').AudioManager} opts.audio
   * @param {import('../core/CameraRig.js').CameraRig} [opts.cameraRig]
   */
  constructor({ controller, huskManager, vfx, audio, cameraRig = null }) {
    this.controller = controller;
    this.husks = huskManager;
    this.vfx = vfx;
    this.audio = audio;
    this.cameraRig = cameraRig;

    // Player Combat Resources
    this.hp = 100;
    this.maxHp = 100;
    this.blood = 100;
    this.maxBlood = 100;

    // Active Slot & Weapon Definitions
    this.currentSlot = WeaponSlot.JACKAL_AND_CASULL;
    this.weapons = WeaponDefinitions;
    this.switchTimer = 0.0;

    // Slot 0: Jackal & Casull State
    this.pistolAmmo = this.weapons[0].ammo.magazineSize;
    this.pistolMaxAmmo = this.weapons[0].ammo.magazineSize;
    this.pistolNextBarrel = 'CASULL'; // Alternates 'CASULL' (Right) <-> 'JACKAL' (Left)
    this.isReloading = false;
    this.reloadTimer = 0.0;
    this.reloadAttemptedActive = false;
    this.isEmpoweredMag = false;
    this.holsterTimer = 0.0;
    this.twinBurstCooldown = 0.0;

    // Slot 1: Occult Katana State
    this.katanaComboStep = 0;
    this.katanaDashCooldown = 0.0;
    this.katanaKillResetWindow = 0.0;
    this.isBloodDashing = false;
    this.bloodDashTimer = 0.0;
    this.bloodDashDir = new Vec3(0, 0, -1);
    this.bloodDashSpeed = 115.0;
    this.bloodDashHitSet = new Set();

    // Primary Fire & Quick Melee Cooldowns
    this.primaryCooldown = 0.0;
    this.quickMeleeCooldown = 0.0;

    // Game Feel ("Juice"): Micro-Hitstop Freeze Frames, FOV Punch, & Directional Trauma
    this.hitstopTicksRemaining = 0;
    this.totalHitstopFramesTriggered = 0;
    this.fovPunchDeg = 0.0;
    this.cameraTrauma = 0.0;

    // Viewmodel Animation State (consumed by ViewmodelRenderer)
    this.vmKickBack = 0.0;
    this.vmPitchKick = 0.0;
    this.vmSwingPhase = 0.0;
    this.lastFiredBarrel = 'NONE';
    this.lastCombatEvent = 'READY';
  }

  /**Normalized 3D camera aim direction from yaw & pitch */
  getAimDirection(out = new Vec3()) {
    const cp = Math.cos(this.controller.pitch);
    const sp = Math.sin(this.controller.pitch);
    const sy = Math.sin(this.controller.yaw);
    const cy = Math.cos(this.controller.yaw);
    return out.set(-sy * cp, sp, -cy * cp).normalize();
  }

  /** World-space eye origin */
  getEyeOrigin(out = new Vec3()) {
    const eyeH =
      this.controller.state === MovementState.SLIDE
        ? this.controller.cfg.SLIDING_EYE_HEIGHT
        : this.controller.cfg.STANDING_EYE_HEIGHT;
    return out.set(
      this.controller.position.x,
      this.controller.position.y + eyeH,
      this.controller.position.z
    );
  }

  /**
   * Injects micro-hitstop freeze frames, FOV punch, and camera recoil/shake.
   */
  triggerJuice({ hitstopFrames = 0, fovPunch = 0, pitchKickDeg = 0, yawJitterDeg = 0, trauma = 0 }) {
    if (hitstopFrames > 0) {
      this.hitstopTicksRemaining = Math.max(this.hitstopTicksRemaining, hitstopFrames);
      this.totalHitstopFramesTriggered += hitstopFrames;
    }
    if (fovPunch > 0) {
      this.fovPunchDeg = Math.min(9.5, this.fovPunchDeg + fovPunch);
      if (this.cameraRig) {
        this.cameraRig.currentFov = Math.min(120.0, this.cameraRig.currentFov + fovPunch);
      }
    }
    if (pitchKickDeg > 0 && this.cameraRig) {
      this.cameraRig.springPitchVel += pitchKickDeg * DEG2RAD * 8.5;
    }
    if (yawJitterDeg > 0) {
      this.controller.yaw += (Math.random() * 2 - 1) * yawJitterDeg * DEG2RAD * 0.35;
    }
    if (trauma > 0) {
      this.cameraTrauma = Math.min(1.0, this.cameraTrauma + trauma);
    }
  }

  /**
   * Switches between Slot 0 (The Jackal & Casull) and Slot 1 (Occult Katana).
   */
  switchWeapon(targetSlot) {
    if (targetSlot === this.currentSlot) return false;
    this.currentSlot = targetSlot;
    this.isReloading = false;
    this.reloadTimer = 0.0;
    this.primaryCooldown = this.weapons[targetSlot].switchTimeSec;
    this.holsterTimer = 0.0;
    this.vmKickBack = 0.18;
    this.lastCombatEvent = `EQUIPPED: ${this.weapons[targetSlot].displayName}`;
    return true;
  }

  toggleWeapon() {
    const nextSlot =
      this.currentSlot === WeaponSlot.JACKAL_AND_CASULL
        ? WeaponSlot.OCCULT_KATANA
        : WeaponSlot.JACKAL_AND_CASULL;
    return this.switchWeapon(nextSlot);
  }

  /**
   * Steps combat timers, Blood-Dash physics, Holster Auto-Reload, and processes combat inputs.
   * @param {Object} combatInput
   * @param {boolean} [combatInput.primaryPressed]
   * @param {boolean} [combatInput.primaryHeld]
   * @param {boolean} [combatInput.altPressed]
   * @param {boolean} [combatInput.quickMeleePressed]
   * @param {boolean} [combatInput.reloadPressed]
   * @param {boolean} [combatInput.swapPressed]
   * @param {number} dt
   */
  step(combatInput = {}, dt = 1 / 120) {
    // Decay visual juice springs
    this.fovPunchDeg = Math.max(0, this.fovPunchDeg - 38.0 * dt);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - 2.8 * dt);
    this.vmKickBack = Math.max(0, this.vmKickBack - 4.5 * dt);
    this.vmPitchKick = Math.max(0, this.vmPitchKick - 5.0 * dt);
    this.vmSwingPhase = Math.max(0, this.vmSwingPhase - 5.5 * dt);

    // Cooldown ticks
    if (this.primaryCooldown > 0) this.primaryCooldown = Math.max(0, this.primaryCooldown - dt);
    if (this.quickMeleeCooldown > 0) this.quickMeleeCooldown = Math.max(0, this.quickMeleeCooldown - dt);
    if (this.twinBurstCooldown > 0) this.twinBurstCooldown = Math.max(0, this.twinBurstCooldown - dt);
    if (this.katanaDashCooldown > 0) this.katanaDashCooldown = Math.max(0, this.katanaDashCooldown - dt);
    if (this.katanaKillResetWindow > 0) {
      this.katanaKillResetWindow = Math.max(0, this.katanaKillResetWindow - dt);
    }

    // Passive Holster Auto-Reload for Jackal & Casull when Katana is equipped
    if (this.currentSlot !== WeaponSlot.JACKAL_AND_CASULL && this.pistolAmmo < this.pistolMaxAmmo) {
      this.holsterTimer += dt;
      if (this.holsterTimer >= this.weapons[0].holsterAutoReloadSec) {
        this.pistolAmmo = this.pistolMaxAmmo;
        this.holsterTimer = 0.0;
        this.lastCombatEvent = 'HOLSTER AUTO-RELOAD READY';
      }
    }

    // Step Active Katana Iaijutsu Blood-Dash
    if (this.isBloodDashing) {
      this._stepKatanaBloodDash(dt);
      return;
    }

    // Handle Weapon Swap
    if (combatInput.swapPressed) {
      this.toggleWeapon();
    }

    // Handle Reload / Active Blood Reload (`R`)
    if (combatInput.reloadPressed && this.currentSlot === WeaponSlot.JACKAL_AND_CASULL) {
      this._handleReloadInput();
    }

    // Step ongoing pistol reload
    if (this.isReloading) {
      this.reloadTimer += dt;
      const reloadDur = this.weapons[0].ammo.reloadDurationSec;
      if (this.reloadTimer >= reloadDur) {
        this.isReloading = false;
        this.pistolAmmo = this.pistolMaxAmmo;
        this.isEmpoweredMag = false;
        this.lastCombatEvent = 'RELOAD COMPLETE';
      }
    }

    // Handle Context-Sensitive Quick Melee (`F` Key: Slide Blood-Kick / Execution / Claw)
    if (combatInput.quickMeleePressed && this.quickMeleeCooldown <= 0) {
      this.executeQuickMelee();
      return;
    }

    // Handle Secondary Alt-Fire (`RMB`)
    if (combatInput.altPressed) {
      if (this.currentSlot === WeaponSlot.JACKAL_AND_CASULL) {
        this.fireJackalCasullTwinBurst();
      } else {
        this.startKatanaBloodDash();
      }
      return;
    }

    // Handle Primary Fire (`LMB`)
    if ((combatInput.primaryPressed || combatInput.primaryHeld) && this.primaryCooldown <= 0) {
      if (this.currentSlot === WeaponSlot.JACKAL_AND_CASULL) {
        this.fireJackalCasullPrimary();
      } else {
        this.performKatanaSlash();
      }
    }
  }

  // ===========================================================================
  // WEAPON 0: THE JACKAL & CASULL (Dual Heavy Auto-Cannons)
  // ===========================================================================
  _handleReloadInput() {
    const ammoCfg = this.weapons[0].ammo;

    // If not currently reloading, start reload (if magazine not full)
    if (!this.isReloading) {
      if (this.pistolAmmo >= this.pistolMaxAmmo) return false;
      this.isReloading = true;
      this.reloadTimer = 0.0;
      this.reloadAttemptedActive = false;
      this.lastCombatEvent = 'RELOADING... [HIT R IN GOLD WINDOW]';
      if (this.audio) this.audio.playReload(false);
      return true;
    }

    // If already reloading and player presses R: check Active Blood Reload Window!
    if (!this.reloadAttemptedActive) {
      this.reloadAttemptedActive = true;
      const progress = this.reloadTimer / ammoCfg.reloadDurationSec;
      const [winStart, winEnd] = ammoCfg.activeReloadWindow;

      if (progress >= winStart && progress <= winEnd) {
        // ACTIVE BLOOD RELOAD SUCCESS!
        this.isReloading = false;
        this.reloadTimer = 0.0;
        this.pistolAmmo = this.pistolMaxAmmo;
        this.isEmpoweredMag = true;
        this.lastCombatEvent = 'ACTIVE BLOOD RELOAD! (+25% DMG & +1 PIERCE)';
        this.triggerJuice({ fovPunch: 2.5 });
        if (this.audio) this.audio.playReload(true);
        return true;
      } else {
        this.lastCombatEvent = 'MISSED ACTIVE RELOAD WINDOW';
      }
    }
    return false;
  }

  /**
   * Fires alternating Casull (.454 Silver) and The Jackal (13mm Mercury AP) hitscan shots.
   */
  fireJackalCasullPrimary() {
    if (this.isReloading) return { fired: false, reason: 'RELOADING' };
    if (this.pistolAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    const wep = this.weapons[0];
    const isCasull = this.pistolNextBarrel === 'CASULL';
    const barrelCfg = isCasull ? wep.primaryFire.casull : wep.primaryFire.jackal;

    this.pistolAmmo -= 1;
    this.primaryCooldown = wep.primaryFire.fireIntervalSec;
    this.pistolNextBarrel = isCasull ? 'JACKAL' : 'CASULL';
    this.lastFiredBarrel = isCasull ? 'CASULL' : 'JACKAL';
    this.vmKickBack = isCasull ? 0.14 : 0.22;
    this.vmPitchKick = isCasull ? 0.18 : 0.28;

    if (this.audio) {
      if (isCasull) this.audio.playCasullShot();
      else this.audio.playJackalShot();
    }

    const eyeOrigin = this.getEyeOrigin();
    const aimDir = this.getAimDirection();
    const maxRange = wep.primaryFire.maxRange;

    // Empowered magazine modifiers
    const dmgMult = this.isEmpoweredMag ? wep.ammo.empoweredDamageMult : 1.0;
    const bonusPierce = this.isEmpoweredMag ? wep.ammo.empoweredBonusPierce : 0;
    const maxTargets = 1 + barrelCfg.pierceCount + bonusPierce;

    // Raycast against world geometry to clamp beam distance
    const worldHit = this.controller.world.raycast(eyeOrigin, aimDir, maxRange);
    const maxHitDist = worldHit.hit ? worldHit.distance : maxRange;

    // Raycast against all Husks along the line
    const huskHits = this.husks.raycastHusks(eyeOrigin, aimDir, maxHitDist);
    const hitCount = Math.min(huskHits.length, maxTargets);

    let anyHeadshot = false;
    let anyKilled = false;
    let anyMercuryDetonation = false;
    let totalDamageDealt = 0;

    for (let i = 0; i < hitCount; i++) {
      const hit = huskHits[i];
      const falloff = isCasull ? 1.0 : Math.pow(barrelCfg.pierceDamageFalloff || 0.85, i);
      const isHead = hit.isHeadshot;
      if (isHead) anyHeadshot = true;

      const dmg = barrelCfg.baseDamage * dmgMult * falloff * (isHead ? barrelCfg.headshotMultiplier : 1.0);
      const poiseDmg =
        barrelCfg.poiseDamage * (isHead ? barrelCfg.headshotPoiseMultiplier : 1.0);

      const res = this.husks.applyDamage(hit.huskIndex, dmg, poiseDmg, {
        isCrit: isHead,
        causeGibsOnKill: isHead || !isCasull,
        applySilverBrandSec: isCasull ? barrelCfg.appliesSilverBrandSec : 0,
        triggerMercuryDetonation: !isCasull,
        knockbackDir: aimDir,
      });

      totalDamageDealt += res.totalDamageDealt;
      if (res.killed) {
        anyKilled = true;
        this.blood = Math.min(this.maxBlood, this.blood + 12);
      } else {
        this.blood = Math.min(this.maxBlood, this.blood + 5);
      }
      if (res.mercuryDetonated) {
        anyMercuryDetonation = true;
      }
    }

    // Visual tracer from offset hand socket to beam endpoint
    const rightVec = this.controller.getRightXZ();
    const handOffset = isCasull ? 0.24 : -0.24;
    const muzzlePos = new Vec3(
      eyeOrigin.x + rightVec.x * handOffset + aimDir.x * 0.4,
      eyeOrigin.y - 0.18 + aimDir.y * 0.4,
      eyeOrigin.z + rightVec.z * handOffset + aimDir.z * 0.4
    );
    const endPoint =
      hitCount > 0 && hitCount === maxTargets
        ? huskHits[hitCount - 1].point
        : new Vec3(
            eyeOrigin.x + aimDir.x * maxHitDist,
            eyeOrigin.y + aimDir.y * maxHitDist,
            eyeOrigin.z + aimDir.z * maxHitDist
          );

    if (this.vfx) {
      const tracerColor = isCasull ? 0xd8ecff : 0xff3b00;
      this.vfx.spawnTracer(muzzlePos, endPoint, tracerColor, isCasull ? 0.09 : 0.14);
    }

    // Game Feel: Micro-Hitstop on Headshot / Mercury Detonation + FOV Punch + Recoil
    const hitstop =
      anyMercuryDetonation || (anyHeadshot && !isCasull)
        ? 3
        : anyHeadshot
        ? 2
        : hitCount > 0
        ? barrelCfg.hitstopFrames
        : 0;

    this.triggerJuice({
      hitstopFrames: hitstop,
      fovPunch: barrelCfg.fovPunchDeg,
      pitchKickDeg: barrelCfg.recoilPitchDeg,
      yawJitterDeg: barrelCfg.recoilYawJitterDeg,
      trauma: isCasull ? 0.18 : 0.28,
    });

    if (anyMercuryDetonation) {
      this.lastCombatEvent = 'MERCURY DETONATION! (SILVER BRAND SHATTERED)';
    } else if (anyHeadshot) {
      this.lastCombatEvent = `${barrelCfg.name.toUpperCase()} HEADSHOT CRIT!`;
    }

    if (this.pistolAmmo === 0) {
      this.isEmpoweredMag = false;
    }

    return {
      fired: true,
      barrel: isCasull ? 'CASULL' : 'JACKAL',
      targetsHit: hitCount,
      anyHeadshot,
      anyKilled,
      anyMercuryDetonation,
      totalDamageDealt,
    };
  }

  /**
   * Jackal & Casull RMB Alt-Fire: Twin Crucifix Execution Shot.
   * Fires both pistols simultaneously; auto-snaps within 8.5 deg cone to Staggered craniums!
   */
  fireJackalCasullTwinBurst() {
    const wep = this.weapons[0];
    const altCfg = wep.altFire;
    if (this.twinBurstCooldown > 0) return { fired: false, reason: 'COOLDOWN' };
    if (this.blood < wep.ammo.altFireBloodCost) return { fired: false, reason: 'LOW_BLOOD' };
    if (this.pistolAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    this.blood = Math.max(0, this.blood - wep.ammo.altFireBloodCost);
    this.pistolAmmo = Math.max(0, this.pistolAmmo - Math.min(this.pistolAmmo, wep.ammo.altFireAmmoCost));
    this.isReloading = false;
    this.twinBurstCooldown = altCfg.cooldownSec;
    this.primaryCooldown = 0.28;
    this.vmKickBack = 0.35;
    this.vmPitchKick = 0.42;

    if (this.audio) this.audio.playTwinCrossBurst();

    const eyeOrigin = this.getEyeOrigin();
    let aimDir = this.getAimDirection();

    // Check Weakpoint Auto-Snap within 8.5 deg cone
    const snapIdx = this.husks.findWeakpointSnapTarget(
      eyeOrigin,
      aimDir,
      80.0,
      altCfg.weakpointSnapConeDeg
    );
    let snappedToWeakpoint = false;
    if (snapIdx >= 0) {
      const headPos = new Vec3(
        this.husks.posX[snapIdx],
        this.husks.posY[snapIdx] + 1.56,
        this.husks.posZ[snapIdx]
      );
      aimDir = headPos.sub(eyeOrigin).normalize();
      snappedToWeakpoint = true;
    }

    const dmgMult = this.isEmpoweredMag ? wep.ammo.empoweredDamageMult : 1.0;
    const huskHits = this.husks.raycastHusks(eyeOrigin, aimDir, 140.0);
    let totalDamageDealt = 0;
    let kills = 0;

    for (let i = 0; i < huskHits.length; i++) {
      const hit = huskHits[i];
      const isObliteration = snappedToWeakpoint || hit.isHeadshot || this.husks.state[hit.huskIndex] === HuskState.STAGGERED;
      const dmg = (isObliteration ? altCfg.obliterationCritDamage : altCfg.baseDamage) * dmgMult;

      const res = this.husks.applyDamage(hit.huskIndex, dmg, altCfg.poiseDamage, {
        isCrit: true,
        causeGibsOnKill: true,
        triggerMercuryDetonation: true,
        knockbackDir: aimDir,
      });
      totalDamageDealt += res.totalDamageDealt;
      if (res.killed) kills++;
    }

    if (this.vfx) {
      const endPt = new Vec3(
        eyeOrigin.x + aimDir.x * 90,
        eyeOrigin.y + aimDir.y * 90,
        eyeOrigin.z + aimDir.z * 90
      );
      this.vfx.spawnTracer(eyeOrigin, endPt, 0xffd700, 0.22);
    }

    this.triggerJuice({
      hitstopFrames: huskHits.length > 0 ? altCfg.hitstopFrames : 1,
      fovPunch: altCfg.fovPunchDeg,
      pitchKickDeg: altCfg.recoilPitchDeg,
      trauma: 0.55,
    });

    this.lastCombatEvent = snappedToWeakpoint
      ? 'TWIN CRUCIFIX OBLITERATION SNAP!'
      : 'TWIN CRUCIFIX RAIL SHOT!';

    return {
      fired: true,
      snappedToWeakpoint,
      targetsHit: huskHits.length,
      kills,
      totalDamageDealt,
    };
  }

  // ===========================================================================
  // WEAPON 1: OCCULT KATANA ("Muramasa Blood-Edge")
  // ===========================================================================
  /**
   * Executes a rapid 105-deg frontal Iaido slash that stacks Arterial Bleed.
   */
  performKatanaSlash() {
    const wep = this.weapons[1];
    const pCfg = wep.primaryFire;

    this.primaryCooldown = pCfg.fireIntervalSec;
    this.katanaComboStep = (this.katanaComboStep + 1) % 3;
    this.vmSwingPhase = 1.0;

    if (this.audio) {
      this.audio.playKatanaSlash(this.katanaComboStep);
    }

    const eyeOrigin = this.getEyeOrigin();
    const forwardXZ = this.controller.getForwardXZ();
    const minCos = Math.cos((pCfg.cleaveConeDeg * 0.5) * DEG2RAD);

    // High-speed movement (>16 m/s) or sliding/wall-running boosts crit chance to 100%!
    const isHighMomentum =
      this.controller.getHorizontalSpeed() >= 16.0 ||
      this.controller.state === MovementState.SLIDE ||
      this.controller.state === MovementState.WALL_RUN;
    const isCrit = isHighMomentum || Math.random() < pCfg.critChance;

    const dmg = pCfg.baseDamage * (isCrit ? pCfg.critMultiplier : 1.0);
    const bleedToAdd = isCrit ? pCfg.bleedStacksOnCrit : pCfg.bleedStacksOnHit;

    let targetsHit = 0;
    let kills = 0;
    let totalDamageDealt = 0;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;

      const dx = this.husks.posX[i] - this.controller.position.x;
      const dy = (this.husks.posY[i] + 1.0) - eyeOrigin.y;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const horizDist = Math.hypot(dx, dz);

      if (horizDist > pCfg.reachMeters || Math.abs(dy) > 2.4) continue;

      if (horizDist > 0.35) {
        const cosAngle = (dx * forwardXZ.x + dz * forwardXZ.z) / horizDist;
        if (cosAngle < minCos) continue;
      }

      targetsHit++;
      const res = this.husks.applyDamage(i, dmg, pCfg.poiseDamage, {
        isCrit,
        causeGibsOnKill: isCrit,
        addBleedStacks: bleedToAdd,
        bleedDurationSec: pCfg.bleedDurationSec,
        knockbackDir: forwardXZ,
      });

      totalDamageDealt += res.totalDamageDealt;
      if (res.killed) {
        kills++;
        this.blood = Math.min(this.maxBlood, this.blood + 14);
        // Check Kill-Reset window if player recently Blood-Dashed!
        if (this.katanaKillResetWindow > 0) {
          this.katanaDashCooldown = 0.0;
          this.lastCombatEvent = 'IAIJUTSU KILL-RESET! (DASH REFUNDED)';
        }
      } else {
        this.blood = Math.min(this.maxBlood, this.blood + 6);
      }
    }

    if (targetsHit > 0) {
      this.triggerJuice({
        hitstopFrames: isCrit ? pCfg.hitstopFramesCrit : pCfg.hitstopFramesNormal,
        fovPunch: isCrit ? pCfg.fovPunchDeg * 1.5 : pCfg.fovPunchDeg,
        trauma: isCrit ? 0.25 : 0.12,
      });
      if (!kills) {
        this.lastCombatEvent = isCrit
          ? `KATANA CRITICAL SLASH! (+${bleedToAdd} BLEED)`
          : `KATANA SLASH (+${bleedToAdd} BLEED)`;
      }
    }

    return {
      slashed: true,
      isCrit,
      targetsHit,
      kills,
      totalDamageDealt,
    };
  }

  /**
   * Starts the Occult Katana RMB Iaijutsu Blood-Dash Strike (11.5m 3D lunge).
   * Slices through all targets along the path, ruptures active Bleed stacks for 150% burst,
   * and refunds 100% cooldown if a target is killed!
   */
  startKatanaBloodDash() {
    const dCfg = this.weapons[1].altFire;
    if (this.katanaDashCooldown > 0 || this.isBloodDashing) {
      return { dashed: false, reason: 'COOLDOWN' };
    }

    this.isBloodDashing = true;
    this.bloodDashTimer = dCfg.dashDurationSec;
    this.katanaDashCooldown = dCfg.cooldownSec;
    this.katanaKillResetWindow = dCfg.killResetWindowSec;
    this.bloodDashHitSet.clear();

    this.getAimDirection(this.bloodDashDir);
    // Prevent diving steep into flat ground when looking slightly downward
    if (this.controller.grounded && this.bloodDashDir.y < 0.05) {
      this.bloodDashDir.y = 0.08;
      this.bloodDashDir.normalize();
    }

    this.bloodDashSpeed = dCfg.dashDistanceMeters / dCfg.dashDurationSec;
    this.controller.state = MovementState.AIR;
    this.controller.grounded = false;

    if (this.audio) this.audio.playKatanaBloodDash();
    this.triggerJuice({ fovPunch: dCfg.fovPunchDeg, trauma: 0.35 });
    this.lastCombatEvent = 'IAIJUTSU BLOOD-DASH STRIKE!';

    // Immediately slice any targets at the start of the dash
    this._sliceTargetsAlongDash();
    return { dashed: true };
  }

  _stepKatanaBloodDash(dt) {
    const dCfg = this.weapons[1].altFire;
    this.bloodDashTimer -= dt;

    this.controller.velocity.set(
      this.bloodDashDir.x * this.bloodDashSpeed,
      this.bloodDashDir.y * this.bloodDashSpeed,
      this.bloodDashDir.z * this.bloodDashSpeed
    );

    this._sliceTargetsAlongDash();

    if (this.bloodDashTimer <= 0) {
      this.isBloodDashing = false;
      this.controller.velocity.set(
        this.bloodDashDir.x * dCfg.exitSpeedMetersPerSec,
        Math.max(-2.0, this.bloodDashDir.y * dCfg.exitSpeedMetersPerSec * 0.5),
        this.bloodDashDir.z * dCfg.exitSpeedMetersPerSec
      );
    }
  }

  _sliceTargetsAlongDash() {
    const dCfg = this.weapons[1].altFire;
    const px = this.controller.position.x;
    const py = this.controller.position.y + 1.0;
    const pz = this.controller.position.z;
    const rSq = dCfg.sliceRadiusMeters * dCfg.sliceRadiusMeters;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD || this.bloodDashHitSet.has(i)) continue;

      const dx = this.husks.posX[i] - px;
      const dy = (this.husks.posY[i] + 1.0) - py;
      const dz = this.husks.posZ[i] - pz;

      if (dx * dx + dz * dz <= rSq && Math.abs(dy) <= 2.4) {
        this.bloodDashHitSet.add(i);

        // 1. Apply primary dash slice damage
        const res = this.husks.applyDamage(i, dCfg.baseDamage, dCfg.poiseDamage, {
          isCrit: true,
          causeGibsOnKill: true,
          knockbackDir: this.bloodDashDir,
        });

        // 2. Rupture all active Bleed stacks for 150% burst damage!
        let ruptureKilled = false;
        if (!res.killed && this.husks.bleedStacks[i] > 0) {
          const rup = this.husks.ruptureBleed(i, dCfg.bleedRuptureMultiplier);
          ruptureKilled = rup.killed;
          if (rup.ruptured) {
            this.lastCombatEvent = `HEMORRHAGE RUPTURE! (+${rup.burstDamage} BURST DMG)`;
          }
        }

        this.triggerJuice({ hitstopFrames: dCfg.hitstopFrames, trauma: 0.35 });

        if (res.killed || ruptureKilled) {
          // KILL-RESET! Refund 100% of Blood-Dash cooldown immediately!
          this.katanaDashCooldown = 0.0;
          this.blood = Math.min(this.maxBlood, this.blood + dCfg.bloodRefundOnKill);
          this.lastCombatEvent = 'BLOOD-DASH KILL RESET! (COOLDOWN REFUNDED)';
        }
      }
    }
  }

  // ===========================================================================
  // CONTEXT-SENSITIVE QUICK MELEE (`F` Key — Zero Hotkey Bloat)
  // ===========================================================================
  /**
   * Context-Sensitive `F` Action:
   * 1. If Sliding -> Vampiric Blood-Kick (launches target at 24 m/s as a Living Bowling Ball!)
   * 2. If a Staggered Husk is within 4.6m -> Vampiric Execution (+25 HP, +30 Blood, Gibs!)
   * 3. Otherwise -> Fast Sanguine Claw Slash
   */
  executeQuickMelee() {
    this.quickMeleeCooldown = QuickMeleeConfig.cooldownSec;
    const forwardXZ = this.controller.getForwardXZ();
    const isSliding = this.controller.state === MovementState.SLIDE;

    // 1. Check Vampiric Execution on any STAGGERED Husk in front cone
    if (!isSliding) {
      const execIdx = this._findStaggeredExecutionTarget(forwardXZ);
      if (execIdx >= 0) {
        return this._performVampiricExecution(execIdx, forwardXZ);
      }
    }

    // 2. Slide Blood-Kick (while in SLIDE state)
    if (isSliding) {
      return this._performSlideBloodKick(forwardXZ);
    }

    // 3. Standard Sanguine Claw Slash
    return this._performSanguineClaw(forwardXZ);
  }

  _findStaggeredExecutionTarget(forwardXZ) {
    let bestIdx = -1;
    let bestDist = QuickMeleeConfig.executionRangeMeters;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] !== HuskState.STAGGERED) continue;
      const dx = this.husks.posX[i] - this.controller.position.x;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      if (dist > 0.3) {
        const cos = (dx * forwardXZ.x + dz * forwardXZ.z) / dist;
        if (cos < 0.45) continue;
      }
      bestDist = dist;
      bestIdx = i;
    }
    return bestIdx;
  }

  _performVampiricExecution(targetIdx, forwardXZ) {
    const eCfg = QuickMeleeConfig.vampiricExecution;

    // Snap player close to victim
    const tx = this.husks.posX[targetIdx] - forwardXZ.x * 1.25;
    const tz = this.husks.posZ[targetIdx] - forwardXZ.z * 1.25;
    this.controller.position.x = tx;
    this.controller.position.z = tz;

    this.husks.applyDamage(targetIdx, eCfg.damage, 200, {
      isCrit: true,
      isExecution: true,
      causeGibsOnKill: true,
      knockbackDir: forwardXZ,
    });

    this.hp = Math.min(this.maxHp, this.hp + eCfg.healHp);
    this.blood = Math.min(this.maxBlood, this.blood + eCfg.restoreBlood);

    // Reload 2 shells/rounds into Jackal & Casull on Execution!
    this.pistolAmmo = Math.min(this.pistolMaxAmmo, this.pistolAmmo + 4);

    if (this.audio) this.audio.playMeleeImpact(true);
    this.triggerJuice({
      hitstopFrames: eCfg.hitstopFrames,
      fovPunch: eCfg.fovPunchDeg,
      trauma: 0.55,
    });

    this.lastCombatEvent = `VAMPIRIC EXECUTION! (+${eCfg.healHp} HP // +${eCfg.restoreBlood} BLOOD)`;
    return { type: 'VAMPIRIC_EXECUTION', targetIdx, healed: eCfg.healHp };
  }

  _performSlideBloodKick(forwardXZ) {
    const kCfg = QuickMeleeConfig.slideBloodKick;
    if (this.audio) this.audio.playMeleeImpact(false);

    let kickedCount = 0;
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - this.controller.position.x;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > QuickMeleeConfig.reachMeters + 0.5) continue;

      if (dist > 0.3) {
        const cos = (dx * forwardXZ.x + dz * forwardXZ.z) / dist;
        if (cos < 0.4) continue;
      }

      kickedCount++;
      const res = this.husks.applyDamage(i, kCfg.damage, kCfg.poiseDamage, {
        isCrit: true,
        causeGibsOnKill: true,
        knockbackDir: forwardXZ,
      });

      if (!res.killed) {
        // Launch as a Living Bowling Ball at 24 m/s!
        this.husks.launchAsBowlingBall(i, forwardXZ, kCfg.bowlingLaunchSpeed);
      }
    }

    if (kickedCount > 0) {
      this.triggerJuice({
        hitstopFrames: kCfg.hitstopFrames,
        fovPunch: kCfg.fovPunchDeg,
        trauma: 0.4,
      });
      this.lastCombatEvent = 'SLIDE BLOOD-KICK! (LIVING BOWLING BALL LAUNCHED)';
    }

    return { type: 'SLIDE_BLOOD_KICK', kickedCount };
  }

  _performSanguineClaw(forwardXZ) {
    const cCfg = QuickMeleeConfig.clawSlash;
    if (this.audio) this.audio.playMeleeImpact(false);

    let hitCount = 0;
    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - this.controller.position.x;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > QuickMeleeConfig.reachMeters) continue;

      if (dist > 0.3) {
        const cos = (dx * forwardXZ.x + dz * forwardXZ.z) / dist;
        if (cos < 0.45) continue;
      }

      hitCount++;
      this.husks.applyDamage(i, cCfg.damage, cCfg.poiseDamage, {
        isCrit: false,
        knockbackDir: forwardXZ,
      });
    }

    if (hitCount > 0) {
      this.triggerJuice({ hitstopFrames: cCfg.hitstopFrames, trauma: 0.22 });
      this.lastCombatEvent = 'SANGUINE CLAW SLASH';
    }
    return { type: 'SANGUINE_CLAW', hitCount };
  }
}
