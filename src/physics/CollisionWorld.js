/**
 * SANGUINE_RUNNER — Deterministic 3D Analytical Collision & Raycast World
 * Supports Axis-Aligned Boxes (AABB), Oriented Bounding Boxes (OBB) for sloped ramps
 * and angled walls, Stair-Stepping, Capsule Collide-and-Slide, and Jump Pads.
 */

import { Vec3, clamp } from './Vec3.js';

export class OBBCollider {
  /**
   * @param {Object} opts
   * @param {number[]} opts.center [x, y, z] world center
   * @param {number[]} opts.size [width, height, depth] full dimensions
   * @param {number[]} [opts.rotation] [rx, ry, rz] Euler XYZ angles in radians
   * @param {string} [opts.tag] 'ground' | 'wall' | 'ramp' | 'pillar' | 'ledge' | 'jumppad'
   * @param {Object} [opts.jumpPadImpulse] { vx, vy, vz } if tag === 'jumppad'
   * @param {string} [opts.colorType] visual material classification for ArenaBuilder
   */
  constructor({
    center,
    size,
    rotation = [0, 0, 0],
    tag = 'solid',
    jumpPadImpulse = null,
    colorType = 'stone',
    label = '',
  }) {
    this.center = new Vec3(center[0], center[1], center[2]);
    this.halfExtents = new Vec3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);
    this.size = [...size];
    this.rotation = [...rotation];
    this.tag = tag;
    this.jumpPadImpulse = jumpPadImpulse;
    this.colorType = colorType;
    this.label = label;

    // Orthonormal local basis axes in world space (u = X, v = Y, w = Z)
    this.axisX = new Vec3(1, 0, 0);
    this.axisY = new Vec3(0, 1, 0);
    this.axisZ = new Vec3(0, 0, 1);
    this._computeBasis(rotation[0], rotation[1], rotation[2]);

    // Precompute world-space AABB for ultra-fast broadphase culling
    this.aabbMin = new Vec3();
    this.aabbMax = new Vec3();
    this._computeWorldAABB();
  }

  _computeBasis(rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);

    // Intrinsic XYZ rotation matrix columns
    this.axisX.set(
      cy * cz,
      cx * sz + sx * sy * cz,
      sx * sz - cx * sy * cz
    );
    this.axisY.set(
      -cy * sz,
      cx * cz - sx * sy * sz,
      sx * cz + cx * sy * sz
    );
    this.axisZ.set(
      sy,
      -sx * cy,
      cx * cy
    );
  }

  _computeWorldAABB() {
    const hx = this.halfExtents.x;
    const hy = this.halfExtents.y;
    const hz = this.halfExtents.z;

    const ex = Math.abs(this.axisX.x) * hx + Math.abs(this.axisY.x) * hy + Math.abs(this.axisZ.x) * hz;
    const ey = Math.abs(this.axisX.y) * hx + Math.abs(this.axisY.y) * hy + Math.abs(this.axisZ.y) * hz;
    const ez = Math.abs(this.axisX.z) * hx + Math.abs(this.axisY.z) * hy + Math.abs(this.axisZ.z) * hz;

    this.aabbMin.set(this.center.x - ex, this.center.y - ey, this.center.z - ez);
    this.aabbMax.set(this.center.x + ex, this.center.y + ey, this.center.z + ez);
  }

  /** Transform world point into OBB local space relative to center */
  worldToLocalPoint(worldPt, out = new Vec3()) {
    const dx = worldPt.x - this.center.x;
    const dy = worldPt.y - this.center.y;
    const dz = worldPt.z - this.center.z;
    return out.set(
      dx * this.axisX.x + dy * this.axisX.y + dz * this.axisX.z,
      dx * this.axisY.x + dy * this.axisY.y + dz * this.axisY.z,
      dx * this.axisZ.x + dy * this.axisZ.y + dz * this.axisZ.z
    );
  }

  /** Transform world direction vector into OBB local space */
  worldToLocalDir(worldDir, out = new Vec3()) {
    return out.set(
      worldDir.x * this.axisX.x + worldDir.y * this.axisX.y + worldDir.z * this.axisX.z,
      worldDir.x * this.axisY.x + worldDir.y * this.axisY.y + worldDir.z * this.axisY.z,
      worldDir.x * this.axisZ.x + worldDir.y * this.axisZ.y + worldDir.z * this.axisZ.z
    );
  }

  /** Transform local direction/normal back to world space */
  localToWorldDir(localDir, out = new Vec3()) {
    return out.set(
      this.axisX.x * localDir.x + this.axisY.x * localDir.y + this.axisZ.x * localDir.z,
      this.axisX.y * localDir.x + this.axisY.y * localDir.y + this.axisZ.y * localDir.z,
      this.axisX.z * localDir.x + this.axisY.z * localDir.y + this.axisZ.z * localDir.z
    );
  }

  /** Transform local point back to world space */
  localToWorldPoint(localPt, out = new Vec3()) {
    return out.set(
      this.center.x + this.axisX.x * localPt.x + this.axisY.x * localPt.y + this.axisZ.x * localPt.z,
      this.center.y + this.axisX.y * localPt.x + this.axisY.y * localPt.y + this.axisZ.y * localPt.z,
      this.center.z + this.axisX.z * localPt.x + this.axisY.z * localPt.y + this.axisZ.z * localPt.z
    );
  }
}

