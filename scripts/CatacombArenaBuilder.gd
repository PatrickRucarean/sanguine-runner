extends Node3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")

## Handcrafted 3-Tier Gothic Blood Sanctuary & Parkour Playground (DUSK / Blood Aesthetic):
## - Tier 0 (y = -2.2m): Central Sacrificial Blood Pit with Functional Blood Fountain, Impaled Skull Pikes, and 4 exit ramps
## - Tier 1 (y =  0.0m): Main Crypt Nave, Vaulted Corridors, 12 Fluted Gothic Pillars, 4 Sanctuary Blood Fountains, and Long Continuous Wall-Run Monoliths
## - Tier 2 (y = +3.8m): Suspended Stone Balconies & Wooden Parkour Ramps/Stairs, Chained Hung Corpses with Pendulum Physics, and Wrought-Iron Grates

var torch_lights: Array[OmniLight3D] = []
var torch_flames: Array[MeshInstance3D] = []
var hung_corpses: Array[Dictionary] = []
var fountain_streams: Array[Dictionary] = []
var blood_pool_centers: Array[Vector3] = []
var spawn_points: Array[Vector3] = []
var _time: float = 0.0


func build_catacomb_arena(zone_index: int = 0) -> void:
	for child in get_children():
		child.queue_free()
	torch_lights.clear()
	torch_flames.clear()
	hung_corpses.clear()
	fountain_streams.clear()
	blood_pool_centers.clear()
	spawn_points.clear()

	_setup_gothic_environment(zone_index)

	var mat_floor: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/wet_stone_floor.png", Vector3(16, 16, 1)
	)
	var mat_pit: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/wet_stone_floor.png", Vector3(8, 8, 1), Color(0.88, 0.45, 0.48)
	)
	var mat_wall: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_brick.png", Vector3(14, 5, 1)
	)
	var mat_dusk_tile: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/dusk_tile_wall.png", Vector3(8, 4, 1)
	)
	var mat_arch: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_arch_stone.png", Vector3(2, 6, 2)
	)
	var mat_wood: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/rotten_wood.png", Vector3(6, 2, 2)
	)

	# ========================================================================
	# TIER 0: CENTRAL SACRIFICIAL BLOOD PIT (y = -2.2m, 22m x 22m sunken pit)
	# ========================================================================
	_add_static_box(Vector3(0, -2.7, 0), Vector3(22.0, 1.0, 22.0), Vector3.ZERO, mat_pit)
	# Central Functional Blood Fountain in the Sacrificial Pit
	_add_blood_fountain(Vector3(0, -2.2, 0), 1.35)

	# 4 Sloped Stone Ramps climbing out of the Sacrificial Pit (-2.2m -> 0.0m)
	_add_static_box(Vector3(0, -1.1, -8.2), Vector3(4.8, 0.5, 6.8), Vector3(20.0, 0, 0), mat_arch)
	_add_static_box(Vector3(0, -1.1, 8.2), Vector3(4.8, 0.5, 6.8), Vector3(-20.0, 0, 0), mat_arch)
	_add_static_box(Vector3(-8.2, -1.1, 0), Vector3(6.8, 0.5, 4.8), Vector3(0, 0, -20.0), mat_arch)
	_add_static_box(Vector3(8.2, -1.1, 0), Vector3(6.8, 0.5, 4.8), Vector3(0, 0, 20.0), mat_arch)

	# 4 Corner Blood Chalices & Impaled Skull Pikes around the Pit Rim (y = 0.0m)
	for cx in [-10.5, 10.5]:
		for cz in [-10.5, 10.5]:
			_add_static_box(Vector3(cx, -0.9, cz), Vector3(2.2, 2.6, 2.2), Vector3.ZERO, mat_arch)
			_add_blood_chalice(Vector3(cx, 0.4, cz))
			_add_impaled_skull_pike(Vector3(cx * 0.82, -2.2, cz * 0.82))

	# ========================================================================
	# TIER 1: MAIN CRYPT NAVE, VAULTED CORRIDORS & CONTINUOUS WALL-RUN WALLS
	# ========================================================================
	_add_static_box(Vector3(0, -0.5, -26.0), Vector3(84.0, 1.0, 32.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(0, -0.5, 26.0), Vector3(84.0, 1.0, 32.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(-26.0, -0.5, 0.0), Vector3(32.0, 1.0, 20.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(26.0, -0.5, 0.0), Vector3(32.0, 1.0, 20.0), Vector3.ZERO, mat_floor)

	# Outer Perimeter Cathedral Walls (84m x 84m)
	_add_static_box(Vector3(0, 7.5, -41.5), Vector3(84.0, 16.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(0, 7.5, 41.5), Vector3(84.0, 16.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(-41.5, 7.5, 0), Vector3(1.5, 16.0, 84.0), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(41.5, 7.5, 0), Vector3(1.5, 16.0, 84.0), Vector3.ZERO, mat_wall)

	# Long Unobstructed Stone Wall-Run Monoliths (Designed specifically for chaining Wall-Runs & Slide-Jumps!)
	for sx in [-31.0, 31.0]:
		for z_seg in [-22.0, 0.0, 22.0]:
			_add_static_box(Vector3(sx, 4.5, z_seg), Vector3(1.4, 9.0, 12.5), Vector3.ZERO, mat_dusk_tile)
			_add_static_box(Vector3(sx + signf(sx) * 5.0, 8.2, z_seg), Vector3(9.5, 1.0, 1.6), Vector3.ZERO, mat_arch)

	# 4 Quadrant Functional Blood Fountains on the Main Nave Floor
	for fx in [-19.0, 19.0]:
		for fz in [-18.0, 18.0]:
			_add_blood_fountain(Vector3(fx, 0.0, fz), 0.95)

	# Overhead Cathedral Rib-Vault Ceiling Beams & Wooden Gallows Beams
	for z_beam in [-28.0, -14.0, 0.0, 14.0, 28.0]:
		_add_static_box(Vector3(0, 14.2, z_beam), Vector3(82.0, 1.2, 1.8), Vector3.ZERO, mat_arch)
		_add_static_box(Vector3(0, 7.4, z_beam), Vector3(28.0, 0.45, 0.55), Vector3.ZERO, mat_wood)
	for x_beam in [-28.0, 0.0, 28.0]:
		_add_static_box(Vector3(x_beam, 14.8, 0), Vector3(1.8, 1.2, 82.0), Vector3.ZERO, mat_arch)

	# 12 Massive Fluted Gothic Pillars + Pointed Arches
	var pillar_coords: Array[Vector3] = [
		Vector3(-14, 0, -24), Vector3(-14, 0, -12), Vector3(-14, 0, 12), Vector3(-14, 0, 24),
		Vector3(14, 0, -24), Vector3(14, 0, -12), Vector3(14, 0, 12), Vector3(14, 0, 24),
		Vector3(-24, 0, -14), Vector3(24, 0, -14), Vector3(-24, 0, 14), Vector3(24, 0, 14)
	]
	for p_pos in pillar_coords:
		_add_static_box(p_pos + Vector3(0, 0.4, 0), Vector3(2.8, 0.8, 2.8), Vector3.ZERO, mat_arch)
		_add_static_box(p_pos + Vector3(0, 7.0, 0), Vector3(2.2, 14.0, 2.2), Vector3.ZERO, mat_arch)
		var inward_dir := Vector3(-signf(p_pos.x), 0.0, 0.0)
		_add_wall_torch(p_pos + Vector3(inward_dir.x * 1.25, 3.2, 0.0), inward_dir, false)

	for sx in [-14.0, 14.0]:
		for z_mid in [-18.0, 0.0, 18.0]:
			_add_static_box(Vector3(sx, 8.6, z_mid - 3.0), Vector3(1.8, 1.1, 6.8), Vector3(20, 0, 0), mat_arch)
			_add_static_box(Vector3(sx, 8.6, z_mid + 3.0), Vector3(1.8, 1.1, 6.8), Vector3(-20, 0, 0), mat_arch)

	# ========================================================================
	# TIER 2: SUSPENDED STONE BALCONIES, WOODEN RAMPS & WROUGHT-IRON GRATES (y = +3.8m)
	# ========================================================================
	_add_static_box(Vector3(0, 3.8, -32.0), Vector3(44.0, 0.6, 7.5), Vector3.ZERO, mat_arch)
	_add_static_box(Vector3(0, 3.8, 32.0), Vector3(44.0, 0.6, 7.5), Vector3.ZERO, mat_arch)
	_add_static_box(Vector3(-24.0, 3.8, 0), Vector3(6.5, 0.6, 36.0), Vector3.ZERO, mat_wood)
	_add_static_box(Vector3(24.0, 3.8, 0), Vector3(6.5, 0.6, 36.0), Vector3.ZERO, mat_wood)

	# Long Unobstructed Balcony Wall-Run Stone Backings (y = 3.8m to 9.2m)
	_add_static_box(Vector3(0, 6.5, -35.8), Vector3(44.0, 5.2, 0.8), Vector3.ZERO, mat_dusk_tile)
	_add_static_box(Vector3(0, 6.5, 35.8), Vector3(44.0, 5.2, 0.8), Vector3.ZERO, mat_dusk_tile)

	# 4 Long Sloped Stone & Wooden Ramps (y = 3.8m down to 0.0m — downhill slide-boost highways!)
	_add_static_box(Vector3(-16.5, 1.9, -24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, -21.5), mat_arch)
	_add_static_box(Vector3(16.5, 1.9, -24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, 21.5), mat_arch)
	_add_static_box(Vector3(-16.5, 1.9, 24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, -21.5), mat_arch)
	_add_static_box(Vector3(16.5, 1.9, 24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, 21.5), mat_arch)

	# 2 Rotten Wooden Parkour Ramps bridging East/West Catwalks directly toward the Central Pit
	_add_static_box(Vector3(-16.5, 1.9, 0.0), Vector3(9.5, 0.45, 3.8), Vector3(0, 0, -22.5), mat_wood)
	_add_static_box(Vector3(16.5, 1.9, 0.0), Vector3(9.5, 0.45, 3.8), Vector3(0, 0, 22.5), mat_wood)

	# Wrought-Iron Spiked Grates & Impaled Skull Pikes along Balconies
	for bx in [-10.0, 10.0]:
		_add_blood_chalice(Vector3(bx, 4.1, -32.0))
		_add_blood_chalice(Vector3(bx, 4.1, 32.0))
		_add_wrought_iron_grate(Vector3(bx * 1.6, 4.1, -28.4), 0.0)
		_add_wrought_iron_grate(Vector3(bx * 1.6, 4.1, 28.4), 0.0)
		_add_impaled_skull_pike(Vector3(bx * 0.6, 4.1, -29.0))
		_add_impaled_skull_pike(Vector3(bx * 0.6, 4.1, 29.0))

	# ========================================================================
	# HUNG CORPSES (CHAINED CADAVERS WITH PENDULUM SWAY PHYSICS!)
	# ========================================================================
	var corpse_positions: Array[Vector3] = [
		Vector3(-6.5, 7.2, -14.0), Vector3(6.5, 7.2, -14.0),
		Vector3(-6.5, 7.2, 14.0), Vector3(6.5, 7.2, 14.0),
		Vector3(-9.0, 7.2, 0.0), Vector3(9.0, 7.2, 0.0),
		Vector3(-24.0, 7.8, -10.0), Vector3(24.0, 7.8, -10.0),
		Vector3(-24.0, 7.8, 10.0), Vector3(24.0, 7.8, 10.0),
		Vector3(0.0, 7.2, -28.0), Vector3(0.0, 7.2, 28.0)
	]
	for cp in corpse_positions:
		_add_hung_corpse(cp)

	# Pre-placed Dried Blood Splatters on Crypt Floors & Walls (DUSK Atmosphere)
	var splat_tex: Texture2D = RetroAssetLoader.load_pixel_texture("res://assets/textures/blood_splatter.png")
	var splat_mat := StandardMaterial3D.new()
	splat_mat.albedo_texture = splat_tex
	splat_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	splat_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	splat_mat.roughness = 0.40
	for sp_coord in [
		Vector3(-4.0, -2.18, -3.5), Vector3(4.5, -2.18, 3.2),
		Vector3(0.0, 0.02, 13.5), Vector3(-15.0, 0.02, -6.0),
		Vector3(15.0, 0.02, 6.0), Vector3(0.0, 4.12, -31.5)
	]:
		var s_mi := MeshInstance3D.new()
		var s_box := BoxMesh.new()
		s_box.size = Vector3(3.4, 0.01, 3.4)
		s_box.material = splat_mat
		s_mi.mesh = s_box
		s_mi.position = sp_coord
		add_child(s_mi)

	# Perimeter & Corridor Flickering Torches
	for z_t in [-26.0, 0.0, 26.0]:
		_add_wall_torch(Vector3(-40.5, 4.2, z_t), Vector3(1, 0, 0), false)
		_add_wall_torch(Vector3(40.5, 4.2, z_t), Vector3(-1, 0, 0), false)
	for x_t in [-18.0, 18.0]:
		_add_wall_torch(Vector3(x_t, 5.8, -35.0), Vector3(0, 0, 1), true)
		_add_wall_torch(Vector3(x_t, 5.8, 35.0), Vector3(0, 0, -1), true)

	# Central Sacrificial Pit Crimson Light
	var altar_light := OmniLight3D.new()
	altar_light.position = Vector3(0, 1.8, 0)
	altar_light.light_color = Color(0.98, 0.08, 0.16)
	altar_light.light_energy = 2.8
	altar_light.omni_range = 24.0
	altar_light.omni_attenuation = 1.25
	add_child(altar_light)
	torch_lights.append(altar_light)

	# Multi-Tier Spawn Points (Sacrificial Pit, Vaulted Corridors, and Raised Balconies)
	spawn_points = [
		Vector3(-6, -2.0, -6), Vector3(6, -2.0, 6),
		Vector3(-6, -2.0, 6), Vector3(6, -2.0, -6),
		Vector3(-22, 0.2, -20), Vector3(22, 0.2, -20),
		Vector3(-22, 0.2, 20), Vector3(22, 0.2, 20),
		Vector3(-36, 0.2, -12), Vector3(36, 0.2, -12),
		Vector3(-36, 0.2, 12), Vector3(36, 0.2, 12),
		Vector3(-8, 4.2, -32.0), Vector3(8, 4.2, -32.0),
		Vector3(-8, 4.2, 32.0), Vector3(8, 4.2, 32.0),
		Vector3(-24.0, 4.2, -8), Vector3(24.0, 4.2, 8)
	]


func _add_blood_fountain(pos: Vector3, scale_f: float) -> void:
	var f_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_arch_stone.png",
		Vector3.ONE,
		Color.WHITE,
		Color(0.95, 0.06, 0.14),
		0.55
	)
	var f_node := StaticBody3D.new()
	f_node.position = pos
	f_node.collision_layer = 1
	add_child(f_node)

	var mi := MeshInstance3D.new()
	mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/blood_fountain.obj", f_mat)
	mi.material_override = f_mat
	mi.scale = Vector3.ONE * scale_f
	f_node.add_child(mi)

	var col := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 1.55 * scale_f
	cyl.height = 2.4 * scale_f
	col.shape = cyl
	col.position = Vector3(0, 1.2 * scale_f, 0)
	f_node.add_child(col)

	# Flowing Viscous Blood Droplets & Steam Mist
	var drop_mat := StandardMaterial3D.new()
	drop_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	drop_mat.albedo_color = Color(0.96, 0.06, 0.14, 0.90)
	var drop_mesh := BoxMesh.new()
	drop_mesh.size = Vector3(0.12 * scale_f, 0.34 * scale_f, 0.12 * scale_f)
	drop_mesh.material = drop_mat

	var drops: Array[MeshInstance3D] = []
	for i in range(8):
		var d_mi := MeshInstance3D.new()
		d_mi.mesh = drop_mesh
		f_node.add_child(d_mi)
		drops.append(d_mi)

	fountain_streams.append({
		"drops": drops,
		"scale": scale_f,
		"phase": randf() * TAU
	})

	# Register surrounding blood pool for bloody boot prints!
	blood_pool_centers.append(pos)


func _add_hung_corpse(pos: Vector3) -> void:
	var c_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/ghoul_tex.png",
		Vector3.ONE,
		Color(0.92, 0.76, 0.78),
		Color(0.45, 0.02, 0.05),
		0.20
	)
	var pivot := Node3D.new()
	pivot.position = pos
	add_child(pivot)

	var mi := MeshInstance3D.new()
	mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/hung_corpse.obj", c_mat)
	mi.material_override = c_mat
	pivot.add_child(mi)

	hung_corpses.append({
		"node": pivot,
		"pos": pos,
		"ang_x": randf_range(-0.06, 0.06),
		"ang_z": randf_range(-0.06, 0.06),
		"vel_x": 0.0,
		"vel_z": 0.0,
		"phase": randf() * TAU
	})


func apply_corpse_impulse(origin: Vector3, radius: float, strength: float) -> void:
	for c in hung_corpses:
		var pivot: Node3D = c["node"]
		if not is_instance_valid(pivot):
			continue
		var body_pos: Vector3 = pivot.global_position + Vector3(0, -2.2, 0)
		var diff: Vector3 = body_pos - origin
		var d: float = diff.length()
		if d < radius and d > 0.01:
			var falloff: float = (1.0 - d / radius) * strength
			var dir: Vector3 = diff / d
			c["vel_z"] = float(c["vel_z"]) + dir.x * falloff
			c["vel_x"] = float(c["vel_x"]) - dir.z * falloff


func _add_impaled_skull_pike(pos: Vector3) -> void:
	var p_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/ghoul_tex.png", Vector3.ONE
	)
	var mi := MeshInstance3D.new()
	mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/impaled_skull_pike.obj", p_mat)
	mi.material_override = p_mat
	mi.position = pos
	mi.rotation.y = randf() * TAU
	add_child(mi)


func _add_wrought_iron_grate(pos: Vector3, rot_y_deg: float) -> void:
	var g_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/weapon_atlas.png", Vector3.ONE
	)
	var mi := MeshInstance3D.new()
	mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/wrought_iron_grate.obj", g_mat)
	mi.material_override = g_mat
	mi.position = pos
	mi.rotation_degrees.y = rot_y_deg
	add_child(mi)


func _add_blood_chalice(pos: Vector3) -> void:
	var chalice_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/weapon_atlas.png",
		Vector3.ONE,
		Color.WHITE,
		Color(0.95, 0.06, 0.14),
		0.65
	)
	var mi := MeshInstance3D.new()
	mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/blood_chalice.obj", chalice_mat)
	mi.position = pos
	add_child(mi)


