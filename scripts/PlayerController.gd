extends CharacterBody3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")
const DataCatalog = preload("res://scripts/DataCatalog.gd")

enum MoveState { IDLE, RUN, SLIDE, WALL_RUN, AIR, MANTLE }

var move_state: MoveState = MoveState.IDLE
var yaw: float = 0.0
var pitch: float = 0.0
var mouse_sensitivity: float = 0.0022

# Movement Pace Tuning: ~25% slower baseline ground walk/sprint (9.4 m/s vs 12.5 m/s)
# Momentum, sliding down crypt ramps, and wall-running are the primary ways to reach 18-28+ m/s!
const BASE_RUN_SPEED: float = 9.4
const GROUND_ACCEL: float = 14.0
const GROUND_FRICTION: float = 8.5
const STOP_SPEED: float = 4.0
const GRAVITY: float = 28.0
const JUMP_VELOCITY: float = 10.5
const SLIDE_IMPULSE: float = 5.2
const SLIDE_FRICTION: float = 1.05
const WALL_RUN_MIN_SPEED: float = 6.5
const WALL_RUN_MAX_TIME: float = 1.6

var coyote_timer: float = 0.0
var jump_buffer_timer: float = 0.0
var grounded_ticks: int = 0
var slide_boost_cd: float = 0.0
var wall_normal: Vector3 = Vector3.ZERO
var last_wall_normal: Vector3 = Vector3.ZERO
var wall_run_timer: float = 0.0
var mantle_timer: float = 0.0
var mantle_target: Vector3 = Vector3.ZERO

# Camera & Combat Weight ("Juice")
var camera_holder: Node3D = null
var camera: Camera3D = null
var current_eye_height: float = 1.65
var current_tilt_deg: float = 0.0
var swing_tilt_deg: float = 0.0
var recoil_pitch_kick: float = 0.0
var fov_punch: float = 0.0
var trauma: float = 0.0
var bob_time: float = 0.0

# First-Person Separate Dual-Wield Arms Rig + Slide/Kick Boots
var left_arm_pivot: Node3D = null
var right_arm_pivot: Node3D = null
var left_hand_inst: MeshInstance3D = null
var right_hand_inst: MeshInstance3D = null
var left_weapon_inst: MeshInstance3D = null
var right_weapon_inst: MeshInstance3D = null

var boots_pivot: Node3D = null
var left_boot_inst: MeshInstance3D = null
var right_boot_inst: MeshInstance3D = null
var boot_kick_timer: float = 0.0

var slash_ribbon_inst: MeshInstance3D = null
var slash_ribbon_timer: float = 0.0
var swing_anim_timer: float = 0.0
var swing_dir_sign: float = 1.0

# Separate Dual-Wield Animation Timers (Left Hand Stake / Pistol vs Right Hand Hammer / Pistol)
var left_throw_timer: float = 0.0
var left_throw_duration: float = 0.26
var right_slam_timer: float = 0.0
var dual_pistol_alt_side: bool = false

# Occult War-Hammer Overhead Wind-Up State
var hammer_windup_timer: float = 0.0
var hammer_smash_pending: bool = false

# Bloody Boots Footprint Trail State
var bloody_boots_timer: float = 0.0
var footprint_step_timer: float = 0.0
var footprint_left_side: bool = false

var equipped_weapon_id: String = "alucard_sword"
var weapon_cfg: Dictionary = {}
var fire_cooldown: float = 0.0
var alt_cooldown: float = 0.0
var quick_melee_cd: float = 0.0
var ammo: int = 12
var max_ammo: int = 12
var is_reloading: bool = false
var reload_timer: float = 0.0
var reload_window_used: bool = false
var blood_gauge: float = 100.0
var max_blood_gauge: float = 100.0
var speed_buff_timer: float = 0.0

var col_shape: CollisionShape3D = null
var capsule: CapsuleShape3D = null
var sfx_player: AudioStreamPlayer = null
var parry_sfx_player: AudioStreamPlayer = null
var hammer_sfx_player: AudioStreamPlayer = null
var game_main: Node = null


