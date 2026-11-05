#!/usr/bin/env python3
"""
Builds real retro DUSK / Quake / Blood style assets for SANGUINE_RUNNER (Godot 4.x):
1. Crisp 64x64 and 128x128 pixel-art PNG textures (Nearest-neighbor aesthetic).
2. Articulated Quake-style low-poly 3D .obj models with UVs & normals for enemies, weapons, and gothic architecture.
3. Layered procedural boomer-shooter .wav sound effects.
"""

import math
import os
import random
import struct
import wave
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "assets", "textures")
MOD_DIR = os.path.join(ROOT, "assets", "models")
AUD_DIR = os.path.join(ROOT, "assets", "audio")

os.makedirs(TEX_DIR, exist_ok=True)
os.makedirs(MOD_DIR, exist_ok=True)
os.makedirs(AUD_DIR, exist_ok=True)


# ============================================================================
# 1. PURE-PYTHON PNG WRITER (64x64 / 128x128 RGBA PIXEL ART)
# ============================================================================
def write_png(filepath, width, height, pixels_rgba):
    """Writes an uncompressed/zlib RGBA PNG file from a flat or 2D list of (r,g,b,a)."""
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter type 0 (None)
        row = pixels_rgba[y]
        for x in range(width):
            r, g, b, a = row[x]
            raw_data.extend((
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
                max(0, min(255, int(a))),
            ))

    def make_chunk(chunk_type, data):
        chunk = struct.pack(">I", len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return chunk + struct.pack(">I", crc)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_data), 9)
    with open(filepath, "wb") as f:
        f.write(header)
        f.write(make_chunk(b"IHDR", ihdr))
        f.write(make_chunk(b"IDAT", idat))
        f.write(make_chunk(b"IEND", b""))


def hash2d(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFF) / 255.0


