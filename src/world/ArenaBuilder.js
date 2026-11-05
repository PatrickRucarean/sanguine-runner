/**
 * SANGUINE_RUNNER — Three.js Brutalist Greybox Scene Renderer
 * Generates crisp procedural PSX/Boomer-Shooter measurement grids and low-poly meshes
 * directly from the CollisionWorld colliders for 120+ FPS performance.
 */

import * as THREE from '../../vendor/three.module.js';

/**
 * Generates a crisp nearest-neighbor procedural grid texture on an HTML5 Canvas.
 */
function createProceduralGridTexture({
  bgHex = '#14151b',
  lineHex = '#2a2c38',
  accentHex = '#e60012',
  subdivisions = 4,
  drawChevrons = false,
}) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Background fill
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, size, size);

  // Minor grid lines
  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 2;
  const step = size / subdivisions;
  for (let i = 0; i <= subdivisions; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Outer border accent
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  if (drawChevrons) {
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(size * 0.25, size * 0.65);
    ctx.lineTo(size * 0.5, size * 0.35);
    ctx.lineTo(size * 0.75, size * 0.65);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export class ArenaBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   */
  static buildThreeScene(scene, collisionWorld) {
    // 1. Atmospheric Brutalist Fog & Lighting
    scene.background = new THREE.Color(0x0b0b0e);
    scene.fog = new THREE.FogExp2(0x0b0b0e, 0.0068);

    const ambientLight = new THREE.AmbientLight(0xd8d6df, 0.72);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0e6, 1.15);
    dirLight.position.set(35, 70, 25);
    scene.add(dirLight);

    const crimsonFill = new THREE.DirectionalLight(0xe60012, 0.42);
    crimsonFill.position.set(-40, -20, -50);
    scene.add(crimsonFill);

    // 2. Shared Procedural Greybox Materials
    const texFloor = createProceduralGridTexture({
      bgHex: '#15161e',
      lineHex: '#252836',
      accentHex: '#3c4054',
      subdivisions: 4,
    });
    texFloor.repeat.set(18, 18);

    const texWallRun = createProceduralGridTexture({
      bgHex: '#20080d',
      lineHex: '#4a1019',
      accentHex: '#e60012',
      subdivisions: 2,
      drawChevrons: true,
    });
    texWallRun.repeat.set(6, 2);

    const texRamp = createProceduralGridTexture({
      bgHex: '#241014',
      lineHex: '#5c1922',
      accentHex: '#ff3b00',
      subdivisions: 4,
      drawChevrons: true,
    });
    texRamp.repeat.set(3, 8);

    const texLedge = createProceduralGridTexture({
      bgHex: '#211c12',
      lineHex: '#4f4122',
      accentHex: '#ffd700',
      subdivisions: 2,
    });
    texLedge.repeat.set(2, 2);

    const materials = {
      floor_grid: new THREE.MeshLambertMaterial({ map: texFloor }),
      abyss_floor: new THREE.MeshLambertMaterial({ color: 0x10080b }),
      stone: new THREE.MeshLambertMaterial({ color: 0x232530 }),
      obsidian: new THREE.MeshLambertMaterial({ color: 0x121318 }),
      pillar: new THREE.MeshLambertMaterial({ color: 0x2c2e3b }),
      wallrun_crimson: new THREE.MeshLambertMaterial({ map: texWallRun }),
      ramp: new THREE.MeshLambertMaterial({ map: texRamp }),
      ramp_crimson: new THREE.MeshLambertMaterial({ map: texRamp }),
      ledge_gold: new THREE.MeshLambertMaterial({ map: texLedge }),
      crimson_trim: new THREE.MeshLambertMaterial({
        color: 0xe60012,
        emissive: 0x450006,
      }),
      jumppad: new THREE.MeshBasicMaterial({ color: 0xff2200 }),
    };

    const edgeMaterialDark = new THREE.LineBasicMaterial({ color: 0x4a4845 });
    const edgeMaterialCrimson = new THREE.LineBasicMaterial({ color: 0xe60012 });
    const edgeMaterialGold = new THREE.LineBasicMaterial({ color: 0xffd700 });

    const arenaGroup = new THREE.Group();
    const allColliders = [...collisionWorld.colliders, ...collisionWorld.jumpPads];

    for (let i = 0; i < allColliders.length; i++) {
      const col = allColliders[i];
      const geom = new THREE.BoxGeometry(col.size[0], col.size[1], col.size[2]);
      const mat = materials[col.colorType] || materials.stone;
      const mesh = new THREE.Mesh(geom, mat);

      mesh.position.set(col.center.x, col.center.y, col.center.z);
      mesh.rotation.set(col.rotation[0], col.rotation[1], col.rotation[2], 'XYZ');

      // Crisp architectural wireframe edge highlights for instant depth & ledge readability
      const edgesGeom = new THREE.EdgesGeometry(geom);
      let lineMat = edgeMaterialDark;
      if (col.colorType === 'wallrun_crimson' || col.colorType === 'crimson_trim' || col.colorType === 'jumppad') {
        lineMat = edgeMaterialCrimson;
      } else if (col.colorType === 'ledge_gold') {
        lineMat = edgeMaterialGold;
      }
      const wireframe = new THREE.LineSegments(edgesGeom, lineMat);
      mesh.add(wireframe);

      arenaGroup.add(mesh);
    }

    scene.add(arenaGroup);
    return arenaGroup;
  }
}