func _setup_gothic_environment(zone_index: int) -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	var bg_col := Color(0.05, 0.015, 0.025) if zone_index == 0 else (Color(0.04, 0.05, 0.07) if zone_index == 1 else Color(0.08, 0.04, 0.02))
	env.background_color = bg_col
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.24, 0.14, 0.16)
	env.ambient_light_energy = 0.85

	env.fog_enabled = true
	env.fog_light_color = Color(0.18, 0.035, 0.055)
	env.fog_light_energy = 0.95
	env.fog_density = 0.017

	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	var dir_light := DirectionalLight3D.new()
	dir_light.rotation_degrees = Vector3(-52, 32, 0)
	dir_light.light_color = Color(0.55, 0.36, 0.42)
	dir_light.light_energy = 0.45
	dir_light.shadow_enabled = false
	add_child(dir_light)


func _add_static_box(pos: Vector3, size: Vector3, rot_deg: Vector3, mat: Material) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.position = pos
	body.rotation_degrees = rot_deg

	var mesh_inst := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = size
	box_mesh.material = mat
	mesh_inst.mesh = box_mesh
	body.add_child(mesh_inst)

	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	body.add_child(col)

	add_child(body)
	return body


func _add_wall_torch(pos: Vector3, normal: Vector3, is_crimson: bool) -> void:
	var holder := Node3D.new()
	holder.position = pos
	if normal.length_squared() > 0.01:
		holder.look_at_from_position(pos, pos + normal, Vector3.UP)
	add_child(holder)

	var torch_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/weapon_atlas.png",
		Vector3.ONE,
		Color.WHITE,
		Color(1.0, 0.38, 0.08) if not is_crimson else Color(0.95, 0.08, 0.16),
		0.55
	)
	var sconce_inst := MeshInstance3D.new()
	sconce_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/wall_torch.obj", torch_mat)
	holder.add_child(sconce_inst)

	var flame_inst := MeshInstance3D.new()
	var prism := PrismMesh.new()
	prism.size = Vector3(0.22, 0.42, 0.22)
	var flame_mat := StandardMaterial3D.new()
	flame_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame_mat.albedo_color = Color(1.0, 0.62, 0.15) if not is_crimson else Color(1.0, 0.15, 0.25)
	prism.material = flame_mat
	flame_inst.mesh = prism
	flame_inst.position = Vector3(0, 0.66, -0.35)
	holder.add_child(flame_inst)
	torch_flames.append(flame_inst)

	var light := OmniLight3D.new()
	light.position = Vector3(0, 0.72, -0.45)
	light.light_color = Color(1.0, 0.48, 0.16) if not is_crimson else Color(0.95, 0.12, 0.20)
	light.light_energy = 1.85
	light.omni_range = 16.5
	light.omni_attenuation = 1.35
	holder.add_child(light)
	torch_lights.append(light)


