/**
 * SANGUINE_RUNNER — Single-Weapon Run & Differentiated Melee/Ballistic Combat Engine
 * Implements:
 *  - Single-Weapon Run Rule & Brotato-Style Character Loadout Integration
 *  - Differentiated Melee Sector Geometry (reach, horizontal_arc, timing, sweet_spot, melee_reach_multiplier):
 *      * Stake & Hammer (1.3m / 55° cone, Armor Shatter, Point-Blank Blood Explosion)
 *      * Alucard Sword (2.5m / 120° arc, Passive Siphon, RMB 180ms Projectile Parry at 400% DMG)
 *      * Occult Scythe (4.0m / 160° arc, Sweet-Spot Tip [65%-100%] 3.0x DMG + 3 Bleed vs Inner Shaft <65% 0.4x DMG + Knockback)
 *  - The Jackal & Casull (Silver Brand, Mercury AoE Detonation, Active Blood Reload, Twin Cross-Burst)
 *  - Trench Blood-Shotgun (12-Pellet Velocity Spread, Airborne Recoil Shotgun-Jump, Gore-Slug)
 *  - Context-Sensitive Quick Melee (`F`: Slide Blood-Kick Bowling, Vampiric Execution, Sanguine Claw)
 */

import { Vec3, clamp } from '../physics/Vec3.js';
import { MovementState } from '../physics/MovementConfig.js';
import {
  WeaponDefinitions,
  WeaponSlot,
  QuickMeleeConfig,
  getWeaponDefinitionById,
} from './WeaponDefinitions.js';
import {
  CharacterId,
  WeaponId,
  getCharacterById,
  isWeaponAllowedForCharacter,
} from './CharacterCatalog.js';
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
   * @param {import('../progression/ScalingEngine.js').ScalingEngine} [opts.scaling]
   */
  constructor({
    controller,
    huskManager,
    vfx,
    audio,
    cameraRig = null,
    scaling = null,
  }) {
    this.controller = controller;
    this.husks = huskManager;
    this.vfx = vfx;
    this.audio = audio;
    this.cameraRig = cameraRig;
    this.scaling = scaling;

    // Player Combat Resources & Overblood Barrier
    this.hp = 100;
    this.maxHp = 100;
    this.overbloodBarrier = 0;
    this.blood = 100;
    this.maxBlood = 100;

    // Decoupled Character + Single-Weapon Run Configuration
    this.characterId = CharacterId.HELLSING_GUNSLINGER;
    this.characterDef = getCharacterById(this.characterId);
    this.singleWeaponId = WeaponId.JACKAL_CASULL;
    this.singleWeaponRunLocked = false; // Set true when starting a Single-Weapon Run

    // Active Slot & Weapon Definitions
    this.currentSlot = WeaponSlot.JACKAL_AND_CASULL;
    this.weapons = WeaponDefinitions;
    this.switchTimer = 0.0;

    // Scaling Multipliers (updated directly or via ScalingEngine)
    this.meleeReachMultiplier = 1.0;

    // Ballistic Weapon State (Jackal & Casull / Trench Shotgun)
    this.pistolAmmo = this.weapons[0].ammo.magazineSize;
    this.pistolMaxAmmo = this.weapons[0].ammo.magazineSize;
    this.shotgunAmmo = this.weapons[1].ammo.magazineSize;
    this.shotgunMaxAmmo = this.weapons[1].ammo.magazineSize;
    this.pistolNextBarrel = 'CASULL';
    this.isReloading = false;
    this.reloadTimer = 0.0;
    this.reloadAttemptedActive = false;
    this.isEmpoweredMag = false;
    this.holsterTimer = 0.0;
    this.twinBurstCooldown = 0.0;
    this.altFireCooldown = 0.0;

    // Melee & Occult Scythe / Sword / Stake State
    this.katanaComboStep = 0;
    this.katanaDashCooldown = 0.0;
    this.katanaKillResetWindow = 0.0;
    this.isBloodDashing = false;
    this.bloodDashTimer = 0.0;
    this.bloodDashDir = new Vec3(0, 0, -1);
    this.bloodDashSpeed = 115.0;
    this.bloodDashHitSet = new Set();

    // Alucard Sword Parry Window State
    this.parryWindowTimer = 0.0;

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
    this.lastMeleeZone = 'NONE';
  }

  /**
   * Configures a Brotato-style Single-Weapon Run loadout:
   * Validates that `weaponId` belongs to `characterId`'s allowed starting pool (unless overridden),
   * applies Character stat offsets, and locks the single weapon for the run.
   */
  configureSingleWeaponRun({
    characterId = CharacterId.NOSFERATU_SOVEREIGN,
    weaponId = WeaponId.OCCULT_SCYTHE,
    lockSingleWeapon = true,
    enforceAllowedPool = true,
  } = {}) {
    const charDef = getCharacterById(characterId);
    this.characterId = charDef.id;
    this.characterDef = charDef;

    let resolvedWeaponId = weaponId;
    if (enforceAllowedPool && !isWeaponAllowedForCharacter(charDef.id, weaponId)) {
      resolvedWeaponId = charDef.allowedStartingWeapons[0];
    }

    const wepDef = getWeaponDefinitionById(resolvedWeaponId);
    this.singleWeaponId = wepDef.id;
    this.currentSlot = wepDef.slotIndex;
    this.singleWeaponRunLocked = lockSingleWeapon;

    // Apply character base HP and reach offset
    this.maxHp = Math.max(40, 100 + (charDef.statOffsets.maxHpFlat || 0));
    this.hp = this.maxHp;
    this.overbloodBarrier = 0;
    this.blood = this.maxBlood;

    const baseReachOffset = charDef.statOffsets.meleeReachMultiplierPct || 0;
    this.meleeReachMultiplier = 1.0 + baseReachOffset;

    if (this.scaling) {
      this.scaling.applyCharacterOffsets(charDef);
      this.meleeReachMultiplier = this.scaling.getMeleeReachMultiplier();
    }

    this.pistolAmmo = this.pistolMaxAmmo;
    this.shotgunAmmo = this.shotgunMaxAmmo;
    this.isReloading = false;
    this.primaryCooldown = 0;
    this.altFireCooldown = 0;
    this.katanaDashCooldown = 0;
    this.lastCombatEvent = `LOADOUT LOCKED: ${charDef.name.toUpperCase()} // ${wepDef.displayName}`;

    return {
      characterId: this.characterId,
      weaponId: this.singleWeaponId,
      slotIndex: this.currentSlot,
      maxHp: this.maxHp,
      meleeReachMultiplier: this.meleeReachMultiplier,
    };
  }

  /**
   * Effective melee reach multiplier (`melee_reach_multiplier`), combining character offsets + ScalingEngine perks.
   */
  getEffectiveMeleeReachMultiplier() {
    if (this.scaling) {
      return this.scaling.getMeleeReachMultiplier();
    }
    return this.meleeReachMultiplier;
  }

  /**
   * Restores HP and converts excess healing into Overblood Barrier if Nosferatu Sovereign or Siphon perk active.
   */
  healPlayer(amount) {
    if (amount <= 0) return;
    const missing = this.maxHp - this.hp;
    if (amount <= missing) {
      this.hp += amount;
    } else {
      this.hp = this.maxHp;
      const excess = amount - missing;
      this.overbloodBarrier = Math.min(this.maxHp * 0.5, this.overbloodBarrier + excess);
    }
  }

  /**
   * Applies incoming damage to the player, mitigated by hyperbolic Armor and Overblood Barrier.
   */
  applyPlayerDamage(rawDamage) {
    const armor = this.scaling
      ? this.scaling.getArmor()
      : this.characterDef?.statOffsets?.armorFlat || 0;
    const mitigation = armor > 0 ? armor / (armor + 100.0) : armor / (100.0 - armor);
    let dmg = Math.max(1, rawDamage * (1.0 - mitigation));

    if (this.overbloodBarrier > 0) {
      const absorbed = Math.min(this.overbloodBarrier, dmg);
      this.overbloodBarrier -= absorbed;
      dmg -= absorbed;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.triggerJuice({ trauma: 0.35, fovPunch: 2.0 });
    return dmg;
  }

  /** Normalized 3D camera aim direction from yaw & pitch */
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
  triggerJuice({
    hitstopFrames = 0,
    fovPunch = 0,
    pitchKickDeg = 0,
    yawJitterDeg = 0,
    trauma = 0,
  }) {
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
   * Switches active weapon slot (blocked during an active Single-Weapon Run!).
   */
  switchWeapon(targetSlotOrId, { force = false } = {}) {
    if (this.singleWeaponRunLocked && !force) {
      this.lastCombatEvent = 'SINGLE-WEAPON RUN LOCKED';
      return false;
    }
    const wep = getWeaponDefinitionById(targetSlotOrId);
    const targetSlot = wep.slotIndex;
    if (targetSlot === this.currentSlot) return false;
    this.currentSlot = targetSlot;
    this.singleWeaponId = wep.id;
    this.isReloading = false;
    this.reloadTimer = 0.0;
    this.primaryCooldown = wep.switchTimeSec;
    this.holsterTimer = 0.0;
    this.vmKickBack = 0.18;
    this.lastCombatEvent = `EQUIPPED: ${wep.displayName}`;
    return true;
  }

  toggleWeapon() {
    if (this.singleWeaponRunLocked) return false;
    const nextSlot = (this.currentSlot + 1) % this.weapons.length;
    return this.switchWeapon(nextSlot);
  }

  /**
   * Steps combat timers, Blood-Dash physics, Parry windows, and processes combat inputs.
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
    if (this.quickMeleeCooldown > 0) {
      this.quickMeleeCooldown = Math.max(0, this.quickMeleeCooldown - dt);
    }
    if (this.twinBurstCooldown > 0) {
      this.twinBurstCooldown = Math.max(0, this.twinBurstCooldown - dt);
    }
    if (this.altFireCooldown > 0) {
      this.altFireCooldown = Math.max(0, this.altFireCooldown - dt);
    }
    if (this.katanaDashCooldown > 0) {
      this.katanaDashCooldown = Math.max(0, this.katanaDashCooldown - dt);
    }
    if (this.katanaKillResetWindow > 0) {
      this.katanaKillResetWindow = Math.max(0, this.katanaKillResetWindow - dt);
    }

    // Active Alucard Sword Parry Window check
    if (this.parryWindowTimer > 0) {
      this.parryWindowTimer = Math.max(0, this.parryWindowTimer - dt);
      const deflected = this.husks.deflectProjectilesInCone(
        this.getEyeOrigin(),
        this.getAimDirection(),
        4.5,
        130.0,
        4.0
      );
      if (deflected > 0) {
        this.blood = Math.min(this.maxBlood, this.blood + 25 * deflected);
        this.healPlayer(10 * deflected);
        this.triggerJuice({ hitstopFrames: 4, fovPunch: 5.5, trauma: 0.45 });
        this.lastCombatEvent = `CRIMSON PARRY DEFLECTION! (${deflected}x ORB AT 400% DMG)`;
      }
    }

    // Step Active Reaper / Iaijutsu Blood-Dash
    if (this.isBloodDashing) {
      this._stepKatanaBloodDash(dt);
      return;
    }

    // Weapon Swap is disabled when `singleWeaponRunLocked === true`
    if (combatInput.swapPressed && !this.singleWeaponRunLocked) {
      this.toggleWeapon();
    }

    // Handle Reload / Active Blood Reload (`R`) for Ballistic Weapons
    if (
      combatInput.reloadPressed &&
      (this.currentSlot === WeaponSlot.JACKAL_CASULL ||
        this.currentSlot === WeaponSlot.TRENCH_SHOTGUN)
    ) {
      this._handleReloadInput();
    }

    // Step ongoing reload
    if (this.isReloading) {
      this.reloadTimer += dt;
      const wep = this.weapons[this.currentSlot];
      const reloadDur = wep.ammo.reloadDurationSec;
      if (this.reloadTimer >= reloadDur) {
        this.isReloading = false;
        if (this.currentSlot === WeaponSlot.TRENCH_SHOTGUN) {
          this.shotgunAmmo = this.shotgunMaxAmmo;
        } else {
          this.pistolAmmo = this.pistolMaxAmmo;
        }
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
      this.executeSecondaryFire();
      return;
    }

    // Handle Primary Fire (`LMB`)
    if ((combatInput.primaryPressed || combatInput.primaryHeld) && this.primaryCooldown <= 0) {
      this.executePrimaryFire();
    }
  }

  executePrimaryFire() {
    switch (this.currentSlot) {
      case WeaponSlot.JACKAL_CASULL:
        return this.fireJackalCasullPrimary();
      case WeaponSlot.TRENCH_SHOTGUN:
        return this.fireTrenchShotgunPrimary();
      case WeaponSlot.STAKE_HAMMER:
      case WeaponSlot.ALUCARD_SWORD:
      case WeaponSlot.OCCULT_SCYTHE:
        return this.performDifferentiatedMeleeStrike(this.currentSlot);
      default:
        return this.fireJackalCasullPrimary();
    }
  }

  executeSecondaryFire() {
    switch (this.currentSlot) {
      case WeaponSlot.JACKAL_CASULL:
        return this.fireJackalCasullTwinBurst();
      case WeaponSlot.TRENCH_SHOTGUN:
        return this.fireTrenchShotgunGoreSlug();
      case WeaponSlot.STAKE_HAMMER:
        return this.performStakeHammerSeismicDrive();
      case WeaponSlot.ALUCARD_SWORD:
        return this.performAlucardSwordParry();
      case WeaponSlot.OCCULT_SCYTHE:
        return this.startKatanaBloodDash();
      default:
        return this.fireJackalCasullTwinBurst();
    }
  }

  // ===========================================================================
  // BALLISTIC RELOAD & ACTIVE BLOOD RELOAD (`R`)
  // ===========================================================================
  _handleReloadInput() {
    const isShotgun = this.currentSlot === WeaponSlot.TRENCH_SHOTGUN;
    const wep = this.weapons[isShotgun ? WeaponSlot.TRENCH_SHOTGUN : WeaponSlot.JACKAL_CASULL];
    const ammoCfg = wep.ammo;
    const curAmmo = isShotgun ? this.shotgunAmmo : this.pistolAmmo;
    const maxAmmo = isShotgun ? this.shotgunMaxAmmo : this.pistolMaxAmmo;

    if (!this.isReloading) {
      if (curAmmo >= maxAmmo) return false;
      this.isReloading = true;
      this.reloadTimer = 0.0;
      this.reloadAttemptedActive = false;
      this.lastCombatEvent = 'RELOADING... [HIT R IN GOLD WINDOW]';
      if (this.audio) this.audio.playReload(false);
      return true;
    }

    if (!this.reloadAttemptedActive) {
      this.reloadAttemptedActive = true;
      const progress = this.reloadTimer / ammoCfg.reloadDurationSec;
      const [winStart, winEnd] = ammoCfg.activeReloadWindow;

      if (progress >= winStart && progress <= winEnd) {
        this.isReloading = false;
        this.reloadTimer = 0.0;
        if (isShotgun) this.shotgunAmmo = this.shotgunMaxAmmo;
        else this.pistolAmmo = this.pistolMaxAmmo;
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

  // ===========================================================================
  // WEAPON 0: THE JACKAL & CASULL (Dual Heavy Auto-Cannons)
  // ===========================================================================
  fireJackalCasullPrimary() {
    if (this.isReloading) return { fired: false, reason: 'RELOADING' };
    if (this.pistolAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    const wep = this.weapons[WeaponSlot.JACKAL_CASULL];
    const isCasull = this.pistolNextBarrel === 'CASULL';
    const barrelCfg = isCasull ? wep.primaryFire.casull : wep.primaryFire.jackal;

    const rateMult = this.scaling ? this.scaling.getFireRateMultiplier() : 1.0;
    this.pistolAmmo -= 1;
    this.primaryCooldown = wep.primaryFire.fireIntervalSec / rateMult;
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

    const scaleDmgMult = this.scaling ? this.scaling.getKineticDamageMultiplier() : 1.0;
    const dmgMult = (this.isEmpoweredMag ? wep.ammo.empoweredDamageMult : 1.0) * scaleDmgMult;
    const bonusPierce =
      (this.isEmpoweredMag ? wep.ammo.empoweredBonusPierce : 0) +
      (this.scaling ? this.scaling.rollBonusPierce() : 0);
    const maxTargets = 1 + barrelCfg.pierceCount + bonusPierce;

    const worldHit = this.controller.world.raycast(eyeOrigin, aimDir, maxRange);
    const maxHitDist = worldHit.hit ? worldHit.distance : maxRange;

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

      const dmg =
        barrelCfg.baseDamage * dmgMult * falloff * (isHead ? barrelCfg.headshotMultiplier : 1.0);
      const poiseDmg =
        barrelCfg.poiseDamage * (isHead ? barrelCfg.headshotPoiseMultiplier : 1.0);

      const res = this.husks.applyDamage(hit.huskIndex, dmg, poiseDmg, {
        isCrit: isHead,
        isPiercing: !isCasull || bonusPierce > 0,
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

  fireJackalCasullTwinBurst() {
    const wep = this.weapons[WeaponSlot.JACKAL_CASULL];
    const altCfg = wep.altFire;
    if (this.twinBurstCooldown > 0) return { fired: false, reason: 'COOLDOWN' };
    if (this.blood < wep.ammo.altFireBloodCost) return { fired: false, reason: 'LOW_BLOOD' };
    if (this.pistolAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    this.blood = Math.max(0, this.blood - wep.ammo.altFireBloodCost);
    this.pistolAmmo = Math.max(
      0,
      this.pistolAmmo - Math.min(this.pistolAmmo, wep.ammo.altFireAmmoCost)
    );
    this.isReloading = false;
    this.twinBurstCooldown = altCfg.cooldownSec;
    this.primaryCooldown = 0.28;
    this.vmKickBack = 0.35;
    this.vmPitchKick = 0.42;

    if (this.audio) this.audio.playTwinCrossBurst();

    const eyeOrigin = this.getEyeOrigin();
    let aimDir = this.getAimDirection();

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
      const isObliteration =
        snappedToWeakpoint ||
        hit.isHeadshot ||
        this.husks.state[hit.huskIndex] === HuskState.STAGGERED;
      const dmg = (isObliteration ? altCfg.obliterationCritDamage : altCfg.baseDamage) * dmgMult;

      const res = this.husks.applyDamage(hit.huskIndex, dmg, altCfg.poiseDamage, {
        isCrit: true,
        isPiercing: true,
        shatterArmor: true,
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
  // WEAPON 1: TRENCH BLOOD-SHOTGUN (12-Pellet Velocity Spread & Shotgun-Jump)
  // ===========================================================================
  fireTrenchShotgunPrimary() {
    if (this.isReloading) return { fired: false, reason: 'RELOADING' };
    if (this.shotgunAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    const wep = this.weapons[WeaponSlot.TRENCH_SHOTGUN];
    const pCfg = wep.primaryFire;
    this.shotgunAmmo -= 1;
    this.primaryCooldown = pCfg.fireIntervalSec;
    this.vmKickBack = 0.32;
    this.vmPitchKick = 0.38;

    if (this.audio) this.audio.playJackalShot();

    const eyeOrigin = this.getEyeOrigin();
    const aimDir = this.getAimDirection();

    // Airborne Shotgun-Jump Recoil Impulse!
    let recoilJumped = false;
    if (!this.controller.grounded) {
      this.controller.velocity.x -= aimDir.x * pCfg.recoilJumpImpulse * 0.55;
      this.controller.velocity.y = Math.max(
        this.controller.velocity.y,
        -aimDir.y * pCfg.recoilJumpImpulse
      );
      this.controller.velocity.z -= aimDir.z * pCfg.recoilJumpImpulse * 0.55;
      recoilJumped = true;
    }

    // Velocity-scaled pellet damage (+2% per m/s above 10 m/s)
    const hSpeed = this.controller.getHorizontalSpeed();
    const velBonus = 1.0 + Math.max(0, hSpeed - 10.0) * pCfg.velocityDamageScalePerMs;
    const empMult = this.isEmpoweredMag ? wep.ammo.empoweredDamageMult : 1.0;

    let totalDamageDealt = 0;
    let pelletsHit = 0;
    let kills = 0;

    for (let p = 0; p < pCfg.pelletCount; p++) {
      const spreadRad = pCfg.spreadConeDeg * DEG2RAD;
      const angle = (p / pCfg.pelletCount) * Math.PI * 2.0;
      const radius = ((p % 3) + 1) * 0.33 * spreadRad;
      const rayDir = new Vec3(
        aimDir.x + Math.cos(angle) * radius,
        aimDir.y + Math.sin(angle) * radius,
        aimDir.z
      ).normalize();

      const hits = this.husks.raycastHusks(eyeOrigin, rayDir, pCfg.maxRange);
      if (hits.length > 0) {
        pelletsHit++;
        const h0 = hits[0];
        const isPointBlank = h0.distance <= 5.5;
        const dmg =
          pCfg.baseDamagePerPellet *
          velBonus *
          empMult *
          (h0.isHeadshot ? pCfg.headshotMultiplier : 1.0) *
          (isPointBlank ? 1.25 : 1.0);
        const res = this.husks.applyDamage(h0.huskIndex, dmg, pCfg.poiseDamagePerPellet, {
          isCrit: isPointBlank || h0.isHeadshot,
          causeGibsOnKill: true,
          knockbackDir: rayDir,
        });
        totalDamageDealt += res.totalDamageDealt;
        if (res.killed) kills++;
      }
    }

    if (this.vfx) {
      const endPt = new Vec3(
        eyeOrigin.x + aimDir.x * 24,
        eyeOrigin.y + aimDir.y * 24,
        eyeOrigin.z + aimDir.z * 24
      );
      this.vfx.spawnTracer(eyeOrigin, endPt, 0xff3b00, 0.16);
    }

    this.triggerJuice({
      hitstopFrames: pelletsHit >= 4 ? pCfg.hitstopFrames : 1,
      fovPunch: pCfg.fovPunchDeg,
      pitchKickDeg: pCfg.recoilPitchDeg,
      trauma: 0.42,
    });

    this.lastCombatEvent = recoilJumped
      ? 'SHOTGUN RECOIL JUMP + BUCKSHOT BLAST!'
      : `TRENCH SHOTGUN BLAST (${pelletsHit}/${pCfg.pelletCount} PELLETS)`;

    return {
      fired: true,
      pelletsHit,
      kills,
      recoilJumped,
      totalDamageDealt,
    };
  }

  fireTrenchShotgunGoreSlug() {
    const wep = this.weapons[WeaponSlot.TRENCH_SHOTGUN];
    const altCfg = wep.altFire;
    if (this.altFireCooldown > 0) return { fired: false, reason: 'COOLDOWN' };
    if (this.shotgunAmmo <= 0) {
      this._handleReloadInput();
      return { fired: false, reason: 'EMPTY' };
    }

    this.shotgunAmmo = Math.max(0, this.shotgunAmmo - Math.min(this.shotgunAmmo, 2));
    this.altFireCooldown = altCfg.cooldownSec;
    this.primaryCooldown = 0.45;

    const eyeOrigin = this.getEyeOrigin();
    const aimDir = this.getAimDirection();

    // Always apply Recoil Vault impulse opposite aim vector!
    this.controller.grounded = false;
    this.controller.state = MovementState.AIR;
    this.controller.velocity.x -= aimDir.x * altCfg.recoilJumpImpulse * 0.65;
    this.controller.velocity.y = Math.max(8.0, -aimDir.y * altCfg.recoilJumpImpulse);
    this.controller.velocity.z -= aimDir.z * altCfg.recoilJumpImpulse * 0.65;

    const hits = this.husks.raycastHusks(eyeOrigin, aimDir, 60.0);
    let totalDamageDealt = 0;
    if (hits.length > 0) {
      const h0 = hits[0];
      const res = this.husks.applyDamage(h0.huskIndex, altCfg.baseDamage, altCfg.poiseDamage, {
        isCrit: true,
        shatterArmor: true,
        causeGibsOnKill: true,
        knockbackDir: aimDir,
      });
      totalDamageDealt += res.totalDamageDealt;
    }

    this.triggerJuice({
      hitstopFrames: altCfg.hitstopFrames,
      fovPunch: altCfg.fovPunchDeg,
      pitchKickDeg: altCfg.recoilPitchDeg,
      trauma: 0.55,
    });
    this.lastCombatEvent = 'GORE-SLUG & RECOIL VAULT!';
    return { fired: true, totalDamageDealt };
  }

  // ===========================================================================
  // DIFFERENTIATED MELEE HITBOX ENGINE (Stake & Hammer / Alucard Sword / Occult Scythe)
  // ===========================================================================
  /**
   * Executes a differentiated melee strike using the weapon's exact `meleeGeometry`:
   *  - `reach` scaled by `melee_reach_multiplier` (`R_eff = reach * meleeReachMultiplier`)
   *  - `horizontal_arc` cylindrical sector check
   *  - `shattersArmor` + point-blank blood explosion for Stake & Hammer (1.3m / 55°)
   *  - Passive blood siphon & wide cleave for Alucard Sword (2.5m / 120°)
   *  - Sweet-Spot Annulus [0.65 * R_eff, 1.00 * R_eff] (3.0x DMG + 3 Bleed) vs
   *    Inner Shaft (< 0.65 * R_eff, 0.40x DMG + outward knockback) for Occult Scythe (4.0m / 160°)
   */
  performDifferentiatedMeleeStrike(slotIndex = this.currentSlot) {
    const wep = this.weapons[slotIndex] || this.weapons[WeaponSlot.OCCULT_SCYTHE];
    const pCfg = wep.primaryFire;
    const mGeo = wep.meleeGeometry || {
      reach: pCfg.reachMeters || 3.6,
      horizontal_arc: pCfg.cleaveConeDeg || 105.0,
      vertical_tolerance: 2.0,
      shattersArmor: false,
    };

    const rateMult = this.scaling ? this.scaling.getFireRateMultiplier() : 1.0;
    this.primaryCooldown = pCfg.fireIntervalSec / rateMult;
    this.katanaComboStep = (this.katanaComboStep + 1) % 3;
    this.vmSwingPhase = 1.0;

    if (this.audio) {
      this.audio.playKatanaSlash(this.katanaComboStep);
    }

    const eyeOrigin = this.getEyeOrigin();
    const forwardXZ = this.controller.getForwardXZ();

    // Effective Reach scaled by `melee_reach_multiplier`: R_eff = R_base * M_reach
    const reachMult = this.getEffectiveMeleeReachMultiplier();
    const effectiveReach = mGeo.reach * reachMult;
    const minCos = Math.cos((mGeo.horizontal_arc * 0.5) * DEG2RAD);

    // High-speed movement (>16 m/s) or sliding/wall-running boosts crit
    const isHighMomentum =
      this.controller.getHorizontalSpeed() >= 16.0 ||
      this.controller.state === MovementState.SLIDE ||
      this.controller.state === MovementState.WALL_RUN;
    const baseCrit = isHighMomentum || Math.random() < (pCfg.critChance || 0.25);

    const scaleDmgMult = this.scaling ? this.scaling.getOccultDamageMultiplier() : 1.0;

    let targetsHit = 0;
    let sweetSpotHits = 0;
    let shaftGlancingHits = 0;
    let armorShatters = 0;
    let kills = 0;
    let totalDamageDealt = 0;
    let hitstopToTrigger = 0;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;

      const dx = this.husks.posX[i] - this.controller.position.x;
      const dy = (this.husks.posY[i] + 1.0) - eyeOrigin.y;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const horizDist = Math.hypot(dx, dz);

      // 1. Cylindrical Radial Reach Check (d <= R_eff)
      if (horizDist > effectiveReach || Math.abs(dy) > 2.4) continue;

      // 2. Horizontal Arc Check (theta_arc = horizontal_arc)
      if (horizDist > 0.25) {
        const cosAngle = (dx * forwardXZ.x + dz * forwardXZ.z) / horizDist;
        if (cosAngle < minCos) continue;
      }

      targetsHit++;

      // 3. Evaluate Sweet-Spot vs. Inner Shaft (Occult Scythe) or Standard Sector
      let zoneMultiplier = 1.0;
      let bleedToAdd = baseCrit ? (pCfg.bleedStacksOnCrit || 2) : (pCfg.bleedStacksOnHit || 1);
      let isCritHit = baseCrit;
      let knockbackImpulse = 0;
      let knockDir = forwardXZ;

      if (mGeo.sweet_spot && mGeo.sweet_spot.enabled) {
        const rho = horizDist / effectiveReach; // Normalized radial position in [0, 1]
        if (rho >= mGeo.sweet_spot.minRadiusRatio) {
          // SWEET-SPOT BLADE TIP (65% - 100% of effectiveReach): 3.0x DMG + 3 Bleed Stacks!
          zoneMultiplier = mGeo.sweet_spot.tipDamageMultiplier; // 3.0x
          bleedToAdd = mGeo.sweet_spot.tipBleedStacks + (baseCrit ? 1 : 0);
          isCritHit = true;
          sweetSpotHits++;
          this.lastMeleeZone = 'SWEET_SPOT_TIP';
          hitstopToTrigger = Math.max(hitstopToTrigger, 4);
        } else {
          // INNER WOODEN SHAFT (<65% of effectiveReach): 0.40x Glancing DMG + Outward Knockback into Sweet-Spot!
          zoneMultiplier = mGeo.sweet_spot.shaftDamageMultiplier; // 0.40x
          bleedToAdd = 0;
          isCritHit = false;
          knockbackImpulse = mGeo.sweet_spot.shaftKnockbackImpulse; // 12.0 m/s push outward
          if (horizDist > 0.05) {
            knockDir = new Vec3(dx / horizDist, 0, dz / horizDist);
          }
          shaftGlancingHits++;
          this.lastMeleeZone = 'INNER_SHAFT';
          hitstopToTrigger = Math.max(hitstopToTrigger, 1);
        }
      } else {
        this.lastMeleeZone = 'FULL_SECTOR';
        hitstopToTrigger = Math.max(
          hitstopToTrigger,
          isCritHit ? pCfg.hitstopFramesCrit : pCfg.hitstopFramesNormal
        );
      }

      const critMult =
        isCritHit && !mGeo.sweet_spot?.enabled ? pCfg.critMultiplier || 2.0 : isHighMomentum && mGeo.sweet_spot?.enabled && sweetSpotHits > 0 ? 1.25 : 1.0;
      const finalStrikeDamage = pCfg.baseDamage * zoneMultiplier * critMult * scaleDmgMult;

      const res = this.husks.applyDamage(i, finalStrikeDamage, pCfg.poiseDamage * zoneMultiplier, {
        isCrit: isCritHit,
        causeGibsOnKill: isCritHit || mGeo.shattersArmor,
        shatterArmor: Boolean(mGeo.shattersArmor),
        addBleedStacks: bleedToAdd,
        bleedDurationSec: pCfg.bleedDurationSec || 4.0,
        knockbackDir: knockDir,
        knockbackImpulse,
      });

      if (res.armorShattered) armorShatters++;
      totalDamageDealt += res.totalDamageDealt;

      // Stake & Hammer Point-Blank Blood Explosion on Close Kill / Armor Shatter!
      if (
        mGeo.pointBlankExplosionRadius &&
        (res.killed || res.armorShattered || horizDist <= 1.1)
      ) {
        this.husks._triggerMercuryAoE(
          i,
          mGeo.pointBlankExplosionRadius,
          mGeo.pointBlankExplosionDamage,
          80
        );
      }

      if (res.killed) {
        kills++;
        this.blood = Math.min(
          this.maxBlood,
          this.blood + (pCfg.siphonBloodOnKill || 14)
        );
        if (pCfg.siphonHpOnKill) {
          this.healPlayer(pCfg.siphonHpOnKill);
        }
        if (this.katanaKillResetWindow > 0) {
          this.katanaDashCooldown = 0.0;
          this.lastCombatEvent = 'REAPER KILL-RESET! (DASH REFUNDED)';
        }
      } else {
        this.blood = Math.min(this.maxBlood, this.blood + 6);
      }
    }

    if (targetsHit > 0) {
      this.triggerJuice({
        hitstopFrames: hitstopToTrigger,
        fovPunch: sweetSpotHits > 0 || armorShatters > 0 ? pCfg.fovPunchDeg * 1.6 : pCfg.fovPunchDeg,
        trauma: sweetSpotHits > 0 || armorShatters > 0 ? 0.32 : 0.16,
      });

      if (sweetSpotHits > 0) {
        this.lastCombatEvent = `SCYTHE SWEET-SPOT REAP! (3.0x DMG // +3 BLEED)`;
      } else if (shaftGlancingHits > 0) {
        this.lastCombatEvent = `SCYTHE SHAFT KNOCKBACK (PUSHED INTO SWEET-SPOT)`;
      } else if (armorShatters > 0) {
        this.lastCombatEvent = `STAKE & HAMMER ARMOR SHATTER! (+50% DMG & POINT-BLANK NOVA)`;
      } else if (!kills) {
        this.lastCombatEvent = `${wep.displayName} STRIKE (${targetsHit} HIT)`;
      }
    }

    return {
      slashed: true,
      weaponId: wep.id,
      effectiveReach,
      isCrit: baseCrit || sweetSpotHits > 0,
      targetsHit,
      sweetSpotHits,
      shaftGlancingHits,
      armorShatters,
      kills,
      totalDamageDealt,
    };
  }

  /**
   * Legacy alias for Occult Katana / Scythe primary slash (maintains 100% test compatibility).
   */
  performKatanaSlash() {
    return this.performDifferentiatedMeleeStrike(this.currentSlot);
  }

  /**
   * Stake & Hammer RMB Alt-Fire: Heart-Piercer Seismic Drive.
   */
  performStakeHammerSeismicDrive() {
    const wep = this.weapons[WeaponSlot.STAKE_HAMMER];
    const altCfg = wep.altFire;
    if (this.altFireCooldown > 0) return { fired: false, reason: 'COOLDOWN' };
    if (this.blood < wep.ammo.altFireBloodCost) return { fired: false, reason: 'LOW_BLOOD' };

    this.blood = Math.max(0, this.blood - wep.ammo.altFireBloodCost);
    this.altFireCooldown = altCfg.cooldownSec;
    this.primaryCooldown = 0.35;

    const forwardXZ = this.controller.getForwardXZ();
    this.controller.velocity.x = forwardXZ.x * 22.0;
    this.controller.velocity.z = forwardXZ.z * 22.0;

    const reach = altCfg.shockwaveRadius * this.getEffectiveMeleeReachMultiplier();
    const minCos = Math.cos((altCfg.shockwaveConeDeg * 0.5) * DEG2RAD);
    let hits = 0;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - this.controller.position.x;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach) continue;
      if (dist > 0.25 && (dx * forwardXZ.x + dz * forwardXZ.z) / dist < minCos) continue;

      hits++;
      this.husks.applyDamage(i, altCfg.baseDamage, altCfg.poiseDamage, {
        isCrit: true,
        shatterArmor: true,
        causeGibsOnKill: true,
        knockbackDir: forwardXZ,
      });
    }

    this.triggerJuice({
      hitstopFrames: altCfg.hitstopFrames,
      fovPunch: altCfg.fovPunchDeg,
      trauma: 0.5,
    });
    this.lastCombatEvent = `SEISMIC STAKE DRIVE! (${hits} SHATTERED)`;
    return { fired: true, targetsHit: hits };
  }

  /**
   * Alucard Sword RMB Alt-Fire: 180ms Crimson Guard Parry & Deflection + Blood-Wave Riposte.
   */
  performAlucardSwordParry() {
    const wep = this.weapons[WeaponSlot.ALUCARD_SWORD];
    const altCfg = wep.altFire;
    if (this.altFireCooldown > 0) return { parried: false, reason: 'COOLDOWN' };

    this.altFireCooldown = altCfg.cooldownSec;
    this.parryWindowTimer = altCfg.parryWindowSec;
    this.vmSwingPhase = 1.0;

    const eyeOrigin = this.getEyeOrigin();
    const aimDir = this.getAimDirection();
    const forwardXZ = this.controller.getForwardXZ();

    // Immediately deflect any frontal enemy projectiles within 4.5m at 400% return damage!
    const deflectedCount = this.husks.deflectProjectilesInCone(
      eyeOrigin,
      aimDir,
      altCfg.parryShockwaveRadius,
      130.0,
      altCfg.parryReturnDamageMult
    );

    // Also unleash a frontal Blood-Wave Riposte shockwave
    const reach = altCfg.parryShockwaveRadius * this.getEffectiveMeleeReachMultiplier();
    const minCos = Math.cos(60.0 * DEG2RAD);
    let riposteHits = 0;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD) continue;
      const dx = this.husks.posX[i] - this.controller.position.x;
      const dz = this.husks.posZ[i] - this.controller.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach) continue;
      if (dist > 0.25 && (dx * forwardXZ.x + dz * forwardXZ.z) / dist < minCos) continue;

      riposteHits++;
      this.husks.applyDamage(i, altCfg.parryShockwaveDamage, altCfg.parryShockwavePoise, {
        isCrit: deflectedCount > 0,
        causeGibsOnKill: true,
        knockbackDir: forwardXZ,
      });
    }

    this.triggerJuice({
      hitstopFrames: deflectedCount > 0 ? altCfg.hitstopFrames : 2,
      fovPunch: altCfg.fovPunchDeg,
      trauma: 0.4,
    });

    this.lastCombatEvent =
      deflectedCount > 0
        ? `ALUCARD PARRY REFLECT! (${deflectedCount}x PROJECTILE @ 400% DMG)`
        : `CRIMSON GUARD PARRY WINDOW OPEN (180ms)`;

    return {
      parried: true,
      deflectedCount,
      riposteHits,
    };
  }

  /**
   * Starts the Occult Scythe / Katana RMB Reaper Blood-Dash Strike (11.5m 3D lunge).
   */
  startKatanaBloodDash() {
    const dCfg = this.weapons[WeaponSlot.OCCULT_SCYTHE].altFire;
    if (this.katanaDashCooldown > 0 || this.isBloodDashing) {
      return { dashed: false, reason: 'COOLDOWN' };
    }

    this.isBloodDashing = true;
    this.bloodDashTimer = dCfg.dashDurationSec;
    this.katanaDashCooldown = dCfg.cooldownSec;
    this.katanaKillResetWindow = dCfg.killResetWindowSec;
    this.bloodDashHitSet.clear();

    this.getAimDirection(this.bloodDashDir);
    if (this.controller.grounded && this.bloodDashDir.y < 0.05) {
      this.bloodDashDir.y = 0.08;
      this.bloodDashDir.normalize();
    }

    this.bloodDashSpeed = dCfg.dashDistanceMeters / dCfg.dashDurationSec;
    this.controller.state = MovementState.AIR;
    this.controller.grounded = false;

    if (this.audio) this.audio.playKatanaBloodDash();
    this.triggerJuice({ fovPunch: dCfg.fovPunchDeg, trauma: 0.35 });
    this.lastCombatEvent = 'REAPER BLOOD-DASH STRIKE!';

    this._sliceTargetsAlongDash();
    return { dashed: true };
  }

  _stepKatanaBloodDash(dt) {
    const dCfg = this.weapons[WeaponSlot.OCCULT_SCYTHE].altFire;
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
    const dCfg = this.weapons[WeaponSlot.OCCULT_SCYTHE].altFire;
    const px = this.controller.position.x;
    const py = this.controller.position.y + 1.0;
    const pz = this.controller.position.z;
    const r = dCfg.sliceRadiusMeters * this.getEffectiveMeleeReachMultiplier();
    const rSq = r * r;

    for (let i = 0; i < MAX_HUSKS; i++) {
      if (this.husks.state[i] === HuskState.DEAD || this.bloodDashHitSet.has(i)) continue;

      const dx = this.husks.posX[i] - px;
      const dy = (this.husks.posY[i] + 1.0) - py;
      const dz = this.husks.posZ[i] - pz;

      if (dx * dx + dz * dz <= rSq && Math.abs(dy) <= 2.4) {
        this.bloodDashHitSet.add(i);

        const res = this.husks.applyDamage(i, dCfg.baseDamage, dCfg.poiseDamage, {
          isCrit: true,
          causeGibsOnKill: true,
          knockbackDir: this.bloodDashDir,
        });

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
  executeQuickMelee() {
    this.quickMeleeCooldown = QuickMeleeConfig.cooldownSec;
    const forwardXZ = this.controller.getForwardXZ();
    const isSliding = this.controller.state === MovementState.SLIDE;

    if (!isSliding) {
      const execIdx = this._findStaggeredExecutionTarget(forwardXZ);
      if (execIdx >= 0) {
        return this._performVampiricExecution(execIdx, forwardXZ);
      }
    }

    if (isSliding) {
      return this._performSlideBloodKick(forwardXZ);
    }

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

    const tx = this.husks.posX[targetIdx] - forwardXZ.x * 1.25;
    const tz = this.husks.posZ[targetIdx] - forwardXZ.z * 1.25;
    this.controller.position.x = tx;
    this.controller.position.z = tz;

    this.husks.applyDamage(targetIdx, eCfg.damage, 200, {
      isCrit: true,
      isExecution: true,
      shatterArmor: true,
      causeGibsOnKill: true,
      knockbackDir: forwardXZ,
    });

    this.healPlayer(eCfg.healHp);
    this.blood = Math.min(this.maxBlood, this.blood + eCfg.restoreBlood);
    this.pistolAmmo = Math.min(this.pistolMaxAmmo, this.pistolAmmo + 4);
    this.shotgunAmmo = Math.min(this.shotgunMaxAmmo, this.shotgunAmmo + 2);

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
        shatterArmor: true,
        causeGibsOnKill: true,
        knockbackDir: forwardXZ,
      });

      if (!res.killed) {
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