func _ready() -> void:
	# Layer 4 = Player, Mask 1 (Environment) | 2 (Enemies)
	collision_layer = 4
	collision_mask = 1 | 2

	col_shape = CollisionShape3D.new()
	capsule = CapsuleShape3D.new()
	capsule.radius = 0.42
	capsule.height = 1.80
	col_shape.shape = capsule
	col_shape.position = Vector3(0, 0.90, 0)
	add_child(col_shape)

	camera_holder = Node3D.new()
	camera_holder.position = Vector3(0, 1.65, 0)
	add_child(camera_holder)

	camera = Camera3D.new()
	camera.fov = 95.0
	camera.near = 0.05
	camera.far = 160.0
	camera_holder.add_child(camera)

	# 1. Separate Left & Right Arm Viewmodel Pivots (True Dual-Wield Architecture!)
	var cuff_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/inquisitor_tex.png",
		Vector3.ONE,
		Color(0.95, 0.85, 0.88),
		Color(0.75, 0.05, 0.12),
		0.32
	)
	var hand_mesh: ArrayMesh = RetroAssetLoader.load_obj_mesh("res://assets/models/vampiric_hand.obj", cuff_mat)

	left_arm_pivot = Node3D.new()
	left_arm_pivot.position = Vector3(-0.28, -0.25, -0.44)
	camera.add_child(left_arm_pivot)

	left_hand_inst = MeshInstance3D.new()
	left_hand_inst.mesh = hand_mesh
	left_hand_inst.material_override = cuff_mat
	left_hand_inst.position = Vector3(0.0, -0.10, 0.08)
	left_hand_inst.scale = Vector3(-1.0, 1.0, 1.0)
	left_arm_pivot.add_child(left_hand_inst)

	left_weapon_inst = MeshInstance3D.new()
	left_arm_pivot.add_child(left_weapon_inst)

	right_arm_pivot = Node3D.new()
	right_arm_pivot.position = Vector3(0.28, -0.25, -0.42)
	camera.add_child(right_arm_pivot)

	right_hand_inst = MeshInstance3D.new()
	right_hand_inst.mesh = hand_mesh
	right_hand_inst.material_override = cuff_mat
	right_hand_inst.position = Vector3(0.0, -0.10, 0.08)
	right_arm_pivot.add_child(right_hand_inst)

	right_weapon_inst = MeshInstance3D.new()
	right_arm_pivot.add_child(right_weapon_inst)

	# 2. First-Person 3D Vampiric Boots Rig (visible during Slides & Blood-Kicks!)
	boots_pivot = Node3D.new()
	boots_pivot.position = Vector3(0.0, -0.55, -0.15)
	camera.add_child(boots_pivot)

	var boot_mesh: ArrayMesh = RetroAssetLoader.load_obj_mesh("res://assets/models/vampiric_boot.obj", cuff_mat)
	left_boot_inst = MeshInstance3D.new()
	left_boot_inst.mesh = boot_mesh
	left_boot_inst.material_override = cuff_mat
	left_boot_inst.position = Vector3(-0.16, -0.10, -0.55)
	left_boot_inst.rotation_degrees = Vector3(68.0, 8.0, 0.0)
	boots_pivot.add_child(left_boot_inst)

	right_boot_inst = MeshInstance3D.new()
	right_boot_inst.mesh = boot_mesh
	right_boot_inst.material_override = cuff_mat
	right_boot_inst.position = Vector3(0.16, -0.06, -0.68)
	right_boot_inst.rotation_degrees = Vector3(74.0, -6.0, 0.0)
	boots_pivot.add_child(right_boot_inst)
	boots_pivot.visible = false

	# 3. 3D Crimson Slash Ribbon
	slash_ribbon_inst = MeshInstance3D.new()
	var ribbon_box := BoxMesh.new()
	ribbon_box.size = Vector3(1.8, 0.035, 0.45)
	var ribbon_mat := StandardMaterial3D.new()
	ribbon_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ribbon_mat.albedo_color = Color(0.95, 0.08, 0.16, 0.85)
	ribbon_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ribbon_box.material = ribbon_mat
	slash_ribbon_inst.mesh = ribbon_box
	slash_ribbon_inst.position = Vector3(0.0, -0.08, -1.15)
	slash_ribbon_inst.visible = false
	camera.add_child(slash_ribbon_inst)

	# 4. Audio Players
	sfx_player = AudioStreamPlayer.new()
	sfx_player.volume_db = -3.0
	add_child(sfx_player)

	parry_sfx_player = AudioStreamPlayer.new()
	parry_sfx_player.stream = RetroAssetLoader.load_wav("res://assets/audio/parry_clang.wav")
	parry_sfx_player.volume_db = -2.0
	add_child(parry_sfx_player)

	hammer_sfx_player = AudioStreamPlayer.new()
	hammer_sfx_player.stream = RetroAssetLoader.load_wav("res://assets/audio/hammer_expunge.wav")
	hammer_sfx_player.volume_db = -1.0
	add_child(hammer_sfx_player)

	equip_single_weapon("alucard_sword")


func equip_single_weapon(wep_id: String) -> void:
	equipped_weapon_id = wep_id
	weapon_cfg = DataCatalog.WEAPONS.get(wep_id, DataCatalog.WEAPONS["alucard_sword"])

	var wep_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/weapon_atlas.png",
		Vector3.ONE,
		Color.WHITE,
		Color(0.9, 0.08, 0.14),
		0.28
	)
	sfx_player.stream = RetroAssetLoader.load_wav(String(weapon_cfg["sfx_path"]))

	# Separate Hands Architecture:
	# - stake_and_hammer: Left Hand holds Iron Stake (stake_held.obj), Right Hand holds Occult War-Hammer (war_hammer.obj)
	# - jackal_and_casull: Left Hand holds Jackal Pistol, Right Hand holds Casull Pistol (single_pistol.obj)
	# - Single/Two-Handed weapons: Right Hand holds main weapon, Left Hand supports foregrip
	if wep_id == "stake_and_hammer":
		left_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/stake_held.obj", wep_mat)
		left_weapon_inst.material_override = wep_mat
		left_weapon_inst.visible = true
		right_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/war_hammer.obj", wep_mat)
		right_weapon_inst.material_override = wep_mat
		right_weapon_inst.visible = true
	elif wep_id == "jackal_and_casull":
		var pistol_mesh: ArrayMesh = RetroAssetLoader.load_obj_mesh("res://assets/models/single_pistol.obj", wep_mat)
		left_weapon_inst.mesh = pistol_mesh
		left_weapon_inst.material_override = wep_mat
		left_weapon_inst.visible = true
		right_weapon_inst.mesh = pistol_mesh
		right_weapon_inst.material_override = wep_mat
		right_weapon_inst.visible = true
	else:
		left_weapon_inst.visible = false
		right_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh(String(weapon_cfg["obj_path"]), wep_mat)
		right_weapon_inst.material_override = wep_mat
		right_weapon_inst.visible = true

	max_ammo = 16 if wep_id == "jackal_and_casull" else (8 if wep_id == "trench_shotgun" else 0)
	ammo = max_ammo
	is_reloading = false
	hammer_smash_pending = false
	left_throw_timer = 0.0
	right_slam_timer = 0.0