def build_textures():
    print("Generating 64x64 & 128x128 DUSK/Quake pixel-art textures...")

    # 1. gothic_brick.png (128x128): Weathered catacomb brick wall with damp moss & blood stains
    w, h = 128, 128
    grid = [[(0, 0, 0, 255) for _ in range(w)] for _ in range(h)]
    brick_h = 16
    brick_w = 32
    for y in range(h):
        row_idx = y // brick_h
        offset = (brick_w // 2) if (row_idx % 2 == 1) else 0
        local_y = y % brick_h
        for x in range(w):
            local_x = (x + offset) % brick_w
            n = hash2d(x, y, 11)
            coarse = hash2d(x // 2, y // 2, 23)
            brick_seed = hash2d((x + offset) // brick_w, row_idx, 99)
            # Mortar lines
            is_mortar = (local_y <= 1) or (local_x <= 1)
            if is_mortar:
                base = 16 + int(n * 10)
                grid[y][x] = (base, base - 2, base + 2, 255)
            else:
                shade = 34 + int((brick_seed - 0.5) * 16 + (coarse - 0.5) * 18 + (n - 0.5) * 10)
                # Edge bevel
                if local_y == 2 or local_x == 2:
                    shade += 10
                elif local_y == brick_h - 1 or local_x == brick_w - 1:
                    shade -= 10
                r, g, b = shade + 4, shade, shade + 6
                # Damp catacomb moss near bottom of bricks
                if local_y > brick_h - 4 and coarse > 0.62:
                    g += 12
                    r -= 6
                # Subtle dark blood drip on select bricks
                if brick_seed > 0.86 and 10 < local_x < 22 and local_y < 12:
                    r = min(255, r + 48)
                    g = max(8, g - 12)
                    b = max(8, b - 14)
                grid[y][x] = (r, g, b, 255)
    write_png(os.path.join(TEX_DIR, "gothic_brick.png"), w, h, grid)

    # 2. wet_stone_floor.png (128x128): Catacomb flagstones with wet puddles & blood grime
    grid = [[(0, 0, 0, 255) for _ in range(w)] for _ in range(h)]
    tile = 32
    for y in range(h):
        for x in range(w):
            tx, ty = x % tile, y % tile
            cell_seed = hash2d(x // tile, y // tile, 41)
            n = hash2d(x, y, 42)
            coarse = hash2d(x // 3, y // 3, 43)
            if tx <= 1 or ty <= 1:
                v = 12 + int(n * 8)
                grid[y][x] = (v, v, v + 3, 255)
            else:
                v = 28 + int((cell_seed - 0.5) * 12 + (coarse - 0.5) * 16 + (n - 0.5) * 8)
                if tx == 2 or ty == 2:
                    v += 9
                if tx == tile - 1 or ty == tile - 1:
                    v -= 9
                r, g, b = v + 2, v + 2, v + 6
                # Wet dark sheen patches
                if coarse < 0.25:
                    r, g, b = int(r * 0.75), int(g * 0.78), int(b * 0.92)
                # Dried arterial stain
                if cell_seed < 0.18 and ((tx - 16) ** 2 + (ty - 16) ** 2) < 85:
                    r += 35
                    g -= 8
                    b -= 10
                grid[y][x] = (r, g, b, 255)
    write_png(os.path.join(TEX_DIR, "wet_stone_floor.png"), w, h, grid)

    # 3. rotten_wood.png (64x64): Rotten dark wood planks with iron rivets
    w64, h64 = 64, 64
    grid64 = [[(0, 0, 0, 255) for _ in range(w64)] for _ in range(h64)]
    for y in range(h64):
        plank = y // 16
        ly = y % 16
        for x in range(w64):
            grain = hash2d(x // 4, y, 71)
            fine = hash2d(x, y, 72)
            if ly == 0 or x == 0:
                grid64[y][x] = (14, 10, 8, 255)
            else:
                base = 42 + int((grain - 0.5) * 20 + (fine - 0.5) * 10) + (plank % 2) * 5
                r = base + 14
                g = int(base * 0.72)
                b = int(base * 0.48)
                # Iron nails at plank ends
                if x in (4, 59) and ly in (4, 11):
                    r, g, b = 75, 78, 84
                grid64[y][x] = (r, g, b, 255)
    write_png(os.path.join(TEX_DIR, "rotten_wood.png"), w64, h64, grid64)

    # 4. gothic_arch_stone.png (64x64): Carved pillar & rib vault stone with bone trim
    grid64 = [[(0, 0, 0, 255) for _ in range(w64)] for _ in range(h64)]
    for y in range(h64):
        for x in range(w64):
            n = hash2d(x, y, 105)
            flute = math.sin((x / 64.0) * math.pi * 8.0)
            v = 46 + int(flute * 14 + (n - 0.5) * 12)
            if y % 32 in (0, 1):
                v -= 18
            elif y % 32 == 2:
                v += 12
            grid64[y][x] = (v + 5, v + 3, v, 255)
    write_png(os.path.join(TEX_DIR, "gothic_arch_stone.png"), w64, h64, grid64)

    # 5. Entity & Weapon 4-Quadrant UV Atlas Helper (64x64)
    # Quadrant TL (0..31, 0..31): Primary body/flesh/robe
    # Quadrant TR (32..63, 0..31): Secondary bone/skull/trim/steel
    # Quadrant BL (0..31, 32..63): Dark iron/shadow/boots/wood
    # Quadrant BR (32..63, 32..63): Glowing crimson eyes/runes/blood edge
    def make_atlas(filename, q_tl, q_tr, q_bl, q_br, seed):
        atlas = [[(0, 0, 0, 255) for _ in range(64)] for _ in range(64)]
        for y in range(64):
            for x in range(64):
                n = hash2d(x, y, seed)
                coarse = hash2d(x // 2, y // 2, seed + 7)
                if x < 32 and y < 32:
                    base = q_tl
                elif x >= 32 and y < 32:
                    base = q_tr
                elif x < 32 and y >= 32:
                    base = q_bl
                else:
                    base = q_br
                delta = int((coarse - 0.5) * 28 + (n - 0.5) * 18)
                # Add pixel grid micro-detail (band/rib pattern in TR, rune glow in BR)
                if x >= 32 and y < 32 and (y % 4 == 0):
                    delta -= 22
                if x >= 32 and y >= 32 and ((x + y) % 5 == 0):
                    delta += 35
                atlas[y][x] = (
                    base[0] + delta,
                    base[1] + delta,
                    base[2] + delta,
                    255,
                )
        write_png(os.path.join(TEX_DIR, filename), 64, 64, atlas)

    # Ghoul: Necrotic grey-green flesh, dirty bone ribs/skull, bloodied claws, glowing crimson eyes
    make_atlas(
        "ghoul_tex.png",
        q_tl=(76, 86, 68),
        q_tr=(168, 156, 132),
        q_bl=(48, 22, 24),
        q_br=(230, 18, 24),
        seed=201,
    )
    # Cultist: Deep crimson robe, occult gold/bone trim, abyssal hood shadow, hellfire orb glow
    make_atlas(
        "cultist_tex.png",
        q_tl=(118, 16, 28),
        q_tr=(205, 168, 72),
        q_bl=(22, 18, 26),
        q_br=(255, 78, 18),
        seed=301,
    )
    # Nightstalker: Chitinous dark violet-hide, bone horns, dark claws, crimson dorsal spines
    make_atlas(
        "stalker_tex.png",
        q_tl=(52, 34, 68),
        q_tr=(155, 145, 130),
        q_bl=(25, 20, 32),
        q_br=(235, 15, 45),
        seed=401,
    )
    # Inquisitor / Executioner: Riveted dark steel, brass cross trim, dark leather, crimson tabard
    make_atlas(
        "inquisitor_tex.png",
        q_tl=(74, 78, 88),
        q_tr=(198, 160, 68),
        q_bl=(32, 30, 36),
        q_br=(190, 18, 26),
        seed=501,
    )
    # Weapons Atlas: Gunmetal/Obsidian (TL), Polished Silver Blade (TR), Dark Wood Grip (BL), Arterial Rune/Brass (BR)
    make_atlas(
        "weapon_atlas.png",
        q_tl=(44, 46, 54),
        q_tr=(205, 212, 222),
        q_bl=(72, 42, 26),
        q_br=(230, 22, 32),
        seed=601,
    )


# ============================================================================
# 2. SCULPTED QUAKE / DUSK STYLE LOW-POLY .OBJ BUILDER
# ============================================================================
class ObjMeshBuilder:
    """Builds multi-part articulated low-poly 3D meshes with UV mapping and normals."""

    UV_QUAD = {
        "TL": (0.05, 0.05, 0.45, 0.45),  # Primary body / gunmetal
        "TR": (0.55, 0.05, 0.95, 0.45),  # Bone / silver steel / trim
        "BL": (0.05, 0.55, 0.45, 0.95),  # Dark wood / shadow / boots
        "BR": (0.55, 0.55, 0.95, 0.95),  # Crimson glow / runes / blood edge
        "FULL": (0.0, 0.0, 1.0, 1.0),
    }

    def __init__(self):
        self.verts = []
        self.uvs = []
        self.norms = []
        self.faces = []  # tuples of ((v1,vt1,vn1), (v2,vt2,vn2), (v3,vt3,vn3))

    def _add_quad(self, p0, p1, p2, p3, uv_region="TL"):
        u0, v0, u1, v1 = self.UV_QUAD[uv_region]
        # Compute face normal
        ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        vx, vy, vz = p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        n = (nx / length, ny / length, nz / length)

        base_v = len(self.verts) + 1
        self.verts.extend([p0, p1, p2, p3])
        base_vt = len(self.uvs) + 1
        self.uvs.extend([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
        base_vn = len(self.norms) + 1
        self.norms.append(n)

        # Two triangles (CCW winding)
        self.faces.append((
            (base_v, base_vt, base_vn),
            (base_v + 1, base_vt + 1, base_vn),
            (base_v + 2, base_vt + 2, base_vn),
        ))
        self.faces.append((
            (base_v, base_vt, base_vn),
            (base_v + 2, base_vt + 2, base_vn),
            (base_v + 3, base_vt + 3, base_vn),
        ))

    def add_tapered_limb(
        self,
        p_start,
        p_end,
        r_start_x,
        r_start_z,
        r_end_x,
        r_end_z,
        sides=6,
        uv_region="TL",
        cap_ends=True,
    ):
        """Creates an oriented, tapered polygonal limb/segment between two 3D points."""
        dx = p_end[0] - p_start[0]
        dy = p_end[1] - p_start[1]
        dz = p_end[2] - p_start[2]
        length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        up = (dx / length, dy / length, dz / length)

        # Pick orthogonal basis vectors (right, forward)
        ref = (0.0, 0.0, 1.0) if abs(up[1]) > 0.9 else (0.0, 1.0, 0.0)
        rx = up[1] * ref[2] - up[2] * ref[1]
        ry = up[2] * ref[0] - up[0] * ref[2]
        rz = up[0] * ref[1] - up[1] * ref[0]
        rl = math.sqrt(rx * rx + ry * ry + rz * rz) or 1.0
        right = (rx / rl, ry / rl, rz / rl)
        fx = right[1] * up[2] - right[2] * up[1]
        fy = right[2] * up[0] - right[0] * up[2]
        fz = right[0] * up[1] - right[1] * up[0]
        fwd = (fx, fy, fz)

        ring0 = []
        ring1 = []
        for i in range(sides):
            ang = (2.0 * math.pi * i) / sides
            ca, sa = math.cos(ang), math.sin(ang)
            ox0 = right[0] * ca * r_start_x + fwd[0] * sa * r_start_z
            oy0 = right[1] * ca * r_start_x + fwd[1] * sa * r_start_z
            oz0 = right[2] * ca * r_start_x + fwd[2] * sa * r_start_z
            ring0.append((p_start[0] + ox0, p_start[1] + oy0, p_start[2] + oz0))

            ox1 = right[0] * ca * r_end_x + fwd[0] * sa * r_end_z
            oy1 = right[1] * ca * r_end_x + fwd[1] * sa * r_end_z
            oz1 = right[2] * ca * r_end_x + fwd[2] * sa * r_end_z
            ring1.append((p_end[0] + ox1, p_end[1] + oy1, p_end[2] + oz1))

        for i in range(sides):
            ni = (i + 1) % sides
            self._add_quad(ring0[i], ring0[ni], ring1[ni], ring1[i], uv_region)

        if cap_ends and sides >= 4:
            for i in range(1, sides - 1):
                self._add_quad(ring1[0], ring1[i], ring1[i + 1], ring1[i + 1], uv_region)
                self._add_quad(ring0[0], ring0[i + 1], ring0[i], ring0[i], uv_region)

    def add_box(self, center, size, uv_region="TL"):
        cx, cy, cz = center
        hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
        self.add_tapered_limb(
            (cx, cy - hy, cz),
            (cx, cy + hy, cz),
            hx,
            hz,
            hx,
            hz,
            sides=4,
            uv_region=uv_region,
        )

    def save(self, filepath):
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("# SANGUINE_RUNNER Retro Quake/DUSK Low-Poly Model\n")
            for v in self.verts:
                f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
            for vt in self.uvs:
                f.write(f"vt {vt[0]:.4f} {vt[1]:.4f}\n")
            for vn in self.norms:
                f.write(f"vn {vn[0]:.4f} {vn[1]:.4f} {vn[2]:.4f}\n")
            for f_tri in self.faces:
                s0 = f"{f_tri[0][0]}/{f_tri[0][1]}/{f_tri[0][2]}"
                s1 = f"{f_tri[1][0]}/{f_tri[1][1]}/{f_tri[1][2]}"
                s2 = f"{f_tri[2][0]}/{f_tri[2][1]}/{f_tri[2][2]}"
                f.write(f"f {s0} {s1} {s2}\n")


def build_models():
    print("Building sculpted Quake/DUSK low-poly 3D .obj models...")

    # 1. CATACOMB GHOUL (ghoul.obj): Hunched zombie with exposed ribs, skull head, & long claws
    m = ObjMeshBuilder()
    # Pelvis & hunched ribcage
    m.add_tapered_limb((0, 0.72, 0.0), (0, 1.15, -0.08), 0.20, 0.14, 0.28, 0.20, sides=6, uv_region="TL")
    m.add_tapered_limb((0, 1.15, -0.08), (0, 1.48, -0.18), 0.28, 0.20, 0.22, 0.16, sides=6, uv_region="TR")  # Exposed ribs
    # Hunched neck & skull head jutting forward (-Z is forward in Godot)
    m.add_tapered_limb((0, 1.45, -0.18), (0, 1.68, -0.28), 0.14, 0.14, 0.16, 0.19, sides=6, uv_region="TR")
    # Glowing crimson eye visor bar
    m.add_box((0, 1.60, -0.42), (0.18, 0.05, 0.06), uv_region="BR")
    # Shambling bent legs (Left & Right)
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.15, 0.75, 0.0), (sx * 0.18, 0.38, -0.10), 0.11, 0.11, 0.08, 0.08, sides=5, uv_region="TL")
        m.add_tapered_limb((sx * 0.18, 0.38, -0.10), (sx * 0.16, 0.02, 0.04), 0.08, 0.08, 0.09, 0.13, sides=5, uv_region="BL")
    # Reaching clawed arms (Left & Right)
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.28, 1.42, -0.14), (sx * 0.36, 1.12, -0.38), 0.09, 0.09, 0.07, 0.07, sides=5, uv_region="TL")
        m.add_tapered_limb((sx * 0.36, 1.12, -0.38), (sx * 0.28, 0.88, -0.62), 0.07, 0.07, 0.05, 0.08, sides=5, uv_region="BL")
        # 2 long bloodied claws per hand
        m.add_tapered_limb((sx * 0.26, 0.88, -0.62), (sx * 0.22, 0.78, -0.78), 0.02, 0.02, 0.005, 0.005, sides=4, uv_region="BR")
        m.add_tapered_limb((sx * 0.31, 0.88, -0.62), (sx * 0.30, 0.78, -0.78), 0.02, 0.02, 0.005, 0.005, sides=4, uv_region="BR")
    m.save(os.path.join(MOD_DIR, "ghoul.obj"))

    # 2. BLOOD CULTIST (cultist.obj): Hooded robed occultist with ritual skull staff & blood-fire orb
    m = ObjMeshBuilder()
    # Flared crimson robe skirt & torso
    m.add_tapered_limb((0, 0.02, 0), (0, 0.85, 0), 0.42, 0.36, 0.24, 0.20, sides=8, uv_region="TL")
    m.add_tapered_limb((0, 0.85, 0), (0, 1.48, 0), 0.25, 0.20, 0.32, 0.24, sides=8, uv_region="TL")
    # Occult gold stole / collar
    m.add_tapered_limb((0, 1.38, 0), (0, 1.50, -0.02), 0.33, 0.25, 0.26, 0.22, sides=6, uv_region="TR")
    # Pointed Gothic Hood / Cowl
    m.add_tapered_limb((0, 1.48, 0), (0, 1.78, -0.04), 0.20, 0.22, 0.14, 0.18, sides=6, uv_region="TL")
    m.add_tapered_limb((0, 1.78, -0.04), (0, 1.98, 0.10), 0.14, 0.18, 0.02, 0.03, sides=5, uv_region="TL")
    # Shadowed face recess + glowing orange/crimson eyes
    m.add_box((0, 1.62, -0.16), (0.18, 0.16, 0.08), uv_region="BL")
    m.add_box((0, 1.64, -0.21), (0.14, 0.04, 0.04), uv_region="BR")
    # Draped Bell Sleeves
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.28, 1.40, 0.0), (sx * 0.38, 1.05, -0.35), 0.10, 0.10, 0.16, 0.18, sides=6, uv_region="TL")
    # Ritual Skull Staff in right hand (-X/+X)
    m.add_tapered_limb((0.38, 0.10, -0.38), (0.38, 1.85, -0.38), 0.03, 0.03, 0.035, 0.035, sides=5, uv_region="BL")
    m.add_tapered_limb((0.38, 1.85, -0.38), (0.38, 2.08, -0.38), 0.10, 0.10, 0.06, 0.06, sides=6, uv_region="BR")
    m.save(os.path.join(MOD_DIR, "cultist.obj"))

    # 3. CRYPT NIGHTSTALKER (stalker.obj): Quadrupedal horned wall-leaping beast
    m = ObjMeshBuilder()
    # Low predatory spine & haunches
    m.add_tapered_limb((0, 0.58, 0.45), (0, 0.72, -0.35), 0.22, 0.22, 0.28, 0.26, sides=6, uv_region="TL")
    # Dorsal crimson spikes
    for z_off in (-0.25, 0.0, 0.25):
        m.add_tapered_limb((0, 0.78, z_off), (0, 1.06, z_off + 0.08), 0.05, 0.08, 0.01, 0.01, sides=4, uv_region="BR")
    # Elongated skull & twin curved horns
    m.add_tapered_limb((0, 0.72, -0.35), (0, 0.68, -0.82), 0.18, 0.16, 0.08, 0.10, sides=6, uv_region="TR")
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.12, 0.80, -0.45), (sx * 0.26, 1.05, -0.20), 0.05, 0.05, 0.01, 0.01, sides=4, uv_region="TR")
        # Front & Rear splayed leaping limbs
        m.add_tapered_limb((sx * 0.24, 0.65, -0.28), (sx * 0.42, 0.35, -0.45), 0.09, 0.09, 0.06, 0.06, sides=5, uv_region="TL")
        m.add_tapered_limb((sx * 0.42, 0.35, -0.45), (sx * 0.36, 0.02, -0.62), 0.06, 0.06, 0.07, 0.10, sides=5, uv_region="BR")
        m.add_tapered_limb((sx * 0.22, 0.58, 0.35), (sx * 0.38, 0.32, 0.52), 0.10, 0.10, 0.07, 0.07, sides=5, uv_region="TL")
        m.add_tapered_limb((sx * 0.38, 0.32, 0.52), (sx * 0.32, 0.02, 0.38), 0.07, 0.07, 0.07, 0.10, sides=5, uv_region="BL")
    m.save(os.path.join(MOD_DIR, "stalker.obj"))

    # 4. IRON INQUISITOR (inquisitor.obj): Heavy armored knight with Tower Shield & Mace
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, 0.78, 0), (0, 1.56, 0), 0.28, 0.22, 0.38, 0.26, sides=6, uv_region="TL")
    m.add_tapered_limb((0, 1.56, 0), (0, 1.88, 0), 0.17, 0.17, 0.16, 0.16, sides=6, uv_region="TL")
    m.add_box((0, 1.72, -0.17), (0.20, 0.05, 0.04), uv_region="BR")  # Glowing visor
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.18, 0.78, 0), (sx * 0.18, 0.02, 0), 0.13, 0.13, 0.11, 0.14, sides=6, uv_region="BL")
        m.add_tapered_limb((sx * 0.38, 1.48, 0), (sx * 0.44, 0.95, -0.32), 0.12, 0.12, 0.10, 0.10, sides=6, uv_region="TL")
    # Tower Shield on Left Arm (-X)
    m.add_box((-0.38, 1.05, -0.46), (0.58, 1.25, 0.10), uv_region="TL")
    m.add_box((-0.38, 1.05, -0.52), (0.12, 0.95, 0.04), uv_region="TR")  # Brass cross vertical
    m.add_box((-0.38, 1.22, -0.52), (0.42, 0.12, 0.04), uv_region="TR")  # Brass cross horizontal
    # Flanged War-Mace on Right Arm (+X)
    m.add_tapered_limb((0.44, 0.75, -0.35), (0.44, 1.65, -0.55), 0.035, 0.035, 0.04, 0.04, sides=5, uv_region="BL")
    m.add_tapered_limb((0.44, 1.50, -0.52), (0.44, 1.78, -0.58), 0.14, 0.14, 0.14, 0.14, sides=6, uv_region="TR")
    m.save(os.path.join(MOD_DIR, "inquisitor.obj"))

    # 5. CATHEDRAL EXECUTIONER (executioner.obj): Towering boss with horned helm & Great-Axe
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, 0.95, 0), (0, 1.95, 0), 0.36, 0.28, 0.52, 0.36, sides=8, uv_region="TL")
    m.add_tapered_limb((0, 0.05, 0), (0, 0.98, 0), 0.44, 0.34, 0.36, 0.28, sides=8, uv_region="BR")  # Crimson executioner tabard
    m.add_tapered_limb((0, 1.95, 0), (0, 2.35, 0), 0.20, 0.20, 0.16, 0.16, sides=6, uv_region="BL")
    for sx in (-1, 1):
        m.add_tapered_limb((sx * 0.16, 2.25, 0), (sx * 0.42, 2.65, -0.10), 0.08, 0.08, 0.015, 0.015, sides=5, uv_region="TR")
        m.add_tapered_limb((sx * 0.50, 1.85, 0), (sx * 0.56, 1.15, -0.45), 0.16, 0.16, 0.13, 0.13, sides=6, uv_region="TL")
    # Massive Executioner Greataxe
    m.add_tapered_limb((0.35, 0.25, -0.48), (0.35, 2.45, -0.48), 0.045, 0.045, 0.045, 0.045, sides=6, uv_region="BL")
    m.add_box((0.35, 2.05, -0.72), (0.08, 0.68, 0.55), uv_region="TR")
    m.add_box((0.35, 2.05, -0.96), (0.04, 0.72, 0.12), uv_region="BR")
    m.save(os.path.join(MOD_DIR, "executioner.obj"))

    # ========================================================================
    # WEAPON VIEWMODEL 3D MESHES (Oriented along -Z forward)
    # ========================================================================
    # 6. ALUCARD SWORD (alucard_sword.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, -0.22, 0.18), (0, -0.02, 0.02), 0.024, 0.020, 0.024, 0.020, sides=6, uv_region="BL")  # Grip
    m.add_tapered_limb((0, -0.26, 0.21), (0, -0.21, 0.17), 0.038, 0.038, 0.025, 0.025, sides=6, uv_region="BR")  # Crimson pommel
    m.add_tapered_limb((-0.18, -0.01, 0.01), (0.18, 0.01, -0.01), 0.022, 0.028, 0.022, 0.028, sides=6, uv_region="BR")  # Swept guard
    m.add_tapered_limb((0, 0.0, 0.0), (0, 0.45, -0.78), 0.014, 0.042, 0.008, 0.028, sides=4, uv_region="TR")  # Silver blade
    m.add_tapered_limb((0, 0.45, -0.78), (0, 0.62, -1.05), 0.008, 0.028, 0.001, 0.002, sides=4, uv_region="BR")  # Razor tip
    m.save(os.path.join(MOD_DIR, "alucard_sword.obj"))

    # 7. OCCULT SCYTHE (occult_scythe.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0.08, -0.35, 0.30), (-0.04, 0.38, -0.92), 0.024, 0.024, 0.028, 0.028, sides=6, uv_region="BL")  # Polearm shaft
    m.add_tapered_limb((-0.04, 0.34, -0.88), (-0.04, 0.44, -0.96), 0.055, 0.055, 0.050, 0.050, sides=6, uv_region="TL")  # Skull collar
    # Curved crescent grim-reaper blade sweeping left
    m.add_tapered_limb((-0.04, 0.39, -0.92), (-0.48, 0.34, -1.08), 0.018, 0.065, 0.012, 0.052, sides=4, uv_region="TR")
    m.add_tapered_limb((-0.48, 0.34, -1.08), (-0.88, 0.20, -0.92), 0.012, 0.052, 0.002, 0.004, sides=4, uv_region="BR")  # Sweet-spot tip
    m.save(os.path.join(MOD_DIR, "occult_scythe.obj"))

    # 8. STAKE & HAMMER (stake_hammer.obj)
    m = ObjMeshBuilder()
    # Left-hand Vampireslayer Stake
    m.add_tapered_limb((-0.26, -0.16, 0.10), (-0.22, 0.08, -0.58), 0.038, 0.038, 0.003, 0.003, sides=6, uv_region="BL")
    m.add_tapered_limb((-0.23, 0.02, -0.40), (-0.22, 0.08, -0.58), 0.020, 0.020, 0.002, 0.002, sides=6, uv_region="BR")
    # Right-hand Heavy Gothic Sledgehammer
    m.add_tapered_limb((0.18, -0.28, 0.12), (0.14, 0.16, -0.42), 0.024, 0.024, 0.026, 0.026, sides=6, uv_region="BL")
    m.add_tapered_limb((0.14, 0.16, -0.30), (0.14, 0.16, -0.58), 0.085, 0.085, 0.095, 0.095, sides=6, uv_region="TL")
    m.save(os.path.join(MOD_DIR, "stake_hammer.obj"))

    # 9. JACKAL & CASULL DUAL PISTOLS (jackal_casull.obj)
    m = ObjMeshBuilder()
    for sx, slide_uv in ((-0.22, "TL"), (0.22, "TR")):
        m.add_box((sx, -0.02, -0.36), (0.055, 0.085, 0.46), uv_region=slide_uv)  # Long Hellsing slide
        m.add_box((sx, -0.13, -0.16), (0.048, 0.16, 0.09), uv_region="BL")  # Grip
        m.add_box((sx, 0.02, -0.42), (0.025, 0.020, 0.28), uv_region="BR")  # Crimson sight rib
    m.save(os.path.join(MOD_DIR, "jackal_casull.obj"))

    # 10. TRENCH SHOTGUN (trench_shotgun.obj)
    m = ObjMeshBuilder()
    m.add_box((0.0, -0.08, -0.05), (0.08, 0.12, 0.36), uv_region="BL")  # Wooden stock & receiver
    m.add_tapered_limb((-0.032, -0.02, -0.18), (-0.032, -0.02, -0.78), 0.028, 0.028, 0.028, 0.028, sides=8, uv_region="TL")
    m.add_tapered_limb((0.032, -0.02, -0.18), (0.032, -0.02, -0.78), 0.028, 0.028, 0.028, 0.028, sides=8, uv_region="TL")
    m.add_tapered_limb((0.0, -0.06, -0.55), (0.0, -0.06, -0.96), 0.018, 0.018, 0.002, 0.002, sides=4, uv_region="TR")  # Bayonet
    m.save(os.path.join(MOD_DIR, "trench_shotgun.obj"))

    # 11. GOTHIC WALL TORCH SCONCE (wall_torch.obj)
    m = ObjMeshBuilder()
    m.add_box((0, 0, 0), (0.18, 0.32, 0.08), uv_region="TL")  # Wall bracket
    m.add_tapered_limb((0, -0.10, 0.04), (0, 0.42, -0.32), 0.035, 0.035, 0.065, 0.065, sides=6, uv_region="BL")
    m.add_tapered_limb((0, 0.38, -0.30), (0, 0.56, -0.35), 0.09, 0.09, 0.12, 0.12, sides=6, uv_region="BR")
    m.save(os.path.join(MOD_DIR, "wall_torch.obj"))

    # 12. VAMPIRIC HAND & LEATHER CUFF (vampiric_hand.obj)
    m = ObjMeshBuilder()
    # Forearm dark leather sleeve + crimson/gold vampiric cuff
    m.add_tapered_limb((0, -0.14, 0.28), (0, -0.04, 0.06), 0.058, 0.052, 0.048, 0.044, sides=6, uv_region="BL")
    m.add_tapered_limb((0, -0.06, 0.12), (0, -0.03, 0.05), 0.056, 0.052, 0.054, 0.050, sides=6, uv_region="BR")
    #Gloved palm & curled fingers
    m.add_box((0, -0.02, -0.01), (0.085, 0.048, 0.095), uv_region="TL")
    for fx in (-0.028, 0.0, 0.028):
        m.add_tapered_limb((fx, -0.01, -0.05), (fx, 0.025, -0.09), 0.014, 0.014, 0.010, 0.010, sides=4, uv_region="TR")
    m.save(os.path.join(MOD_DIR, "vampiric_hand.obj"))

    # 13. VAMPIRIC SLIDE/KICK BOOT (vampiric_boot.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, 0.32, 0.12), (0, 0.05, 0.0), 0.075, 0.075, 0.062, 0.068, sides=6, uv_region="BL")  # Shin greave
    m.add_box((0, 0.0, -0.12), (0.13, 0.10, 0.32), uv_region="TL")  # Boot sole & steel toe
    m.add_box((0, 0.02, -0.27), (0.11, 0.07, 0.06), uv_region="BR")  # Crimson-iron toe spikeplate
    m.save(os.path.join(MOD_DIR, "vampiric_boot.obj"))

    # 14. IMPALING VAMPIRE STAKE PROJECTILE (stake_projectile.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, 0, 0.28), (0, 0, -0.10), 0.034, 0.034, 0.028, 0.028, sides=6, uv_region="BL")
    m.add_tapered_limb((0, 0, 0.32), (0, 0, 0.27), 0.044, 0.044, 0.036, 0.036, sides=6, uv_region="TR")  # Iron striking cap
    m.add_tapered_limb((0, 0, -0.10), (0, 0, -0.46), 0.028, 0.028, 0.002, 0.002, sides=6, uv_region="BR")  # Bloodied sharp tip
    m.save(os.path.join(MOD_DIR, "stake_projectile.obj"))

    # 15. OCCULT WAR-HAMMER (war_hammer.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, -0.34, 0.16), (0, 0.24, -0.46), 0.026, 0.026, 0.030, 0.030, sides=6, uv_region="BL")
    m.add_tapered_limb((-0.16, 0.22, -0.44), (0.16, 0.22, -0.44), 0.095, 0.095, 0.095, 0.095, sides=8, uv_region="TL")
    m.add_box((0, 0.22, -0.44), (0.35, 0.06, 0.06), uv_region="BR")
    m.save(os.path.join(MOD_DIR, "war_hammer.obj"))

    # 16. GOTHIC BLOOD CHALICE PROP (blood_chalice.obj)
    m = ObjMeshBuilder()
    m.add_tapered_limb((0, 0.0, 0), (0, 0.22, 0), 0.36, 0.36, 0.20, 0.20, sides=8, uv_region="TL")
    m.add_tapered_limb((0, 0.22, 0), (0, 0.78, 0), 0.12, 0.12, 0.14, 0.14, sides=8, uv_region="TR")
    m.add_tapered_limb((0, 0.78, 0), (0, 1.22, 0), 0.16, 0.16, 0.44, 0.44, sides=8, uv_region="TR")
    m.add_tapered_limb((0, 1.15, 0), (0, 1.24, 0), 0.38, 0.38, 0.38, 0.38, sides=8, uv_region="BR")  # Glowing blood pool inside cup
    m.save(os.path.join(MOD_DIR, "blood_chalice.obj"))


