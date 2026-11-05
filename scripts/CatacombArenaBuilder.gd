extends Node3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")

## Handcrafted 3-Tier Gothic Cathedral / Crypt Arena:
## - Tier 0 (y = -2.2m): Central Sacrificial Pit with Blood Altar, Blood Chalices, and 4 exit ramps
## - Tier 1 (y =  0.0m): Main Crypt Nave & Connecting Vaulted Corridors with 12 Gothic Pillars & Arches
## - Tier 2 (y = +3.8m): Raised Stone Balconies for Wall-Running & Downhill Slide-Boosting

var torch_lights: Array[OmniLight3D] = []
var torch_flames: Array[MeshInstance3D] = []
var spawn_points: Array[Vector3] = []
var _time: float = 0.0


func build_catacomb_arena(zone_index: int = 0) -> void:
	for child in get_children():
		child.queue_free()
	torch_lights.clear()
	torch_flames.clear()
	spawn_points.clear()

	_setup_gothic_environment(zone_index)

	var mat_floor: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/wet_stone_floor.png", Vector3(14, 14, 1)
	)
	var mat_pit: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/wet_stone_floor.png", Vector3(6, 6, 1), Color(0.85, 0.55, 0.58)
	)
	var mat_wall: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_brick.png", Vector3(14, 5, 1)
	)
	var mat_arch: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_arch_stone.png", Vector3(2, 6, 2)
	)
	var mat_wood: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/rotten_wood.png", Vector3(6, 2, 2)
	)
	var mat_altar: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_arch_stone.png",
		Vector3(2, 2, 2),
		Color(0.90, 0.22, 0.26),
		Color(0.95, 0.06, 0.12),
		0.55
	)

	# ========================================================================
	# TIER 0: CENTRAL SACRIFICIAL BLOOD PIT (y = -2.2m, 20m x 20m sunken pit)
	# ========================================================================
	_add_static_box(Vector3(0, -2.7, 0), Vector3(22.0, 1.0, 22.0), Vector3.ZERO, mat_pit)
	# Central Sacrificial Dais inside the pit
	_add_static_box(Vector3(0, -1.85, 0), Vector3(5.2, 0.7, 5.2), Vector3.ZERO, mat_altar)
	_add_blood_chalice(Vector3(0, -1.50, 0))

	# 4 Sloped Stone Ramps climbing out of the Sacrificial Pit (-2.2m -> 0.0m)
	_add_static_box(Vector3(0, -1.1, -8.2), Vector3(4.6, 0.5, 6.8), Vector3(20.0, 0, 0), mat_arch)
	_add_static_box(Vector3(0, -1.1, 8.2), Vector3(4.6, 0.5, 6.8), Vector3(-20.0, 0, 0), mat_arch)
	_add_static_box(Vector3(-8.2, -1.1, 0), Vector3(6.8, 0.5, 4.6), Vector3(0, 0, -20.0), mat_arch)
	_add_static_box(Vector3(8.2, -1.1, 0), Vector3(6.8, 0.5, 4.6), Vector3(0, 0, 20.0), mat_arch)

	# 4 Corner Blood Chalices around the Sacrificial Pit rim (y = 0.0m)
	for cx in [-10.5, 10.5]:
		for cz in [-10.5, 10.5]:
			_add_static_box(Vector3(cx, -0.9, cz), Vector3(2.2, 2.6, 2.2), Vector3.ZERO, mat_arch)
			_add_blood_chalice(Vector3(cx, 0.4, cz))

	# ========================================================================
	# TIER 1: MAIN CRYPT NAVE & CONNECTING VAULTED CORRIDORS (y = 0.0m)
	# ========================================================================
	# 4 Nave Floor Quadrants surrounding the 20m x 20m Sacrificial Pit (total 84m x 84m)
	_add_static_box(Vector3(0, -0.5, -26.0), Vector3(84.0, 1.0, 32.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(0, -0.5, 26.0), Vector3(84.0, 1.0, 32.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(-26.0, -0.5, 0.0), Vector3(32.0, 1.0, 20.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(26.0, -0.5, 0.0), Vector3(32.0, 1.0, 20.0), Vector3.ZERO, mat_floor)

	# Outer Perimeter Cathedral Walls (84m x 84m)
	_add_static_box(Vector3(0, 7.5, -41.5), Vector3(84.0, 16.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(0, 7.5, 41.5), Vector3(84.0, 16.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(-41.5, 7.5, 0), Vector3(1.5, 16.0, 84.0), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(41.5, 7.5, 0), Vector3(1.5, 16.0, 84.0), Vector3.ZERO, mat_wall)

	# Vaulted Corridor Partition Walls (forming outer vaulted side corridors with archway passages)
	for sx in [-31.0, 31.0]:
		for z_seg in [-22.0, 0.0, 22.0]:
			_add_static_box(Vector3(sx, 4.5, z_seg), Vector3(1.4, 9.0, 9.5), Vector3.ZERO, mat_wall)
			# Pointed Vault Arch spanning the outer corridor
			_add_static_box(Vector3(sx + signf(sx) * 5.0, 8.2, z_seg), Vector3(9.5, 1.0, 1.6), Vector3.ZERO, mat_arch)

	# Overhead Cathedral Rib-Vault Ceiling Beams
	for z_beam in [-28.0, -14.0, 0.0, 14.0, 28.0]:
		_add_static_box(Vector3(0, 14.2, z_beam), Vector3(82.0, 1.2, 1.8), Vector3.ZERO, mat_arch)
	for x_beam in [-28.0, 0.0, 28.0]:
		_add_static_box(Vector3(x_beam, 14.8, 0), Vector3(1.8, 1.2, 82.0), Vector3.ZERO, mat_arch)

	# 12 Ribbed Gothic Pillars + Pointed Arches
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
	# TIER 2: RAISED STONE BALCONIES FOR WALL-RUNNING & SLIDE RAMPS (y = +3.8m)
	# ========================================================================
	_add_static_box(Vector3(0, 3.8, -32.0), Vector3(44.0, 0.6, 7.5), Vector3.ZERO, mat_arch)
	_add_static_box(Vector3(0, 3.8, 32.0), Vector3(44.0, 0.6, 7.5), Vector3.ZERO, mat_arch)
	_add_static_box(Vector3(-24.0, 3.8, 0), Vector3(6.5, 0.6, 36.0), Vector3.ZERO, mat_wood)
	_add_static_box(Vector3(24.0, 3.8, 0), Vector3(6.5, 0.6, 36.0), Vector3.ZERO, mat_wood)

	# Balcony Wall-Run Stone Backings (y = 3.8m to 8.5m)
	_add_static_box(Vector3(0, 6.2, -35.8), Vector3(42.0, 4.4, 0.8), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(0, 6.2, 35.8), Vector3(42.0, 4.4, 0.8), Vector3.ZERO, mat_wall)

	# 4 Long Steep Sloped Stone Ramps (y = 3.8m down to 0.0m — primary downhill slide-boost highways!)
	_add_static_box(Vector3(-16.5, 1.9, -24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, -21.5), mat_arch)
	_add_static_box(Vector3(16.5, 1.9, -24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, 21.5), mat_arch)
	_add_static_box(Vector3(-16.5, 1.9, 24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, -21.5), mat_arch)
	_add_static_box(Vector3(16.5, 1.9, 24.5), Vector3(10.5, 0.5, 4.4), Vector3(0, 0, 21.5), mat_arch)

	# Blood Chalices on the Raised Stone Balconies
	for bx in [-10.0, 10.0]:
		_add_blood_chalice(Vector3(bx, 4.1, -32.0))
		_add_blood_chalice(Vector3(bx, 4.1, 32.0))

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
	altar_light.light_energy = 2.6
	altar_light.omni_range = 22.0
	altar_light.omni_attenuation = 1.25
	add_child(altar_light)
	torch_lights.append(altar_light)

	# Multi-Tier Spawn Points (Sacrificial Pit, Vaulted Corridors, and Raised Balconies)
	spawn_points = [
		Vector3(-6, -2.0, -6), Vector3(6, -2.0, 6),
		Vector3(-22, 0.2, -20), Vector3(22, 0.2, -20),
		Vector3(-22, 0.2, 20), Vector3(22, 0.2, 20),
		Vector3(-36, 0.2, -12), Vector3(36, 0.2, -12),
		Vector3(-36, 0.2, 12), Vector3(36, 0.2, 12),
		Vector3(-8, 4.2, -32.0), Vector3(8, 4.2, -32.0),
		Vector3(-8, 4.2, 32.0), Vector3(8, 4.2, 32.0),
		Vector3(-24.0, 4.2, -8), Vector3(24.0, 4.2, 8)
	]


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
	var bg_col := Color(0.06, 0.018, 0.03) if zone_index == 0 else (Color(0.04, 0.05, 0.07) if zone_index == 1 else Color(0.08, 0.04, 0.02))
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
	for i in range(torch_lights.size()):
		var l: OmniLight3D = torch_lights[i]
		if not is_instance_valid(l):
			continue
		var phase := float(i) * 1.73
		var flicker := 1.0 + 0.22 * sin(_time * 9.5 + phase) + 0.12 * cos(_time * 23.0 + phase * 2.1)
		l.light_energy = (2.5 if i == torch_lights.size() - 1 else 1.75) * flicker
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