func _process(delta: float) -> void:
	_time += delta
	# 1. Torch Light & Flame Flicker
	for i in range(torch_lights.size()):
		var l: OmniLight3D = torch_lights[i]
		if not is_instance_valid(l):
			continue
		var phase := float(i) * 1.73
		var flicker := 1.0 + 0.22 * sin(_time * 9.5 + phase) + 0.12 * cos(_time * 23.0 + phase * 2.1)
		l.light_energy = (2.6 if i == torch_lights.size() - 1 else 1.75) * flicker
	for i in range(torch_flames.size()):
		var f: MeshInstance3D = torch_flames[i]
		if not is_instance_valid(f):
			continue
		var phase := float(i) * 2.1
		f.scale = Vector3(
			1.0 + 0.15 * sin(_time * 14.0 + phase),
			1.0 + 0.28 * cos(_time * 18.0 + phase),
			1.0 + 0.15 * sin(_time * 14.0 + phase)
		)
		f.rotation.y += delta * 2.5

	# 2. Flowing Blood Fountain Streams
	for fs in fountain_streams:
		var drops: Array = fs["drops"]
		var sc: float = float(fs["scale"])
		var ph: float = float(fs["phase"])
		for d_i in range(drops.size()):
			var d_mi: MeshInstance3D = drops[d_i]
			var ang: float = float(d_i) * (TAU / float(drops.size())) + _time * 0.6
			var prog: float = fmod(_time * 1.8 + float(d_i) * 0.23 + ph, 1.0)
			var r: float = lerpf(0.28, 1.25, prog) * sc
			var y: float = lerpf(2.35, 0.65, prog * prog) * sc
			d_mi.position = Vector3(cos(ang) * r, y, sin(ang) * r)

	# 3. Pendulum Sway Physics for Hung Corpses
	for c in hung_corpses:
		var pivot: Node3D = c["node"]
		if not is_instance_valid(pivot):
			continue
		var ax: float = float(c["ang_x"])
		var az: float = float(c["ang_z"])
		var vx: float = float(c["vel_x"])
		var vz: float = float(c["vel_z"])
		var ph: float = float(c["phase"])

		# Restoring pendulum gravity torque + subtle air draft
		vx += (-9.8 * ax + sin(_time * 1.3 + ph) * 0.12 - vx * 1.8) * delta
		vz += (-9.8 * az + cos(_time * 1.1 + ph) * 0.12 - vz * 1.8) * delta
		ax = clampf(ax + vx * delta, -0.65, 0.65)
		az = clampf(az + vz * delta, -0.65, 0.65)

		c["ang_x"] = ax
		c["ang_z"] = az
		c["vel_x"] = vx
		c["vel_z"] = vz
		pivot.rotation.x = ax
		pivot.rotation.z = az