func handle_mouse_motion(rel: Vector2) -> void:
	var sens: float = DataCatalog.mouse_sens
	var y_sign: float = -1.0 if DataCatalog.invert_y else 1.0
	yaw -= rel.x * sens
	pitch = clampf(pitch - rel.y * sens * y_sign, deg_to_rad(-86.0), deg_to_rad(86.0))
	rotation.y = yaw


func get_horizontal_speed() -> float:
	return Vector2(velocity.x, velocity.z).length()


func get_effective_melee_reach() -> float:
	var base_r := float(weapon_cfg.get("reach", 2.5))
	var mult := 1.0 + float(game_main.player_stats.get("melee_reach_pct", 0.0)) if game_main != null else 1.0
	return base_r * mult


func physics_tick(dt: float) -> void:
	if game_main == null:
		return

	if coyote_timer > 0.0:
		coyote_timer -= dt
	if jump_buffer_timer > 0.0:
		jump_buffer_timer -= dt
	if slide_boost_cd > 0.0:
		slide_boost_cd -= dt
	if fire_cooldown > 0.0:
		fire_cooldown -= dt
	if alt_cooldown > 0.0:
		alt_cooldown -= dt
	if quick_melee_cd > 0.0:
		quick_melee_cd -= dt
	if speed_buff_timer > 0.0:
		speed_buff_timer -= dt
	if boot_kick_timer > 0.0:
		boot_kick_timer -= dt
	if left_throw_timer > 0.0:
		left_throw_timer = maxf(0.0, left_throw_timer - dt)
	if right_slam_timer > 0.0:
		right_slam_timer = maxf(0.0, right_slam_timer - dt)
	if bloody_boots_timer > 0.0:
		bloody_boots_timer = maxf(0.0, bloody_boots_timer - dt)
		if is_on_floor() and get_horizontal_speed() > 2.2:
			footprint_step_timer -= dt
			if footprint_step_timer <= 0.0:
				footprint_step_timer = 0.24
				footprint_left_side = not footprint_left_side
				game_main.spawn_bloody_footprint(global_position, yaw, footprint_left_side)

	blood_gauge = minf(max_blood_gauge, blood_gauge + 4.2 * dt)

	# Process Occult War-Hammer Wind-Up -> Heavy Smash Detonation!
	if hammer_smash_pending:
		hammer_windup_timer -= dt
		if hammer_windup_timer <= 0.0:
			hammer_smash_pending = false
			_complete_war_hammer_expunge_smash()

	var in_fwd := (1.0 if Input.is_key_pressed(KEY_W) else 0.0) - (1.0 if Input.is_key_pressed(KEY_S) else 0.0)
	var in_right := (1.0 if Input.is_key_pressed(KEY_D) else 0.0) - (1.0 if Input.is_key_pressed(KEY_A) else 0.0)
	var crouch_held := Input.is_key_pressed(KEY_SHIFT) or Input.is_key_pressed(KEY_CTRL) or Input.is_key_pressed(KEY_C)

	var forward_vec := -global_transform.basis.z
	forward_vec.y = 0.0
	forward_vec = forward_vec.normalized()
	var right_vec := global_transform.basis.x
	right_vec.y = 0.0
	right_vec = right_vec.normalized()

	var wish_dir := (forward_vec * in_fwd + right_vec * in_right)
	if wish_dir.length_squared() > 1.0:
		wish_dir = wish_dir.normalized()

	var speed_mult := 1.0 + float(game_main.player_stats.get("move_speed_pct", 0.0)) + (0.15 if speed_buff_timer > 0.0 else 0.0)
	var run_wish_speed := BASE_RUN_SPEED * speed_mult

	if move_state == MoveState.MANTLE:
		mantle_timer -= dt
		global_position = global_position.lerp(mantle_target, minf(1.0, dt * 18.0))
		if mantle_timer <= 0.0:
			move_state = MoveState.RUN
			velocity = forward_vec * maxf(get_horizontal_speed(), 11.0)
		_update_camera_and_viewmodel(dt, wish_dir)
		return

	var on_floor := is_on_floor()
	if on_floor:
		coyote_timer = 0.12
		grounded_ticks += 1
		last_wall_normal = Vector3.ZERO
	else:
		grounded_ticks = 0

	if jump_buffer_timer > 0.0:
		if move_state == MoveState.WALL_RUN:
			var wall_tangent := (Vector3(velocity.x, 0, velocity.z) - wall_normal * Vector3(velocity.x, 0, velocity.z).dot(wall_normal)).normalized()
			var kick_dir := (wall_normal * 0.58 + (wall_tangent + forward_vec).normalized() * 0.42).normalized()
			var kick_spd := maxf(get_horizontal_speed() + 3.2, 16.5 * speed_mult)
			velocity.x = kick_dir.x * kick_spd
			velocity.z = kick_dir.z * kick_spd
			velocity.y = 10.4
			last_wall_normal = wall_normal
			move_state = MoveState.AIR
			jump_buffer_timer = 0.0
			fov_punch = minf(9.0, fov_punch + 3.5)
		elif on_floor or coyote_timer > 0.0:
			velocity.y = JUMP_VELOCITY
			if move_state == MoveState.SLIDE and get_horizontal_speed() > 4.0:
				var horiz_dir := Vector3(velocity.x, 0.0, velocity.z).normalized()
				velocity += horiz_dir * 2.8
			coyote_timer = 0.0
			jump_buffer_timer = 0.0
			move_state = MoveState.AIR

	if on_floor and velocity.y <= 0.1:
		if crouch_held and get_horizontal_speed() >= 5.2:
			if move_state != MoveState.SLIDE:
				move_state = MoveState.SLIDE
				if slide_boost_cd <= 0.0:
					var boost_dir := wish_dir if wish_dir.length_squared() > 0.1 else forward_vec
					var boost_amt := SLIDE_IMPULSE * (1.0 + float(game_main.player_stats.get("slide_boost_pct", 0.0)))
					velocity.x += boost_dir.x * boost_amt
					velocity.z += boost_dir.z * boost_amt
					slide_boost_cd = 0.65
					fov_punch = minf(9.0, fov_punch + 3.5)
			_apply_slide_physics(dt)
		else:
			move_state = MoveState.RUN if wish_dir.length_squared() > 0.05 else MoveState.IDLE
			if grounded_ticks > 2:
				_apply_ground_friction(dt)
			_accelerate(wish_dir, run_wish_speed, GROUND_ACCEL, dt)
	else:
		if in_fwd > 0.2 and _try_ledge_mantle(forward_vec):
			_update_camera_and_viewmodel(dt, wish_dir)
			return

		if _check_wall_run(forward_vec):
			if move_state != MoveState.WALL_RUN:
				move_state = MoveState.WALL_RUN
				wall_run_timer = 0.0
				velocity.y = maxf(velocity.y * 0.35, 1.8)
			wall_run_timer += dt
			var horiz_v := Vector3(velocity.x, 0.0, velocity.z)
			var tangent := (horiz_v - wall_normal * horiz_v.dot(wall_normal)).normalized()
			if tangent.length_squared() < 0.01:
				tangent = (forward_vec - wall_normal * forward_vec.dot(wall_normal)).normalized()
			var w_speed := maxf(get_horizontal_speed(), 15.0 * speed_mult)
			velocity.x = tangent.x * w_speed - wall_normal.x * 1.8
			velocity.z = tangent.z * w_speed - wall_normal.z * 1.8
			var ratio := wall_run_timer / WALL_RUN_MAX_TIME
			velocity.y = 1.8 - 8.5 * ratio * ratio
			if wall_run_timer >= WALL_RUN_MAX_TIME or crouch_held:
				last_wall_normal = wall_normal
				move_state = MoveState.AIR
		else:
			move_state = MoveState.AIR
			_accelerate(wish_dir, run_wish_speed, 2.8, dt)
			if absf(in_right) > 0.1 and absf(in_fwd) < 0.1:
				_accelerate(wish_dir, 2.5, 36.0, dt)
			velocity.y -= GRAVITY * dt

	var h_spd := get_horizontal_speed()
	var soft_cap := 28.0 * speed_mult
	if h_spd > soft_cap:
		var drag := 1.0 - 0.85 * ((h_spd - soft_cap) / soft_cap) * dt
		velocity.x *= drag
		velocity.z *= drag

	var target_h := 0.95 if move_state == MoveState.SLIDE else 1.80
	capsule.height = lerpf(capsule.height, target_h, minf(1.0, dt * 18.0))
	col_shape.position.y = capsule.height * 0.5

	move_and_slide()

	_tick_combat(dt)
	_update_camera_and_viewmodel(dt, wish_dir)


