/**
 * SANGUINE_RUNNER — Brutalist Movement Greybox Arena Definition
 * Engine-agnostic geometry layout shared by both the 120Hz CollisionWorld
 * and the Three.js Greybox Renderer.
 */

import { Vec3 } from '../physics/Vec3.js';

const DEG2RAD = Math.PI / 180.0;

/** Named spawn/teleport points for quick testing (Keys 1-5 & R) */
export const ArenaSpawnPoints = {
  COURTYARD: {
    name: '1: Central Courtyard',
    position: new Vec3(0, 0.05, 14),
    yaw: 0, // Facing North (-Z) toward Slide Arch & Wall-Run Chasm
  },
  WALL_RUN_CHASM: {
    name: '2: Parallel Wall-Run Chasm',
    position: new Vec3(0, 2.05, -31),
    yaw: 0, // Facing North into the parallel wall-run gauntlet
  },
  SLOPE_AQUEDUCT: {
    name: '3: Blood-Aqueduct Slide Ramps',
    position: new Vec3(45, 11.05, -24),
    yaw: Math.PI, // Facing South (+Z) down the 20-deg & 28-deg slide chutes
  },
  MANTLE_TOWER: {
    name: '4: Ledge Mantle Ziggurat',
    position: new Vec3(-22, 0.05, 12),
    yaw: 90 * DEG2RAD, // Facing West (-X) toward stepped mantle ledges
  },
  BHOP_SPEEDWAY: {
    name: '5: 100m Bhop Speedway',
    position: new Vec3(0, 0.05, 36),
    yaw: Math.PI, // Facing South (+Z) down the 100m speedway
  },
};

/**
 * Populates a CollisionWorld with the complete Phase 1 Greybox Test Arena.
 * @param {import('../physics/CollisionWorld.js').CollisionWorld} world
 */