# ============================================================================
# 3. LAYERED RETRO BOOMER-SHOOTER .WAV AUDIO GENERATOR
# ============================================================================
def write_wav(filename, duration, synth_fn, sample_rate=22050):
    n_samples = int(duration * sample_rate)
    buf = bytearray()
    for i in range(n_samples):
        t = i / sample_rate
        val = max(-1.0, min(1.0, synth_fn(t, duration)))
        buf.extend(struct.pack("<h", int(val * 32767)))
    with wave.open(os.path.join(AUD_DIR, filename), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(buf))


def build_audio():
    print("Synthesizing retro boomer-shooter .wav sound effects...")
    random.seed(1337)

    # 1. Sword Slash (metallic air whoosh + high steel ring)
    write_wav(
        "sword_slash.wav",
        0.22,
        lambda t, d: (
            (random.uniform(-1, 1) * math.exp(-t * 18.0) * 0.55)
            + math.sin(2 * math.pi * (520 - t * 1400) * t) * math.exp(-t * 14.0) * 0.45
        ),
    )
    # 2. Scythe Reap (deep heavy sub-whoosh + grim resonance)
    write_wav(
        "scythe_reap.wav",
        0.32,
        lambda t, d: (
            (random.uniform(-1, 1) * math.exp(-t * 11.0) * 0.50)
            + math.sin(2 * math.pi * (240 - t * 480) * t) * math.exp(-t * 9.0) * 0.55
        ),
    )
    # 3. Stake & Hammer Impact (heavy sub-bass punch + bone/armor crunch)
    write_wav(
        "stake_impact.wav",
        0.26,
        lambda t, d: (
            math.sin(2 * math.pi * (140 * math.exp(-t * 16.0) + 45) * t) * math.exp(-t * 10.0) * 0.75
            + random.uniform(-1, 1) * math.exp(-t * 24.0) * 0.45
        ),
    )
    # 4. Jackal & Casull Pistol Shot (boomer-shooter 13mm cannon bark)
    write_wav(
        "pistol_fire.wav",
        0.28,
        lambda t, d: (
            math.sin(2 * math.pi * (190 * math.exp(-t * 18.0) + 55) * t) * math.exp(-t * 12.0) * 0.70
            + random.uniform(-1, 1) * math.exp(-t * 16.0) * 0.55
        ),
    )
    # 5. Trench Shotgun Blast (massive low-end boom + pellet roar)
    write_wav(
        "shotgun_blast.wav",
        0.42,
        lambda t, d: (
            math.sin(2 * math.pi * (120 * math.exp(-t * 12.0) + 38) * t) * math.exp(-t * 8.0) * 0.80
            + random.uniform(-1, 1) * math.exp(-t * 10.0) * 0.65
        ),
    )
    # 6. Parry / Projectile Slice Clang
    write_wav(
        "parry_clang.wav",
        0.30,
        lambda t, d: (
            (math.sin(2 * math.pi * 1180 * t) + 0.6 * math.sin(2 * math.pi * 1760 * t))
            * math.exp(-t * 11.0)
            * 0.55
        ),
    )
    # 7. Flesh Gib Explosion
    write_wav(
        "flesh_gib.wav",
        0.25,
        lambda t, d: (
            math.sin(2 * math.pi * (95 - t * 200) * t) * math.exp(-t * 12.0) * 0.65
            + random.uniform(-1, 1) * math.exp(-t * 18.0) * 0.45
        ),
    )
    # 8. Vitae Blood Orb Pickup Chime
    write_wav(
        "orb_pickup.wav",
        0.16,
        lambda t, d: math.sin(2 * math.pi * (660 + t * 1200) * t) * math.exp(-t * 18.0) * 0.40,
    )
    # 9. Occult War-Hammer Expunge Detonation (earth-shattering sub drop + crimson blood burst)
    write_wav(
        "hammer_expunge.wav",
        0.48,
        lambda t, d: (
            math.sin(2 * math.pi * (160 * math.exp(-t * 10.0) + 34) * t) * math.exp(-t * 6.5) * 0.85
            + math.sin(2 * math.pi * 420 * t) * math.exp(-t * 14.0) * 0.35
            + random.uniform(-1, 1) * math.exp(-t * 11.0) * 0.55
        ),
    )
    # 10. Dark Gothic Catacomb Organ Ambient Loop (for Music Channel)
    write_wav(
        "dark_organ_drone.wav",
        4.0,
        lambda t, d: (
            0.22 * math.sin(2 * math.pi * 55.0 * t)
            + 0.16 * math.sin(2 * math.pi * 82.41 * t)
            + 0.12 * math.sin(2 * math.pi * 110.0 * t)
            + 0.08 * math.sin(2 * math.pi * 130.81 * t)
        ) * (0.85 + 0.15 * math.sin(2 * math.pi * 0.5 * t)),
    )


if __name__ == "__main__":
    build_textures()
    build_models()
    build_audio()
    print("All retro textures, 3D .obj models, and .wav audio generated successfully in assets/!")