func _apply_ground_friction(dt: float) -> void:
	var spd := get_horizontal_speed()
	if spd < 0.15:
		velocity.x = 0.0
		velocity.z = 0.0
		return
	var control := maxf(spd, STOP_SPEED)
	var new_spd := maxf(0.0, spd - control * GROUND_FRICTION * dt)
	velocity.x *= new_spd / spd
	velocity.z *= new_spd / spd


func _accelerate(wish_dir: Vector3, wish_speed: float, accel: float, dt: float) -> void:
	if wish_dir.length_squared() < 0.001:
		return
	var current_proj := velocity.x * wish_dir.x + velocity.z * wish_dir.z
	var add_speed := wish_speed - current_proj
	if add_speed <= 0.0:
		return
	var accel_speed := minf(add_speed, accel * wish_speed * dt)
	velocity.x += accel_speed * wish_dir.x
	velocity.z += accel_speed * wish_dir.z


func _apply_slide_physics(dt: float) -> void:
	velocity.x *= (1.0 - SLIDE_FRICTION * dt)
	velocity.z *= (1.0 - SLIDE_FRICTION * dt)
	if is_on_floor():
		var n := get_floor_normal()
		if n.y < 0.99:
			var down_slope := (Vector3.DOWN - n * Vector3.DOWN.dot(n)).normalized()
			velocity += down_slope * (38.0 * (1.0 - n.y) * dt)