export class CollisionWorld {
  constructor() {
    /** @type {OBBCollider[]} */
    this.colliders = [];
    /** @type {OBBCollider[]} */
    this.jumpPads = [];
  }

  addCollider(opts) {
    const col = new OBBCollider(opts);
    if (col.tag === 'jumppad') {
      this.jumpPads.push(col);
    } else {
      this.colliders.push(col);
    }
    return col;
  }

  clear() {
    this.colliders.length = 0;
    this.jumpPads.length = 0;
  }

  /**
   * Exact Ray vs OBB World Intersection
   * @param {Vec3} origin
   * @param {Vec3} dir Normalized direction vector
   * @param {number} maxDist Maximum ray distance
   * @returns {{ hit: boolean, distance: number, point: Vec3, normal: Vec3, collider: OBBCollider|null }}
   */
  raycast(origin, dir, maxDist = 100.0) {
    let closestDist = maxDist;
    let hitCollider = null;
    const hitLocalNormal = new Vec3();
    const localOrigin = new Vec3();
    const localDir = new Vec3();

    const rMinX = Math.min(origin.x, origin.x + dir.x * maxDist) - 0.05;
    const rMaxX = Math.max(origin.x, origin.x + dir.x * maxDist) + 0.05;
    const rMinY = Math.min(origin.y, origin.y + dir.y * maxDist) - 0.05;
    const rMaxY = Math.max(origin.y, origin.y + dir.y * maxDist) + 0.05;
    const rMinZ = Math.min(origin.z, origin.z + dir.z * maxDist) - 0.05;
    const rMaxZ = Math.max(origin.z, origin.z + dir.z * maxDist) + 0.05;

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];

      // Broadphase AABB reject
      if (
        rMaxX < col.aabbMin.x || rMinX > col.aabbMax.x ||
        rMaxY < col.aabbMin.y || rMinY > col.aabbMax.y ||
        rMaxZ < col.aabbMin.z || rMinZ > col.aabbMax.z
      ) {
        continue;
      }

      col.worldToLocalPoint(origin, localOrigin);
      col.worldToLocalDir(dir, localDir);

      const hx = col.halfExtents.x;
      const hy = col.halfExtents.y;
      const hz = col.halfExtents.z;

      let tMin = 0.0;
      let tMax = closestDist;
      let nx = 0, ny = 0, nz = 0;
      let valid = true;

