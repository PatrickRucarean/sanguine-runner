extends Node3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")
const DataCatalog = preload("res://scripts/DataCatalog.gd")

var archetype_id: String = "catacomb_ghoul"
var role: String = "FODDER"
var display_name: String = "Catacomb Ghoul"

var max_hp: float = 45.0
var hp: float = 45.0
var max_poise: float = 25.0
var poise: float = 25.0
var move_speed: float = 3.4
var contact_damage: float = 12.0
var attack_range: float = 1.85
var preferred_dist: float = 0.0
var projectile_speed: float = 10.5
var vitae_value: float = 14.0

var is_armored: bool = false
var is_elite: bool = false
var is_staggered: bool = false
var stagger_timer: float = 0.0
var is_bowling: bool = false
var bowling_timer: float = 0.0

var bleed_stacks: int = 0
var bleed_tick_timer: float = 0.0

var velocity: Vector3 = Vector3.ZERO
var boid_push: Vector3 = Vector3.ZERO
var attack_cooldown: float = 1.2
var leap_cooldown: float = 2.0
var anim_phase: float = 0.0
var hit_flash_timer: float = 0.0

var mesh_inst: MeshInstance3D = null
var base_material: StandardMaterial3D = null
var flash_material: StandardMaterial3D = null
var stagger_material: StandardMaterial3D = null


func setup_from_catalog(arch_id: String, pacing: Dictionary, elite_roll: bool) -> void:
	archetype_id = arch_id
	var cfg: Dictionary = DataCatalog.ENEMIES.get(arch_id, DataCatalog.ENEMIES["catacomb_ghoul"])
	role = String(cfg["role"])
	display_name = String(cfg["name"])
	is_elite = elite_roll

	var elite_hp_mult := 2.1 if is_elite else 1.0
	var elite_spd_mult := 1.15 if is_elite else 1.0

	max_hp = float(cfg["base_hp"]) * float(pacing["hp_mult"]) * elite_hp_mult
	hp = max_hp
	max_poise = float(cfg["poise"]) * (1.4 if is_elite else 1.0)
	poise = max_poise
	move_speed = float(cfg["base_speed"]) * float(pacing["speed_mult"]) * elite_spd_mult
	contact_damage = float(cfg["damage"]) * float(pacing["dmg_mult"])
	attack_range = float(cfg["attack_range"])
	preferred_dist = float(cfg.get("preferred_dist", 0.0))
	projectile_speed = float(cfg.get("projectile_speed", 10.5))
	vitae_value = float(cfg["vitae_drop"]) * float(pacing["vitae_mult"]) * (2.5 if is_elite else 1.0)
	is_armored = bool(cfg.get("armored", false))

	is_staggered = false
	is_bowling = false
	bleed_stacks = 0
	velocity = Vector3.ZERO
	anim_phase = randf() * TAU
	attack_cooldown = randf_range(0.8, 1.8)
	leap_cooldown = randf_range(1.2, 2.6)

	var tint := Color(1.35, 0.55, 0.55) if is_elite else Color.WHITE
	var emis := Color(0.85, 0.05, 0.12) if is_elite else Color.BLACK
	var emis_e := 0.45 if is_elite else 0.0

	base_material = RetroAssetLoader.make_retro_material(
		String(cfg["tex_path"]), Vector3.ONE, tint, emis, emis_e
	)
	flash_material = RetroAssetLoader.make_retro_material(
		String(cfg["tex_path"]), Vector3.ONE, Color(2.0, 0.25, 0.25), Color(1.0, 0.1, 0.1), 1.4
	)
	stagger_material = RetroAssetLoader.make_retro_material(
		String(cfg["tex_path"]), Vector3.ONE, Color(1.8, 1.45, 0.25), Color(1.0, 0.8, 0.05), 1.1
	)

	if mesh_inst == null:
		mesh_inst = MeshInstance3D.new()
		add_child(mesh_inst)

	mesh_inst.mesh = RetroAssetLoader.load_obj_mesh(String(cfg["obj_path"]), base_material)
	mesh_inst.material_override = base_material
	var base_scale: Vector3 = cfg["scale"]
	scale = base_scale * (1.18 if is_elite else 1.0)