func _check_wall_run(fwd: Vector3) -> bool:
	if get_horizontal_speed() < WALL_RUN_MIN_SPEED:
		return false
	var space := get_world_3d().direct_space_state
	var origin := global_position + Vector3(0, 1.0, 0)
	var right := Vector3(-fwd.z, 0, fwd.x)
	var dirs: Array[Vector3] = [-right, (-right + fwd * 0.4).normalized(), right, (right + fwd * 0.4).normalized()]
	for d in dirs:
		var query := PhysicsRayQueryParameters3D.create(origin, origin + d * 0.95)
		query.exclude = [get_rid()]
		var hit: Dictionary = space.intersect_ray(query)
		if not hit.is_empty():
			var n: Vector3 = hit["normal"]
			if absf(n.y) < 0.25 and absf(fwd.dot(n)) < 0.82:
				if last_wall_normal.length_squared() < 0.1 or n.dot(last_wall_normal) < 0.90:
					wall_normal = n
					return true
	return false


func _try_ledge_mantle(fwd: Vector3) -> bool:
	var space := get_world_3d().direct_space_state
	var chest_org := global_position + Vector3(0, 1.05, 0)
	var head_org := global_position + Vector3(0, 2.05, 0)

	var q_low := PhysicsRayQueryParameters3D.create(chest_org, chest_org + fwd * 0.95)
	q_low.exclude = [get_rid()]
	if space.intersect_ray(q_low).is_empty():
		return false

	var q_high := PhysicsRayQueryParameters3D.create(head_org, head_org + fwd * 0.95)
	q_high.exclude = [get_rid()]
	if not space.intersect_ray(q_high).is_empty():
		return false

	var probe_top := head_org + fwd * 0.70
	var q_down := PhysicsRayQueryParameters3D.create(probe_top, probe_top + Vector3(0, -1.2, 0))
	q_down.exclude = [get_rid()]
	var down_hit: Dictionary = space.intersect_ray(q_down)
	if not down_hit.is_empty():
		var dn: Vector3 = down_hit["normal"]
		if dn.y > 0.7:
			move_state = MoveState.MANTLE
			mantle_timer = 0.16
			var dp: Vector3 = down_hit["position"]
			mantle_target = dp + Vector3(0, 0.1, 0)
			return true
	return false


func _tick_combat(dt: float) -> void:
	if is_reloading:
		reload_timer -= dt
		if reload_timer <= 0.0:
			is_reloading = false
			ammo = max_ammo

	if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and fire_cooldown <= 0.0 and not is_reloading and not hammer_smash_pending:
		_execute_primary_attack()

	if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT) and alt_cooldown <= 0.0 and not hammer_smash_pending:
		_execute_secondary_attack()


func trigger_jump_input() -> void:
	jump_buffer_timer = 0.12


func trigger_reload_or_flourish() -> void:
	if max_ammo <= 0:
		swing_anim_timer = 0.22
		swing_tilt_deg = 2.8 * swing_dir_sign
		_play_weapon_sfx(1.08)
		return
	if not is_reloading and ammo < max_ammo:
		is_reloading = true
		reload_timer = 0.85
		reload_window_used = false
	elif is_reloading and not reload_window_used:
		if reload_timer >= 0.30 and reload_timer <= 0.62:
			is_reloading = false
			ammo = max_ammo
			speed_buff_timer = 2.5
			fov_punch = minf(9.0, fov_punch + 3.5)
			_play_weapon_sfx(1.15)


func trigger_quick_melee() -> void:
	if quick_melee_cd > 0.0 or game_main == null:
		return
	quick_melee_cd = 0.45
	boot_kick_timer = 0.30
	swing_anim_timer = 0.22
	fov_punch = minf(9.0, fov_punch + 4.0)
	recoil_pitch_kick = maxf(recoil_pitch_kick, 0.045)
	_play_weapon_sfx(0.92)
	game_main.resolve_quick_melee_or_execution(move_state == MoveState.SLIDE)