      // X Slab
      if (Math.abs(localDir.x) < 1e-8) {
        if (localOrigin.x < -hx || localOrigin.x > hx) valid = false;
      } else {
        const invD = 1.0 / localDir.x;
        let t1 = (-hx - localOrigin.x) * invD;
        let t2 = (hx - localOrigin.x) * invD;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1; t1 = t2; t2 = tmp;
          sign = 1;
        }
        if (t1 > tMin) {
          tMin = t1;
          nx = sign; ny = 0; nz = 0;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) valid = false;
      }

      // Y Slab
      if (valid) {
        if (Math.abs(localDir.y) < 1e-8) {
          if (localOrigin.y < -hy || localOrigin.y > hy) valid = false;
        } else {
          const invD = 1.0 / localDir.y;
          let t1 = (-hy - localOrigin.y) * invD;
          let t2 = (hy - localOrigin.y) * invD;
          let sign = -1;
          if (t1 > t2) {
            const tmp = t1; t1 = t2; t2 = tmp;
            sign = 1;
          }
          if (t1 > tMin) {
            tMin = t1;
            nx = 0; ny = sign; nz = 0;
          }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) valid = false;
        }
      }

      // Z Slab
      if (valid) {
        if (Math.abs(localDir.z) < 1e-8) {
          if (localOrigin.z < -hz || localOrigin.z > hz) valid = false;
        } else {
          const invD = 1.0 / localDir.z;
          let t1 = (-hz - localOrigin.z) * invD;
          let t2 = (hz - localOrigin.z) * invD;
          let sign = -1;
          if (t1 > t2) {
            const tmp = t1; t1 = t2; t2 = tmp;
            sign = 1;
          }
          if (t1 > tMin) {
            tMin = t1;
            nx = 0; ny = 0; nz = sign;
          }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) valid = false;
        }
      }

      if (valid && tMin >= 0 && tMin < closestDist && (nx !== 0 || ny !== 0 || nz !== 0)) {
        closestDist = tMin;
        hitCollider = col;
        hitLocalNormal.set(nx, ny, nz);
      }
    }

    if (hitCollider) {
      const worldNormal = hitCollider.localToWorldDir(hitLocalNormal, new Vec3()).normalize();
      const point = new Vec3(
        origin.x + dir.x * closestDist,
        origin.y + dir.y * closestDist,
        origin.z + dir.z * closestDist
      );
      return {
        hit: true,
        distance: closestDist,
        point,
        normal: worldNormal,
        collider: hitCollider,
      };
    }

    return {
      hit: false,
      distance: maxDist,
      point: new Vec3(origin.x + dir.x * maxDist, origin.y + dir.y * maxDist, origin.z + dir.z * maxDist),
      normal: new Vec3(0, 1, 0),
      collider: null,
    };
  }

  /**
   * Computes sphere vs OBB penetration in world space.
   * Returns { hit: boolean, normal: Vec3, depth: number }
   */
  _testSphereOBB(sphereCenter, radius, col, outNormal) {
    const localP = col.worldToLocalPoint(sphereCenter);
    const hx = col.halfExtents.x;
    const hy = col.halfExtents.y;
    const hz = col.halfExtents.z;

    const cx = clamp(localP.x, -hx, hx);
    const cy = clamp(localP.y, -hy, hy);
    const cz = clamp(localP.z, -hz, hz);

    const dx = localP.x - cx;
    const dy = localP.y - cy;
    const dz = localP.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq >= radius * radius) {
      return { hit: false, depth: 0 };
    }

    const localN = new Vec3();
    let depth = 0;

    if (distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      localN.set(dx / dist, dy / dist, dz / dist);
      depth = radius - dist;
    } else {
      // Sphere center is inside the OBB: push out along nearest face axis
      const px = hx - Math.abs(localP.x);
      const py = hy - Math.abs(localP.y);
      const pz = hz - Math.abs(localP.z);

      if (px <= py && px <= pz) {
        localN.set(localP.x >= 0 ? 1 : -1, 0, 0);
        depth = px + radius;
      } else if (py <= px && py <= pz) {
        localN.set(0, localP.y >= 0 ? 1 : -1, 0);
        depth = py + radius;
      } else {
        localN.set(0, 0, localP.z >= 0 ? 1 : -1);
        depth = pz + radius;
      }
    }

    col.localToWorldDir(localN, outNormal).normalize();
    return { hit: true, depth };
  }

  /**
   * Checks if a vertical capsule at `feetPos` with `radius` and `height` overlaps any solid collider.
   */
  checkCapsuleOverlap(feetPos, radius, height) {
    const minX = feetPos.x - radius;
    const maxX = feetPos.x + radius;
    const minY = feetPos.y;
    const maxY = feetPos.y + height;
    const minZ = feetPos.z - radius;
    const maxZ = feetPos.z + radius;

    const sphereCenters = [
      new Vec3(feetPos.x, feetPos.y + radius, feetPos.z),
      new Vec3(feetPos.x, feetPos.y + height * 0.5, feetPos.z),
      new Vec3(feetPos.x, feetPos.y + Math.max(radius, height - radius), feetPos.z),
    ];
    const tmpNormal = new Vec3();

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];
      if (
        maxX < col.aabbMin.x || minX > col.aabbMax.x ||
        maxY < col.aabbMin.y || minY > col.aabbMax.y ||
        maxZ < col.aabbMin.z || minZ > col.aabbMax.z
      ) {
        continue;
      }
      for (let s = 0; s < sphereCenters.length; s++) {
        const res = this._testSphereOBB(sphereCenters[s], radius - 0.01, col, tmpNormal);
        if (res.hit && res.depth > 0.002) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Checks if a crouching/sliding player at `feetPos` has overhead clearance to stand up to `standingHeight`.
   */
  canStandUp(feetPos, radius, standingHeight) {
    const topSphere = new Vec3(feetPos.x, feetPos.y + standingHeight - radius, feetPos.z);
    const tmpNormal = new Vec3();
    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];
      if (
        topSphere.x + radius < col.aabbMin.x || topSphere.x - radius > col.aabbMax.x ||
        topSphere.y + radius < col.aabbMin.y || topSphere.y - radius > col.aabbMax.y ||
        topSphere.z + radius < col.aabbMin.z || topSphere.z - radius > col.aabbMax.z
      ) {
        continue;
      }
      const res = this._testSphereOBB(topSphere, radius - 0.02, col, tmpNormal);
      if (res.hit && res.depth > 0.005) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolves capsule movement over timestep `dt` with multi-pass Collide-and-Slide,
   * Automatic Stair-Stepping, Slope Normal extraction, and Jump Pad triggers.
   *
   * @param {Vec3} feetPos Mutated in place
   * @param {Vec3} velocity Mutated in place
   * @param {number} radius Capsule radius
   * @param {number} height Capsule total height
   * @param {number} stepHeight Max stair step-up height
   * @param {boolean} wasGrounded Whether player was grounded on previous tick
   * @param {number} dt Timestep seconds
   */
  moveAndSlideCapsule(feetPos, velocity, radius, height, stepHeight, wasGrounded, dt) {
    // Sub-step if moving at extreme velocity to prevent tunneling
    const speed = velocity.length();
    const maxStepDisp = radius * 0.65;
    const numSubsteps = Math.max(1, Math.min(4, Math.ceil((speed * dt) / maxStepDisp)));
    const subDt = dt / numSubsteps;

    let grounded = false;
    const groundNormal = new Vec3(0, 1, 0);
    let hitWall = false;
    const wallNormal = new Vec3(0, 0, 0);
    let hitCeiling = false;
    let triggeredJumpPad = null;

    const contactNormal = new Vec3();
    const sphereOffsets = [
      radius,
      height * 0.5,
      Math.max(radius, height - radius),
    ];

    for (let step = 0; step < numSubsteps; step++) {
      feetPos.x += velocity.x * subDt;
      feetPos.y += velocity.y * subDt;
      feetPos.z += velocity.z * subDt;

      // Iterative penetration solver (4 iterations)
      for (let iter = 0; iter < 4; iter++) {
        const minX = feetPos.x - radius - 0.1;
        const maxX = feetPos.x + radius + 0.1;
        const minY = feetPos.y - 0.1;
        const maxY = feetPos.y + height + 0.1;
        const minZ = feetPos.z - radius - 0.1;
        const maxZ = feetPos.z + radius + 0.1;

        for (let i = 0; i < this.colliders.length; i++) {
          const col = this.colliders[i];
          if (
            maxX < col.aabbMin.x || minX > col.aabbMax.x ||
            maxY < col.aabbMin.y || minY > col.aabbMax.y ||
            maxZ < col.aabbMin.z || minZ > col.aabbMax.z
          ) {
            continue;
          }

          // Sample bottom, middle, and top spheres of the capsule
          for (let s = 0; s < 3; s++) {
            const sphereCenter = new Vec3(feetPos.x, feetPos.y + sphereOffsets[s], feetPos.z);
            const hit = this._testSphereOBB(sphereCenter, radius, col, contactNormal);
            if (!hit.hit || hit.depth <= 1e-5) continue;

            // Check if this is a low step/ledge we can automatically step up onto
            if (
              s === 0 &&
              Math.abs(contactNormal.y) < 0.35 &&
              (wasGrounded || grounded) &&
              velocity.y <= 2.5
            ) {
              const colTopY = col.aabbMax.y;
              const stepDelta = colTopY - feetPos.y;
              if (stepDelta > 0.02 && stepDelta <= stepHeight) {
                const candidatePos = new Vec3(feetPos.x, colTopY + 0.01, feetPos.z);
                if (!this.checkCapsuleOverlap(candidatePos, radius, height)) {
                  feetPos.y = colTopY + 0.005;
                  grounded = true;
                  groundNormal.set(0, 1, 0);
                  if (velocity.y < 0) velocity.y = 0;
                  break;
                }
              }
            }

            // Push capsule out along contact normal
            feetPos.addScaled(contactNormal, hit.depth);

            // Classify surface by normal Y component
            if (contactNormal.y >= 0.65) {
              // Walkable ground or slope (up to ~49 degrees)
              grounded = true;
              groundNormal.copy(contactNormal);

              // Cancel downward velocity into the floor/slope without robbing horizontal bhop speed
              if (velocity.y < 0) {
                const vn = velocity.dot(contactNormal);
                if (vn < 0) {
                  // On flat ground, only zero Y; on slopes, project cleanly along the plane
                  if (contactNormal.y > 0.98) {
                    velocity.y = 0;
                  } else {
                    velocity.addScaled(contactNormal, -vn);
                  }
                }
              }
            } else if (contactNormal.y <= -0.65) {
              // Ceiling bonk
              hitCeiling = true;
              const vn = velocity.dot(contactNormal);
              if (vn < 0) {
                velocity.addScaled(contactNormal, -vn);
              }
            } else {
              // Vertical Wall
              hitWall = true;
              wallNormal.copy(contactNormal);
              const vn = velocity.dot(contactNormal);
              if (vn < 0) {
                velocity.addScaled(contactNormal, -vn);
              }
            }
          }
        }
      }
    }

    // Ground Probe & Downhill Slope Snapping (keeps player glued to ramps when running/sliding downhill)
    if (!grounded && velocity.y <= 0.5) {
      const probeDist = wasGrounded ? 0.32 : 0.08;
      const probeOrigin = new Vec3(feetPos.x, feetPos.y + radius, feetPos.z);
      const downHit = this.raycast(probeOrigin, new Vec3(0, -1, 0), radius + probeDist);
      if (downHit.hit && downHit.normal.y >= 0.65) {
        const targetY = downHit.point.y;
        if (feetPos.y - targetY <= probeDist && feetPos.y >= targetY - 0.05) {
          feetPos.y = targetY;
          grounded = true;
          groundNormal.copy(downHit.normal);
          if (velocity.y < 0) velocity.y = 0;
        }
      }
    }

    // Check Jump Pads (Sanguine Geysers)
    for (let i = 0; i < this.jumpPads.length; i++) {
      const pad = this.jumpPads[i];
      if (
        feetPos.x + radius >= pad.aabbMin.x && feetPos.x - radius <= pad.aabbMax.x &&
        feetPos.y <= pad.aabbMax.y + 0.35 && feetPos.y + height >= pad.aabbMin.y &&
        feetPos.z + radius >= pad.aabbMin.z && feetPos.z - radius <= pad.aabbMax.z
      ) {
        triggeredJumpPad = pad;
        break;
      }
    }

    return {
      grounded,
      groundNormal,
      hitWall,
      wallNormal,
      hitCeiling,
      triggeredJumpPad,
    };
  }
}