func tick_ai(dt: float, player_pos: Vector3, game_main: Node) -> void:
	anim_phase += dt * (move_speed * 1.65)
	if hit_flash_timer > 0.0:
		hit_flash_timer -= dt
		if hit_flash_timer <= 0.0 and mesh_inst != null:
			mesh_inst.material_override = stagger_material if is_staggered else base_material

	if bleed_stacks > 0:
		bleed_tick_timer -= dt
		if bleed_tick_timer <= 0.0:
			bleed_tick_timer = 0.45 / maxf(1.0, float(game_main.player_stats.get("bleed_rate_mult", 1.0)))
			var bleed_dmg := float(bleed_stacks) * 9.5 * (1.0 + float(game_main.player_stats.get("bleed_damage", 0.0)))
			game_main.damage_enemy(self, bleed_dmg, false, false, position + Vector3(0, 1.4, 0), false)
			if hp <= 0.0:
				return

	if is_staggered:
		stagger_timer -= dt
		if stagger_timer <= 0.0:
			is_staggered = false
			poise = max_poise * 0.65
			if mesh_inst != null:
				mesh_inst.material_override = base_material

	if is_bowling:
		bowling_timer -= dt
		position += velocity * dt
		velocity = velocity.move_toward(Vector3.ZERO, 22.0 * dt)
		rotation.x += dt * 12.0
		game_main.check_bowling_impact(self)
		if bowling_timer <= 0.0 or velocity.length() < 2.0:
			is_bowling = false
			rotation.x = 0.0
		_clamp_to_catacomb_bounds()
		return

	var to_player := player_pos - position
	var horiz_to_player := Vector3(to_player.x, 0.0, to_player.z)
	var dist := horiz_to_player.length()
	var dir := horiz_to_player / maxf(0.001, dist)

	if dist > 0.15:
		var target_yaw := atan2(-dir.x, -dir.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, minf(1.0, dt * 10.0))

	if is_staggered:
		velocity = velocity.move_toward(Vector3.ZERO, 18.0 * dt)
		position += velocity * dt
		_clamp_to_catacomb_bounds()
		return

	attack_cooldown -= dt
	leap_cooldown -= dt

	match role:
		"FODDER", "BRUISER":
			var wish_vel := (dir + boid_push * 0.65).normalized() * move_speed
			velocity.x = move_toward(velocity.x, wish_vel.x, 18.0 * dt)
			velocity.z = move_toward(velocity.z, wish_vel.z, 18.0 * dt)
			if mesh_inst != null:
				mesh_inst.rotation.z = sin(anim_phase) * (0.14 if role == "FODDER" else 0.06)
				mesh_inst.position.y = absf(cos(anim_phase)) * 0.09
			if dist <= attack_range and absf(player_pos.y - position.y) < 2.2 and attack_cooldown <= 0.0:
				attack_cooldown = 1.15
				game_main.damage_player(contact_damage, position)

		"RANGED", "BOSS":
			var move_factor := 1.0
			if role == "RANGED":
				if dist < preferred_dist * 0.75:
					move_factor = -0.75
				elif dist < preferred_dist * 1.15:
					move_factor = 0.15
			var strafe := Vector3(-dir.z, 0.0, dir.x) * sin(anim_phase * 0.4) * 0.55
			var wish_vel := (dir * move_factor + strafe + boid_push * 0.5).normalized() * move_speed
			velocity.x = move_toward(velocity.x, wish_vel.x, 14.0 * dt)
			velocity.z = move_toward(velocity.z, wish_vel.z, 14.0 * dt)
			if mesh_inst != null:
				mesh_inst.position.y = 0.08 * sin(anim_phase * 0.8)
				mesh_inst.rotation.z = sin(anim_phase * 0.5) * 0.05

			if attack_cooldown <= 0.0 and dist < attack_range:
				attack_cooldown = 2.45 if role == "RANGED" else 1.85
				var muzzle_pos := position + Vector3(0.0, 1.55, 0.0) + dir * 0.5
				var aim_target := player_pos + Vector3(0.0, 1.05, 0.0)
				var shot_dir := (aim_target - muzzle_pos).normalized()
				if role == "BOSS":
					for ang_deg in [-14.0, 0.0, 14.0]:
						var rot_dir := shot_dir.rotated(Vector3.UP, deg_to_rad(ang_deg))
						game_main.spawn_cultist_projectile(muzzle_pos, rot_dir * projectile_speed, contact_damage * 0.75)
				else:
					game_main.spawn_cultist_projectile(muzzle_pos, shot_dir * projectile_speed, contact_damage)
			elif role == "BOSS" and dist <= 3.1 and attack_cooldown <= 0.9:
				attack_cooldown = 1.6
				game_main.damage_player(contact_damage, position)

		"STALKER":
			var wish_vel := (dir + boid_push * 0.45).normalized() * move_speed
			velocity.x = move_toward(velocity.x, wish_vel.x, 26.0 * dt)
			velocity.z = move_toward(velocity.z, wish_vel.z, 26.0 * dt)

			var near_wall := (absf(absf(position.x) - 12.0) < 2.8 or absf(position.x) > 31.0 or absf(position.z) > 31.0)
			if leap_cooldown <= 0.0 and (near_wall or (dist > 5.0 and dist < 13.5)) and position.y <= 0.5:
				leap_cooldown = 2.8
				velocity = dir * (move_speed * 1.55) + Vector3(0.0, 9.2, 0.0)

			if mesh_inst != null:
				mesh_inst.rotation.x = clampf(velocity.y * 0.04, -0.35, 0.35)
				mesh_inst.position.y = absf(sin(anim_phase * 1.3)) * 0.14

			if dist <= attack_range and absf(player_pos.y - position.y) < 2.2 and attack_cooldown <= 0.0:
				attack_cooldown = 0.85
				game_main.damage_player(contact_damage, position)

	if position.y > 0.0 or velocity.y > 0.0:
		velocity.y -= 24.0 * dt
	position += velocity * dt
	if position.y < 0.0:
		position.y = 0.0
		velocity.y = 0.0

	_clamp_to_catacomb_bounds()


func trigger_hit_flash() -> void:
	hit_flash_timer = 0.08
	if mesh_inst != null and flash_material != null:
		mesh_inst.material_override = flash_material


func trigger_stagger() -> void:
	is_staggered = true
	stagger_timer = 2.8
	if mesh_inst != null and stagger_material != null:
		mesh_inst.material_override = stagger_material


func _clamp_to_catacomb_bounds() -> void:
	position.x = clampf(position.x, -33.5, 33.5)
	position.z = clampf(position.z, -33.5, 33.5)