func _execute_primary_attack() -> void:
	var rate_mult := 1.0 + maxf(-0.5, float(game_main.player_stats.get("fire_rate_pct", 0.0)))
	fire_cooldown = float(weapon_cfg["fire_interval"]) / rate_mult
	swing_dir_sign = -swing_dir_sign
	_play_weapon_sfx(randf_range(0.95, 1.05))

	var cat := String(weapon_cfg["category"])
	if cat == "HYBRID_EXPUNGE":
		# LEFT HAND ONLY: Thrust/Throw Iron Stake forward + pull new stake from belt bandolier!
		left_throw_duration = minf(0.28, maxf(0.16, fire_cooldown * 0.92))
		left_throw_timer = left_throw_duration
		fov_punch = minf(9.0, fov_punch + 2.5)
		recoil_pitch_kick = minf(0.14, recoil_pitch_kick + 0.032)
		swing_tilt_deg = -2.2
		trauma = minf(1.0, trauma + 0.16)
		var cam_org: Vector3 = camera.global_position
		var cam_fwd: Vector3 = -camera.global_transform.basis.z
		var cam_left: Vector3 = -camera.global_transform.basis.x
		var stake_count := 1 + int(game_main.player_stats.get("stake_bonus_count", 0.0))
		for s_i in range(stake_count):
			var dir := cam_fwd
			if stake_count > 1:
				var spread_rad := deg_to_rad((float(s_i) - 0.5) * 3.5)
				dir = dir.rotated(Vector3.UP, spread_rad)
			# Spawn from the Left Hand position!
			game_main.spawn_player_stake_projectile(cam_org + cam_left * 0.24 + Vector3(0, -0.10, 0) + dir * 0.45, dir * 46.0)
	elif cat == "MELEE":
		swing_anim_timer = minf(0.28, fire_cooldown * 0.85)
		slash_ribbon_timer = 0.11
		slash_ribbon_inst.visible = true
		slash_ribbon_inst.rotation.z = deg_to_rad(18.0 * swing_dir_sign)
		var eff_reach := get_effective_melee_reach()
		slash_ribbon_inst.scale = Vector3(eff_reach / 2.2, 1.0, 1.0)
		fov_punch = minf(9.0, fov_punch + 3.5)
		swing_tilt_deg = 3.2 * swing_dir_sign
		recoil_pitch_kick = minf(0.14, recoil_pitch_kick + 0.025)
		trauma = minf(1.0, trauma + 0.24)
		game_main.resolve_melee_sector_attack(weapon_cfg, eff_reach, false)
	else:
		if ammo <= 0:
			trigger_reload_or_flourish()
			return
		ammo -= 1
		swing_anim_timer = minf(0.24, fire_cooldown * 0.85)
		dual_pistol_alt_side = not dual_pistol_alt_side
		var is_shotgun := (equipped_weapon_id == "trench_shotgun")
		fov_punch = minf(10.0, fov_punch + (6.8 if is_shotgun else 2.8))
		recoil_pitch_kick = minf(0.22, recoil_pitch_kick + (0.095 if is_shotgun else 0.035))
		trauma = minf(1.0, trauma + (0.52 if is_shotgun else 0.20))
		game_main.resolve_ballistic_attack(weapon_cfg, false)
		if ammo <= 0:
			trigger_reload_or_flourish()


func _execute_secondary_attack() -> void:
	var cat := String(weapon_cfg["category"])
	if cat == "HYBRID_EXPUNGE":
		# RIGHT HAND ONLY: Occult War-Hammer Heavy Overhead Wind-up -> Expunge Detonation!
		alt_cooldown = 0.72
		hammer_windup_timer = 0.14
		hammer_smash_pending = true
		recoil_pitch_kick = -0.06 # Camera lifts slightly during overhead wind-up
		return

	if blood_gauge < 20.0:
		return
	blood_gauge -= 20.0
	alt_cooldown = 0.90
	swing_anim_timer = 0.32
	fov_punch = minf(10.0, fov_punch + 6.5)
	recoil_pitch_kick = minf(0.22, recoil_pitch_kick + 0.085)
	trauma = minf(1.0, trauma + 0.45)
	_play_weapon_sfx(0.88)

	if equipped_weapon_id == "trench_shotgun" and not is_on_floor():
		var look_dir := -camera.global_transform.basis.z
		velocity += -look_dir * 14.5
		velocity.y = maxf(velocity.y, 11.2)

	if cat == "MELEE":
		slash_ribbon_timer = 0.16
		slash_ribbon_inst.visible = true
		swing_tilt_deg = 4.5 * swing_dir_sign
		var eff_reach := get_effective_melee_reach() * 1.25
		game_main.resolve_melee_sector_attack(weapon_cfg, eff_reach, true)
	else:
		game_main.resolve_ballistic_attack(weapon_cfg, true)


func _complete_war_hammer_expunge_smash() -> void:
	right_slam_timer = 0.34
	slash_ribbon_timer = 0.16
	slash_ribbon_inst.visible = true
	slash_ribbon_inst.rotation.z = deg_to_rad(78.0) # Overhead vertical smash arc
	fov_punch = minf(11.0, fov_punch + 8.0)
	recoil_pitch_kick = 0.15 # Violent camera kick on hammer smash!
	swing_tilt_deg = -5.2
	trauma = minf(1.0, trauma + 0.72)
	if hammer_sfx_player != null and hammer_sfx_player.stream != null:
		hammer_sfx_player.pitch_scale = randf_range(0.94, 1.04)
		hammer_sfx_player.play()
	game_main.resolve_war_hammer_expunge_smash(weapon_cfg, get_effective_melee_reach())


func _play_weapon_sfx(pitch_center: float = 1.0) -> void:
	if sfx_player != null and sfx_player.stream != null:
		sfx_player.pitch_scale = pitch_center * randf_range(0.95, 1.05)
		sfx_player.play()


