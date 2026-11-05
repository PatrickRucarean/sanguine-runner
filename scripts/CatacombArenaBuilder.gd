extends Node3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")

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
		"res://assets/textures/wet_stone_floor.png", Vector3(18, 18, 1)
	)
	var mat_wall: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/gothic_brick.png", Vector3(12, 4, 1)
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
		Color(0.85, 0.25, 0.28),
		Color(0.85, 0.05, 0.10),
		0.45
	)

	# 1. Main Catacomb Flagstone Floor (72m x 72m) & Vaulted Crypt Ceiling Beams
	_add_static_box(Vector3(0, -0.5, 0), Vector3(72, 1.0, 72), Vector3.ZERO, mat_floor)

	for z_beam in [-24.0, -12.0, 0.0, 12.0, 24.0]:
		_add_static_box(Vector3(0, 13.5, z_beam), Vector3(70, 1.2, 1.8), Vector3.ZERO, mat_arch)
	for x_beam in [-24.0, 0.0, 24.0]:
		_add_static_box(Vector3(x_beam, 14.2, 0), Vector3(1.8, 1.2, 70), Vector3.ZERO, mat_arch)

	# 2. Perimeter Catacomb Brick Walls
	_add_static_box(Vector3(0, 7.0, -35.5), Vector3(72, 15.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(0, 7.0, 35.5), Vector3(72, 15.0, 1.5), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(-35.5, 7.0, 0), Vector3(1.5, 15.0, 72), Vector3.ZERO, mat_wall)
	_add_static_box(Vector3(35.5, 7.0, 0), Vector3(1.5, 15.0, 72), Vector3.ZERO, mat_wall)

	# 3. Central Blood Altar Dais & Sarcophagus Ledges
	_add_static_box(Vector3(0, 0.35, 0), Vector3(9.0, 0.7, 9.0), Vector3.ZERO, mat_altar)
	_add_static_box(Vector3(0, 0.95, 0), Vector3(4.2, 0.6, 4.2), Vector3.ZERO, mat_arch)

	# 4. Colonnade of 8 Ribbed Gothic Pillars + Pointed Arches
	var pillar_coords: Array[Vector3] = [
		Vector3(-12, 0, -18), Vector3(-12, 0, -6), Vector3(-12, 0, 6), Vector3(-12, 0, 18),
		Vector3(12, 0, -18), Vector3(12, 0, -6), Vector3(12, 0, 6), Vector3(12, 0, 18)
	]
	for p_pos in pillar_coords:
		_add_static_box(p_pos + Vector3(0, 0.4, 0), Vector3(2.8, 0.8, 2.8), Vector3.ZERO, mat_arch)
		_add_static_box(p_pos + Vector3(0, 6.5, 0), Vector3(2.2, 13.0, 2.2), Vector3.ZERO, mat_arch)
		var inward_dir := Vector3(-signf(p_pos.x), 0.0, 0.0)
		_add_wall_torch(p_pos + Vector3(inward_dir.x * 1.25, 3.2, 0.0), inward_dir, false)

	for sx in [-12.0, 12.0]:
		for z_mid in [-12.0, 0.0, 12.0]:
			_add_static_box(Vector3(sx, 8.2, z_mid - 2.6), Vector3(1.8, 1.1, 6.2), Vector3(22, 0, 0), mat_arch)
			_add_static_box(Vector3(sx, 8.2, z_mid + 2.6), Vector3(1.8, 1.1, 6.2), Vector3(-22, 0, 0), mat_arch)

	# 5. Elevated Rotten-Wood Catacomb Galleries (y = 3.6m) & Sloped Aqueduct Slide Ramps
	_add_static_box(Vector3(0, 3.6, -26.5), Vector3(36.0, 0.5, 6.0), Vector3.ZERO, mat_wood)
	_add_static_box(Vector3(0, 3.6, 26.5), Vector3(36.0, 0.5, 6.0), Vector3.ZERO, mat_wood)
	_add_static_box(Vector3(-26.5, 3.6, 0), Vector3(6.0, 0.5, 32.0), Vector3.ZERO, mat_floor)
	_add_static_box(Vector3(26.5, 3.6, 0), Vector3(6.0, 0.5, 32.0), Vector3.ZERO, mat_floor)

	_add_static_box(Vector3(-19.5, 1.8, -26.5), Vector3(9.5, 0.5, 4.2), Vector3(0, 0, -21.5), mat_wood)
	_add_static_box(Vector3(19.5, 1.8, -26.5), Vector3(9.5, 0.5, 4.2), Vector3(0, 0, 21.5), mat_wood)
	_add_static_box(Vector3(-19.5, 1.8, 26.5), Vector3(9.5, 0.5, 4.2), Vector3(0, 0, -21.5), mat_wood)
	_add_static_box(Vector3(19.5, 1.8, 26.5), Vector3(9.5, 0.5, 4.2), Vector3(0, 0, 21.5), mat_wood)

	for c_pos in [Vector3(-18, 0.88, -10), Vector3(18, 0.88, -10), Vector3(-18, 0.88, 10), Vector3(18, 0.88, 10)]:
		_add_static_box(c_pos, Vector3(3.4, 1.76, 5.2), Vector3.ZERO, mat_wall)

	# 6. Perimeter Wall Torches & Central Blood Altar Crimson Brazier
	for z_t in [-22.0, 0.0, 22.0]:
		_add_wall_torch(Vector3(-34.5, 4.2, z_t), Vector3(1, 0, 0), false)
		_add_wall_torch(Vector3(34.5, 4.2, z_t), Vector3(-1, 0, 0), false)
	for x_t in [-16.0, 16.0]:
		_add_wall_torch(Vector3(x_t, 4.2, -34.5), Vector3(0, 0, 1), true)
		_add_wall_torch(Vector3(x_t, 4.2, 34.5), Vector3(0, 0, -1), true)

	var altar_light := OmniLight3D.new()
	altar_light.position = Vector3(0, 3.2, 0)
	altar_light.light_color = Color(0.95, 0.08, 0.14)
	altar_light.light_energy = 2.4
	altar_light.omni_range = 18.0
	altar_light.omni_attenuation = 1.3
	add_child(altar_light)
	torch_lights.append(altar_light)

	spawn_points = [
		Vector3(-22, 0.2, -20), Vector3(22, 0.2, -20),
		Vector3(-22, 0.2, 20), Vector3(22, 0.2, 20),
		Vector3(0, 0.2, -22), Vector3(0, 0.2, 22),
		Vector3(-22, 0.2, 0), Vector3(22, 0.2, 0),
		Vector3(-8, 3.9, -26.5), Vector3(8, 3.9, -26.5),
		Vector3(-8, 3.9, 26.5), Vector3(8, 3.9, 26.5),
		Vector3(-26.5, 3.9, -8), Vector3(26.5, 3.9, 8)
	]


func _setup_gothic_environment(zone_index: int) -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	var bg_col := Color(0.07, 0.02, 0.035) if zone_index == 0 else (Color(0.04, 0.05, 0.07) if zone_index == 1 else Color(0.08, 0.04, 0.02))
	env.background_color = bg_col
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.24, 0.14, 0.16)
	env.ambient_light_energy = 0.85

	env.fog_enabled = true
	env.fog_light_color = Color(0.18, 0.035, 0.055)
	env.fog_light_energy = 0.95
	env.fog_density = 0.019

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
	light.omni_range = 15.5
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
		l.light_energy = (2.2 if i == torch_lights.size() - 1 else 1.75) * flicker
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