export function buildGreyboxCollisionWorld(world) {
  world.clear();

  // =========================================================================
  // 1. CENTRAL CATHEDRAL COURTYARD (x: -36..36, z: -34..34)
  // =========================================================================
  // Main Courtyard Floor (top at y = 0)
  world.addCollider({
    center: [0, -1.0, 0],
    size: [72, 2.0, 68],
    tag: 'ground',
    colorType: 'floor_grid',
    label: 'Courtyard Floor',
  });

  // Low Slide-Gate Archway in center-north (clearance height = 1.25m, forces SLIDE!)
  // Left & Right Arch Piers
  world.addCollider({
    center: [-4.5, 2.25, -4],
    size: [2.0, 4.5, 2.5],
    tag: 'pillar',
    colorType: 'obsidian',
  });
  world.addCollider({
    center: [4.5, 2.25, -4],
    size: [2.0, 4.5, 2.5],
    tag: 'pillar',
    colorType: 'obsidian',
  });
  // Overhead Slide Lintel (bottom at y = 1.25m, standing player 1.80m must slide under!)
  world.addCollider({
    center: [0, 2.85, -4],
    size: [11.0, 3.2, 2.5],
    tag: 'solid',
    colorType: 'crimson_trim',
    label: 'SLIDE GATE (CROUCH < 1.25m)',
  });

  // 6 Monumental Gothic Pillars in Courtyard for Wall-Kicks & Slalom
  const pillarPositions = [
    [-14, -14],
    [14, -14],
    [-14, 2],
    [14, 2],
    [-14, 18],
    [14, 18],
  ];
  for (const [px, pz] of pillarPositions) {
    world.addCollider({
      center: [px, 5.0, pz],
      size: [2.8, 10.0, 2.8],
      tag: 'pillar',
      colorType: 'pillar',
    });
  }

  // Introductory Warmup Ramp in Courtyard (16 deg slope leading to a mantle block)
  world.addCollider({
    center: [22, 1.1, 8],
    size: [5.0, 0.6, 9.0],
    rotation: [16 * DEG2RAD, 0, 0],
    tag: 'ramp',
    colorType: 'ramp',
    label: 'Warmup Slope',
  });
  world.addCollider({
    center: [22, 1.35, 1.5],
    size: [5.0, 2.7, 4.5],
    tag: 'ledge',
    colorType: 'ledge_gold',
  });

  // Courtyard Sanguine Geyser Jump Pad (launches up to Skybridge / Slide Deck)
  world.addCollider({
    center: [28, 0.15, -18],
    size: [3.4, 0.3, 3.4],
    tag: 'jumppad',
    colorType: 'jumppad',
    jumpPadImpulse: { vx: 4.0, vy: 22.0, vz: -2.0 },
    label: 'Sanguine Jump Pad',
  });

  // =========================================================================
  // 2. NORTH SECTOR: PARALLEL WALL-RUN CHASM & GAUNTLET (z: -34..-125)
  // =========================================================================
  // Elevated Launch Platform at North Edge of Courtyard (top at y = 2.0)
  world.addCollider({
    center: [0, 1.0, -31],
    size: [16, 2.0, 7],
    tag: 'ground',
    colorType: 'stone',
    label: 'Wall-Run Launch Deck',
  });
  // Steps up to Launch Deck
  world.addCollider({
    center: [0, 0.35, -26.5],
    size: [8, 0.7, 2.0],
    tag: 'ground',
    colorType: 'stone',
  });
  world.addCollider({
    center: [0, 0.80, -25.0],
    size: [8, 0.35, 1.0],
    tag: 'ground',
    colorType: 'stone',
  });

  // Sunken Chasm Safety Floor (top at y = -6.0m) + Jump Pad back up
  world.addCollider({
    center: [0, -7.0, -80],
    size: [44, 2.0, 96],
    tag: 'ground',
    colorType: 'abyss_floor',
  });
  world.addCollider({
    center: [0, -5.85, -55],
    size: [4.5, 0.3, 4.5],
    tag: 'jumppad',
    colorType: 'jumppad',
    jumpPadImpulse: { vx: 0, vy: 21.5, vz: 10.0 },
  });
  world.addCollider({
    center: [0, -5.85, -95],
    size: [4.5, 0.3, 4.5],
    tag: 'jumppad',
    colorType: 'jumppad',
    jumpPadImpulse: { vx: 0, vy: 23.0, vz: -8.0 },
  });

  // Stage 2A: Parallel Double Wall-Run Corridor (spaced 6.8m apart, z: -36 to -64)
  // Left Wall (inner face at x = -3.4)
  world.addCollider({
    center: [-4.0, 4.5, -50],
    size: [1.2, 8.5, 26],
    tag: 'wall',
    colorType: 'wallrun_crimson',
    label: 'Parallel Wall Left',
  });
  // Right Wall (inner face at x = +3.4)
  world.addCollider({
    center: [4.0, 4.5, -50],
    size: [1.2, 8.5, 26],
    tag: 'wall',
    colorType: 'wallrun_crimson',
    label: 'Parallel Wall Right',
  });

  // Mid-Chasm Landing / Mantle Island (z: -66 to -73, top at y = 3.2m — tests Wall-Run -> Mantle!)
  world.addCollider({
    center: [0, 1.6, -69.5],
    size: [8.0, 3.2, 7.0],
    tag: 'ledge',
    colorType: 'ledge_gold',
    label: 'Mid-Chasm Mantle Platform',
  });

  // Stage 2B: Staggered Alternating Wall-Kick Monoliths (z: -75 to -114)
  // Wall 1 (Left, z: -76 to -90)
  world.addCollider({
    center: [-4.8, 5.5, -83],
    size: [1.2, 9.0, 15],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });
  // Wall 2 (Right, z: -86 to -102)
  world.addCollider({
    center: [4.8, 6.2, -94],
    size: [1.2, 9.0, 16],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });
  // Wall 3 (Left, z: -98 to -114)
  world.addCollider({
    center: [-4.8, 7.0, -106],
    size: [1.2, 9.0, 16],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });

  // North Sanctum End Platform (top at y = 5.0m, z: -116 to -126)
  world.addCollider({
    center: [0, 2.5, -121],
    size: [18.0, 5.0, 12.0],
    tag: 'ground',
    colorType: 'ledge_gold',
    label: 'North Sanctum Goal',
  });
  // Return Jump Pad on North Sanctum (launches back to Courtyard)
  world.addCollider({
    center: [0, 5.15, -121],
    size: [3.6, 0.3, 3.6],
    tag: 'jumppad',
    colorType: 'jumppad',
    jumpPadImpulse: { vx: 0, vy: 20.0, vz: 26.0 },
  });

  // =========================================================================
  // 3. EAST SECTOR: SLOPED BLOOD-AQUEDUCT SLIDE RAMPS (x: 36..72, z: -34..45)
  // =========================================================================
  // High Starting Deck (top at y = 11.0m, z: -34 to -18)
  world.addCollider({
    center: [52, 5.5, -26],
    size: [28, 11.0, 16],
    tag: 'ground',
    colorType: 'stone',
    label: 'Aqueduct High Deck (y=11m)',
  });

  // Helper to place a ramp whose top surface is 100% flush with (topZ, topY) and (bottomY)
  const addFlushSouthRamp = (x, width, topY, bottomY, topZ, angleDeg, label) => {
    const theta = angleDeg * DEG2RAD;
    const drop = topY - bottomY;
    const length = drop / Math.sin(theta);
    const thickness = 1.0;
    const hy = thickness * 0.5;
    const midTopZ = topZ + (length * 0.5) * Math.cos(theta);
    const midTopY = topY - (length * 0.5) * Math.sin(theta);
    const centerZ = midTopZ - hy * Math.sin(theta);
    const centerY = midTopY - hy * Math.cos(theta);

    world.addCollider({
      center: [x, centerY, centerZ],
      size: [width, thickness, length],
      rotation: [theta, 0, 0],
      tag: 'ramp',
      colorType: 'ramp_crimson',
      label,
    });
    return { bottomZ: topZ + length * Math.cos(theta), length };
  };

  // Chute A: 20-Degree Long High-Speed Slide Ramp (x = 45, flush with z = -18, y = 11m -> 0m)
  const chuteA = addFlushSouthRamp(45, 9.0, 11.0, 0.0, -18.0, 20, '20-Deg Slide Aqueduct');

  // Chute B: 28-Degree Steep Extreme Velocity Slide Ramp (x = 58, flush with z = -18, y = 11m -> 0m)
  addFlushSouthRamp(58, 9.0, 11.0, 0.0, -18.0, 28, '28-Deg Extreme Slide Chute');

  // Slide Runout Deck at bottom of ramps (top at y = 0.0m, extending from z = -18 to z = +36)
  world.addCollider({
    center: [52, -1.0, 10],
    size: [28, 2.0, 56],
    tag: 'ground',
    colorType: 'floor_grid',
    label: 'Slide Runout Deck',
  });

  // =========================================================================
  // 4. WEST SECTOR: VERTICAL LEDGE MANTLE ZIGGURAT & SKYBRIDGE (x: -24..-58)
  // =========================================================================
  // Stepped Ledge Blocks spaced for rapid Mantle Vaults (heights: 1.6m -> 3.2m -> 4.8m -> 6.4m -> 8.0m -> 9.6m -> 11.0m)
  const mantleSteps = [
    { center: [-28, 0.8, 12], size: [4.5, 1.6, 6.0] },
    { center: [-34, 1.6, 12], size: [4.5, 3.2, 6.0] },
    { center: [-40, 2.4, 12], size: [4.5, 4.8, 6.0] },
    { center: [-46, 3.2, 12], size: [4.5, 6.4, 6.0] },
    { center: [-46, 4.0, 3], size: [5.0, 8.0, 6.0] },
    { center: [-46, 4.8, -6], size: [5.0, 9.6, 6.0] },
    { center: [-46, 5.5, -16], size: [8.0, 11.0, 8.0] },
  ];
  for (let i = 0; i < mantleSteps.length; i++) {
    world.addCollider({
      center: mantleSteps[i].center,
      size: mantleSteps[i].size,
      tag: 'ledge',
      colorType: 'ledge_gold',
      label: `Mantle Step ${i + 1}`,
    });
  }

  // Vertical Wall-Kick Chimney next to Mantle Tower (two facing walls 5.2m apart)
  world.addCollider({
    center: [-34, 6.0, -16],
    size: [6.0, 12.0, 1.2],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });
  world.addCollider({
    center: [-34, 6.0, -22.4],
    size: [6.0, 12.0, 1.2],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });

  // High Gothic Skybridge connecting West Mantle Tower (x=-46) to East Aqueduct Deck (x=52) at y=11.0m
  world.addCollider({
    center: [3, 10.6, -22],
    size: [92, 0.8, 4.2],
    tag: 'ground',
    colorType: 'obsidian',
    label: 'High Cathedral Skybridge',
  });

  // =========================================================================
  // 5. SOUTH SECTOR: 100-METER BHOP & SLIDE-HOP SPEEDWAY (z: 34..144)
  // =========================================================================
  world.addCollider({
    center: [0, -1.0, 90],
    size: [22, 2.0, 112],
    tag: 'ground',
    colorType: 'floor_grid',
    label: '100m Bhop Speedway',
  });

  // Side Wall-Run Rails along the 100m Speedway
  world.addCollider({
    center: [-11.6, 3.0, 90],
    size: [1.2, 6.0, 112],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });
  world.addCollider({
    center: [11.6, 3.0, 90],
    size: [1.2, 6.0, 112],
    tag: 'wall',
    colorType: 'wallrun_crimson',
  });

  // Distance Gate Arches every 20 meters down the Speedway (z = 50, 70, 90, 110, 130)
  for (let zGate = 50; zGate <= 130; zGate += 20) {
    world.addCollider({
      center: [0, 6.5, zGate],
      size: [22.0, 1.2, 1.2],
      tag: 'solid',
      colorType: 'crimson_trim',
    });
  }

  // Return Jump Pad at the far South end of the 100m Speedway (z = 140)
  world.addCollider({
    center: [0, 0.15, 140],
    size: [5.0, 0.3, 5.0],
    tag: 'jumppad',
    colorType: 'jumppad',
    jumpPadImpulse: { vx: 0, vy: 19.0, vz: -32.0 },
    label: 'Speedway Return Pad',
  });
}