func play_parry_clang() -> void:
	if parry_sfx_player != null and parry_sfx_player.stream != null:
		parry_sfx_player.pitch_scale = randf_range(0.96, 1.06)
		parry_sfx_player.play()


func _update_camera_and_viewmodel(dt: float, _wish_dir: Vector3) -> void:
	var target_eye := 0.82 if move_state == MoveState.SLIDE else 1.65
	current_eye_height = lerpf(current_eye_height, target_eye, minf(1.0, dt * 16.0))
	camera_holder.position.y = current_eye_height

	# Camera Roll (Wall-Run ±12°, Slide -4.5°, + Melee Swing Tilt)
	swing_tilt_deg = lerpf(swing_tilt_deg, 0.0, minf(1.0, dt * 14.0))
	recoil_pitch_kick = lerpf(recoil_pitch_kick, 0.0, minf(1.0, dt * 15.0))
	var target_tilt := swing_tilt_deg
	if move_state == MoveState.WALL_RUN:
		var right_v := global_transform.basis.x
		var side := signf(right_v.dot(wall_normal))
		target_tilt += side * 12.0
	elif move_state == MoveState.SLIDE:
		target_tilt += -4.5
	current_tilt_deg = lerpf(current_tilt_deg, target_tilt, minf(1.0, dt * 12.0))

	trauma = maxf(0.0, trauma - 2.2 * dt)
	var shake_mag := trauma * trauma * 0.048
	var shake_pitch := sin(Time.get_ticks_msec() * 0.075) * shake_mag
	var shake_yaw := cos(Time.get_ticks_msec() * 0.095) * shake_mag

	camera.rotation.x = clampf(pitch + recoil_pitch_kick + shake_pitch, deg_to_rad(-88.0), deg_to_rad(88.0))
	camera.rotation.y = shake_yaw
	camera.rotation.z = deg_to_rad(current_tilt_deg)

	fov_punch = lerpf(fov_punch, 0.0, minf(1.0, dt * 11.0))
	var h_spd := get_horizontal_speed()
	var vel_fov := 18.0 * clampf((h_spd - BASE_RUN_SPEED) / 16.0, 0.0, 1.0)
	camera.fov = lerpf(camera.fov, 95.0 + vel_fov + fov_punch, minf(1.0, dt * 14.0))

	# Show 3D Boots during Ground Slide or Quick Melee Blood-Kick!
	var show_boots := (move_state == MoveState.SLIDE) or (boot_kick_timer > 0.0)
	boots_pivot.visible = show_boots
	if show_boots:
		var kick_ext := sin((boot_kick_timer / 0.30) * PI) * 0.42 if boot_kick_timer > 0.0 else 0.0
		boots_pivot.position = Vector3(0.0, -0.46, -0.22 - kick_ext)

	if is_on_floor() and h_spd > 1.5 and move_state == MoveState.RUN:
		bob_time += dt * minf(15.0, h_spd * 1.05)
	var bob_x := sin(bob_time) * 0.016
	var bob_y := absf(cos(bob_time)) * -0.015

	if slash_ribbon_timer > 0.0:
		slash_ribbon_timer -= dt
		if slash_ribbon_timer <= 0.0:
			slash_ribbon_inst.visible = false

	# =========================================================================
	# SEPARATE DUAL-WIELD HANDS ANIMATION (Stake & Hammer / Dual Jackals / Melee)
	# =========================================================================
	if equipped_weapon_id == "stake_and_hammer":
		# 1. LEFT HAND (Iron Stake Aiming, Forward Throw & Belt Bandolier Reload):
		if left_throw_timer > 0.0:
			var prog: float = 1.0 - (left_throw_timer / maxf(0.01, left_throw_duration))
			if prog < 0.36:
				# Phase 1: Quick forward thrust & release
				var p1: float = prog / 0.36
				left_weapon_inst.visible = true
				left_arm_pivot.position = Vector3(-0.24 + 0.08 * p1, -0.20 + 0.05 * p1, -0.44 - 0.32 * p1)
				left_arm_pivot.rotation_degrees = Vector3(-28.0 * p1, -12.0 * p1, 0.0)
			elif prog < 0.68:
				# Phase 2: Stake is in flight; left hand dips down to waist belt bandolier
				var p2: float = (prog - 0.36) / 0.32
				left_weapon_inst.visible = (p2 > 0.55)
				left_arm_pivot.position = Vector3(-0.28, -0.22 - 0.28 * sin(p2 * PI), -0.36)
				left_arm_pivot.rotation_degrees = Vector3(38.0 * sin(p2 * PI), 15.0, -18.0)
			else:
				# Phase 3: Bring new iron stake from bandolier up into aiming grip
				var p3: float = (prog - 0.68) / 0.32
				left_weapon_inst.visible = true
				left_arm_pivot.position = Vector3(-0.28, lerpf(-0.42, -0.24, p3), lerpf(-0.34, -0.44, p3))
				left_arm_pivot.rotation_degrees = Vector3(lerpf(25.0, 4.0, p3), 0.0, 0.0)
		else:
			left_weapon_inst.visible = true
			left_arm_pivot.position = left_arm_pivot.position.lerp(Vector3(-0.28 - bob_x, -0.24 + bob_y, -0.44), minf(1.0, dt * 15.0))
			left_arm_pivot.rotation_degrees = left_arm_pivot.rotation_degrees.lerp(Vector3(4.0, -6.0, 4.0), minf(1.0, dt * 15.0))

		# 2. RIGHT HAND (Occult War-Hammer Ready Grip, Overhead Wind-up & Violent Slam):
		if hammer_smash_pending:
			# Deliberate heavy overhead wind-up!
			right_arm_pivot.position = right_arm_pivot.position.lerp(Vector3(0.24, 0.16, -0.26), minf(1.0, dt * 24.0))
			right_arm_pivot.rotation_degrees = right_arm_pivot.rotation_degrees.lerp(Vector3(56.0, -14.0, 18.0), minf(1.0, dt * 24.0))
		elif right_slam_timer > 0.0:
			var s_norm: float = right_slam_timer / 0.34
			var slam_arc: float = sin((1.0 - s_norm) * PI)
			right_arm_pivot.position = Vector3(0.22 - 0.10 * slam_arc, -0.24 - 0.22 * slam_arc, -0.44 - 0.24 * slam_arc)
			right_arm_pivot.rotation_degrees = Vector3(-68.0 * slam_arc, 16.0 * slam_arc, -18.0 * slam_arc)
		else:
			right_arm_pivot.position = right_arm_pivot.position.lerp(Vector3(0.28 + bob_x, -0.22 + bob_y, -0.40), minf(1.0, dt * 14.0))
			right_arm_pivot.rotation_degrees = right_arm_pivot.rotation_degrees.lerp(Vector3(12.0, 6.0, -6.0), minf(1.0, dt * 14.0))

	elif equipped_weapon_id == "jackal_and_casull":
		# Alternating Left/Right Dual-Wield 13mm Handcannon Recoil!
		var kick_t: float = (swing_anim_timer / 0.24) if swing_anim_timer > 0.0 else 0.0
		if swing_anim_timer > 0.0:
			swing_anim_timer = maxf(0.0, swing_anim_timer - dt)
		var l_kick: float = kick_t if dual_pistol_alt_side else 0.0
		var r_kick: float = kick_t if not dual_pistol_alt_side else 0.0

		left_arm_pivot.position = Vector3(-0.26 - bob_x, -0.24 + bob_y + 0.05 * l_kick, -0.42 + 0.12 * l_kick)
		left_arm_pivot.rotation_degrees = Vector3(24.0 * l_kick, 0.0, 0.0)

		right_arm_pivot.position = Vector3(0.26 + bob_x, -0.24 + bob_y + 0.05 * r_kick, -0.42 + 0.12 * r_kick)
		right_arm_pivot.rotation_degrees = Vector3(24.0 * r_kick, 0.0, 0.0)

	else:
		# Melee (Sword / Scythe) or Trench Coach-Gun
		if swing_anim_timer > 0.0:
			swing_anim_timer = maxf(0.0, swing_anim_timer - dt)
			var t_norm: float = swing_anim_timer / 0.26
			var cat: String = String(weapon_cfg.get("category", "MELEE"))
			if cat == "MELEE":
				var sw: float = sin(t_norm * PI)
				right_arm_pivot.position = Vector3(0.24 - 0.30 * sw * swing_dir_sign, -0.24, -0.48 - 0.16 * sw)
				right_arm_pivot.rotation_degrees = Vector3(-42.0 * sw, 42.0 * sw * swing_dir_sign, -28.0 * swing_dir_sign)
				left_arm_pivot.position = Vector3(-0.18 - 0.18 * sw * swing_dir_sign, -0.28, -0.42 - 0.10 * sw)
				left_arm_pivot.rotation_degrees = Vector3(-20.0 * sw, 20.0 * sw * swing_dir_sign, 0.0)
			else:
				right_arm_pivot.position = Vector3(0.24 + bob_x, -0.24 + bob_y + 0.06 * t_norm, -0.34 + 0.13 * t_norm)
				right_arm_pivot.rotation_degrees = Vector3(22.0 * t_norm, 0.0, 0.0)
				left_arm_pivot.position = Vector3(-0.12 + bob_x, -0.26 + bob_y + 0.05 * t_norm, -0.52 + 0.12 * t_norm)
				left_arm_pivot.rotation_degrees = Vector3(18.0 * t_norm, 22.0, 0.0)
		else:
			right_arm_pivot.position = right_arm_pivot.position.lerp(Vector3(0.26 + bob_x, -0.26 + bob_y, -0.42), minf(1.0, dt * 14.0))
			right_arm_pivot.rotation_degrees = right_arm_pivot.rotation_degrees.lerp(Vector3.ZERO, minf(1.0, dt * 14.0))
			left_arm_pivot.position = left_arm_pivot.position.lerp(Vector3(-0.16 - bob_x, -0.28 + bob_y, -0.48), minf(1.0, dt * 14.0))
			left_arm_pivot.rotation_degrees = left_arm_pivot.rotation_degrees.lerp(Vector3(0.0, 18.0, 0.0), minf(1.0, dt * 14.0))
