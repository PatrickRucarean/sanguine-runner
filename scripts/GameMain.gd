extends Node3D

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")
const DataCatalog = preload("res://scripts/DataCatalog.gd")
const CatacombArenaBuilderScript = preload("res://scripts/CatacombArenaBuilder.gd")
const PlayerControllerScript = preload("res://scripts/PlayerController.gd")
const EnemyActorScript = preload("res://scripts/EnemyActor.gd")

enum GamePhase { LOADOUT_SELECT, ACTIVE_WAVE, BLOOD_ALTAR, GAME_OVER }

var phase: GamePhase = GamePhase.LOADOUT_SELECT
var selected_char_id: String = "tepes_aristocrat"
var selected_weapon_id: String = "alucard_sword"
var selected_danger_tier: int = 0
var selected_zone_idx: int = 0

var player_stats: Dictionary = {}
var player_hp: float = 100.0
var player_max_hp: float = 100.0
var blood_barrier: float = 0.0
var vitae_essence: int = 0
var total_kills: int = 0

var current_wave: int = 1
var wave_pacing: Dictionary = {}
var wave_enemies_to_spawn: int = 6
var wave_enemies_spawned: int = 0
var wave_enemies_killed: int = 0
var spawn_timer: float = 0.8
var active_enemies: Array = []
var boid_tick_counter: int = 0

var hitstop_timer: float = 0.0
var damage_flash_alpha: float = 0.0
var status_banner_text: String = ""
var status_banner_timer: float = 0.0

var arena_builder: Node3D = null
var player: CharacterBody3D = null
var entities_root: Node3D = null
var pools_root: Node3D = null
var gib_sfx_player: AudioStreamPlayer = null
var orb_sfx_player: AudioStreamPlayer = null

const MAX_PROJECTILES: int = 96
var proj_pool: Array[Dictionary] = []

const MAX_ORBS: int = 180
var orb_pool: Array[Dictionary] = []

const MAX_GIBS: int = 160
var gib_pool: Array[Dictionary] = []

const MAX_DMG_LABELS: int = 32
var dmg_label_pool: Array[Dictionary] = []

var familiar_nodes: Array[MeshInstance3D] = []
var familiar_time: float = 0.0

var blood_dice: int = 2
var blood_dice_max: int = 8
var paid_rerolls_this_wave: int = 0
var pity_counter: int = 0
var altar_slots: Array[Dictionary] = []
var altar_session_ban: Dictionary = {}

var ui_layer: CanvasLayer = null
var hud_root: Control = null
var loadout_panel: PanelContainer = null
var altar_panel: PanelContainer = null
var gameover_panel: PanelContainer = null
var flash_rect: ColorRect = null

var lbl_hp_speed: Label = null
var lbl_wave_info: Label = null
var lbl_weapon_info: Label = null
var lbl_banner: Label = null
var lbl_loadout_summary: Label = null
var btn_weapons_box: HBoxContainer = null
var altar_header_lbl: Label = null
var altar_cards_box: HBoxContainer = null


func _ready() -> void:
	randomize()

	arena_builder = CatacombArenaBuilderScript.new()
	arena_builder.name = "CatacombArena"
	add_child(arena_builder)
	arena_builder.build_catacomb_arena(0)

	entities_root = Node3D.new()
	entities_root.name = "EntitiesRoot"
	add_child(entities_root)

	pools_root = Node3D.new()
	pools_root.name = "PoolsRoot"
	add_child(pools_root)

	player = PlayerControllerScript.new()
	player.name = "Player"
	player.game_main = self
	player.position = Vector3(0, 1.2, 14.0)
	add_child(player)

	gib_sfx_player = AudioStreamPlayer.new()
	gib_sfx_player.stream = RetroAssetLoader.load_wav("res://assets/audio/flesh_gib.wav")
	gib_sfx_player.volume_db = -3.0
	add_child(gib_sfx_player)

	orb_sfx_player = AudioStreamPlayer.new()
	orb_sfx_player.stream = RetroAssetLoader.load_wav("res://assets/audio/orb_pickup.wav")
	orb_sfx_player.volume_db = -6.0
	add_child(orb_sfx_player)

	_init_object_pools()
	_build_ui()
	_reset_player_stats()
	_show_loadout_screen()


func _init_object_pools() -> void:
	var proj_mat := StandardMaterial3D.new()
	proj_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	proj_mat.albedo_color = Color(1.0, 0.24, 0.08)
	var refl_mat := StandardMaterial3D.new()
	refl_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	refl_mat.albedo_color = Color(1.0, 0.88, 0.20)
	var proj_mesh := SphereMesh.new()
	proj_mesh.radius = 0.28
	proj_mesh.height = 0.56
	proj_mesh.radial_segments = 8
	proj_mesh.rings = 4

	for i in range(MAX_PROJECTILES):
		var mi := MeshInstance3D.new()
		mi.mesh = proj_mesh
		mi.material_override = proj_mat
		mi.visible = false
		pools_root.add_child(mi)
		proj_pool.append({
			"active": false,
			"reflected": false,
			"pos": Vector3.ZERO,
			"vel": Vector3.ZERO,
			"dmg": 15.0,
			"life": 0.0,
			"mesh": mi,
			"mat_enemy": proj_mat,
			"mat_refl": refl_mat
		})

	var orb_mat := StandardMaterial3D.new()
	orb_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	orb_mat.albedo_color = Color(0.95, 0.06, 0.16)
	var orb_mesh := PrismMesh.new()
	orb_mesh.size = Vector3(0.28, 0.36, 0.28)
	orb_mesh.material = orb_mat

	for i in range(MAX_ORBS):
		var mi := MeshInstance3D.new()
		mi.mesh = orb_mesh
		mi.visible = false
		pools_root.add_child(mi)
		orb_pool.append({
			"active": false,
			"pos": Vector3.ZERO,
			"vel": Vector3.ZERO,
			"val": 10.0,
			"harvest": false,
			"mesh": mi
		})

	var gib_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/ghoul_tex.png",
		Vector3.ONE,
		Color(0.95, 0.14, 0.18),
		Color(0.6, 0.02, 0.05),
		0.35
	)
	var gib_mesh := BoxMesh.new()
	gib_mesh.size = Vector3(0.24, 0.18, 0.22)
	gib_mesh.material = gib_mat

	for i in range(MAX_GIBS):
		var mi := MeshInstance3D.new()
		mi.mesh = gib_mesh
		mi.visible = false
		pools_root.add_child(mi)
		gib_pool.append({
			"active": false,
			"pos": Vector3.ZERO,
			"vel": Vector3.ZERO,
			"life": 0.0,
			"max_life": 1.3,
			"mesh": mi
		})


func _reset_player_stats() -> void:
	var c_cfg: Dictionary = DataCatalog.CHARACTERS.get(selected_char_id, DataCatalog.CHARACTERS["tepes_aristocrat"])
	var offs: Dictionary = c_cfg["offsets"]
	player_stats = {
		"max_hp": 100.0 + float(offs.get("max_hp", 0.0)),
		"armor": float(offs.get("armor", 0.0)),
		"move_speed_pct": float(offs.get("move_speed_pct", 0.0)),
		"slide_boost_pct": 0.0,
		"damage_mult": float(offs.get("damage_mult", 0.0)),
		"crit_chance": 0.10 + float(offs.get("crit_chance", 0.0)),
		"fire_rate_pct": float(offs.get("fire_rate_pct", 0.0)),
		"melee_reach_pct": float(offs.get("melee_reach_pct", 0.0)),
		"stagger_mult": float(offs.get("stagger_mult", 0.0)),
		"life_leech": float(offs.get("life_leech", 0.0)),
		"bleed_damage": 0.0,
		"bleed_rate_mult": 1.0,
		"magnet_radius_pct": 0.0,
		"vitae_mult": 0.0,
		"blood_nova_on_kill": 0.0,
		"sweet_spot_bonus": 0.0,
		"parry_heal": 6.0,
		"pierce_bonus": 0.0,
		"pellet_bonus": 0.0,
		"familiar_bats": 0.0,
		"familiar_skulls": 0.0,
		"familiar_wolves": 0.0
	}
	player_max_hp = float(player_stats["max_hp"])
	player_hp = player_max_hp
	blood_barrier = 0.0
	vitae_essence = 0
	total_kills = 0
	blood_dice = 2
	pity_counter = 0
	_rebuild_familiars()


func start_new_run() -> void:
	_reset_player_stats()
	player.position = Vector3(0, 1.2, 14.0)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.pitch = 0.0
	player.rotation = Vector3.ZERO
	player.equip_single_weapon(selected_weapon_id)

	loadout_panel.visible = false
	altar_panel.visible = false
	gameover_panel.visible = false
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

	_start_wave(1)


func _start_wave(wave_num: int) -> void:
	current_wave = wave_num
	wave_pacing = DataCatalog.get_wave_pacing(current_wave, selected_danger_tier)
	wave_enemies_to_spawn = int(wave_pacing["total_enemies"])
	wave_enemies_spawned = 0
	wave_enemies_killed = 0
	spawn_timer = 0.65
	paid_rerolls_this_wave = 0
	phase = GamePhase.ACTIVE_WAVE

	var pace_desc := "SLOW & ATMOSPHERIC CATACOMBS" if current_wave <= 3 else ("RISING BLOODLUST" if current_wave <= 7 else "BULLET-HEAVEN SLAUGHTER!")
	show_banner("WAVE %d — %s (%d FOES)" % [current_wave, pace_desc, wave_enemies_to_spawn], 2.8)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and phase == GamePhase.ACTIVE_WAVE and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		player.handle_mouse_motion(event.relative)
	elif event is InputEventMouseButton and event.pressed:
		if phase == GamePhase.ACTIVE_WAVE and Input.get_mouse_mode() != Input.MOUSE_MODE_CAPTURED:
			Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			if Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
				Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
			elif phase == GamePhase.ACTIVE_WAVE:
				Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

		if phase == GamePhase.LOADOUT_SELECT:
			if event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
				start_new_run()
		elif phase == GamePhase.ACTIVE_WAVE:
			if event.keycode == KEY_SPACE:
				player.trigger_jump_input()
			elif event.keycode == KEY_R:
				player.trigger_reload_or_flourish()
			elif event.keycode == KEY_F:
				player.trigger_quick_melee()
		elif phase == GamePhase.BLOOD_ALTAR:
			if event.alt_pressed:
				if event.keycode == KEY_1:
					_toggle_lock_altar_slot(0)
				elif event.keycode == KEY_2:
					_toggle_lock_altar_slot(1)
				elif event.keycode == KEY_3:
					_toggle_lock_altar_slot(2)
			else:
				if event.keycode == KEY_1:
					_select_altar_slot(0)
				elif event.keycode == KEY_2:
					_select_altar_slot(1)
				elif event.keycode == KEY_3:
					_select_altar_slot(2)
				elif event.keycode == KEY_Q:
					_reroll_altar_slot(0)
				elif event.keycode == KEY_W:
					_reroll_altar_slot(1)
				elif event.keycode == KEY_E:
					_reroll_altar_slot(2)
		elif phase == GamePhase.GAME_OVER:
			if event.keycode in [KEY_ENTER, KEY_SPACE, KEY_R]:
				_show_loadout_screen()


func _physics_process(delta: float) -> void:
	if status_banner_timer > 0.0:
		status_banner_timer -= delta
		if status_banner_timer <= 0.0 and lbl_banner != null:
			lbl_banner.text = ""

	if damage_flash_alpha > 0.0:
		damage_flash_alpha = maxf(0.0, damage_flash_alpha - delta * 2.8)
		if flash_rect != null:
			flash_rect.color = Color(0.85, 0.04, 0.08, damage_flash_alpha)

	if phase != GamePhase.ACTIVE_WAVE:
		_update_hud_labels()
		return

	if hitstop_timer > 0.0:
		hitstop_timer -= delta
		_update_hud_labels()
		return

	player.physics_tick(delta)
	_tick_wave_spawner(delta)
	_tick_enemies_and_boids(delta)
	_tick_projectiles(delta)
	_tick_orbs(delta)
	_tick_gibs(delta)
	_tick_familiars(delta)
	_tick_damage_labels(delta)
	_update_hud_labels()


func _tick_wave_spawner(dt: float) -> void:
	for i in range(active_enemies.size() - 1, -1, -1):
		if not is_instance_valid(active_enemies[i]) or active_enemies[i].hp <= 0.0:
			active_enemies.remove_at(i)

	var max_alive := int(wave_pacing["max_alive"])
	if wave_enemies_spawned < wave_enemies_to_spawn and active_enemies.size() < max_alive:
		spawn_timer -= dt
		if spawn_timer <= 0.0:
			spawn_timer = float(wave_pacing["spawn_interval"])
			_spawn_next_wave_enemy()

	if wave_enemies_spawned >= wave_enemies_to_spawn and active_enemies.is_empty():
		for orb in orb_pool:
			if orb["active"]:
				orb["harvest"] = true
		_open_blood_altar()


func _spawn_next_wave_enemy() -> void:
	wave_enemies_spawned += 1
	var arch_id := "catacomb_ghoul"
	var r := randf()

	if current_wave == 1:
		arch_id = "catacomb_ghoul"
	elif current_wave == 2:
		arch_id = "blood_cultist" if r < 0.35 else "catacomb_ghoul"
	elif current_wave <= 4:
		if r < 0.25:
			arch_id = "crypt_nightstalker"
		elif r < 0.55:
			arch_id = "blood_cultist"
		else:
			arch_id = "catacomb_ghoul"
	elif current_wave <= 7:
		if r < 0.16:
			arch_id = "iron_inquisitor"
		elif r < 0.42:
			arch_id = "crypt_nightstalker"
		elif r < 0.70:
			arch_id = "blood_cultist"
		else:
			arch_id = "catacomb_ghoul"
	else:
		if r < 0.08:
			arch_id = "cathedral_executioner"
		elif r < 0.26:
			arch_id = "iron_inquisitor"
		elif r < 0.54:
			arch_id = "crypt_nightstalker"
		elif r < 0.80:
			arch_id = "blood_cultist"
		else:
			arch_id = "catacomb_ghoul"

	var best_pos := Vector3(0, 0.2, -20)
	var best_score := -9999.0
	var sp_list: Array = arena_builder.spawn_points
	for sp_v in sp_list:
		var sp: Vector3 = sp_v
		var d: float = sp.distance_to(player.global_position)
		var score := -absf(d - 20.0) + randf_range(-3.0, 3.0)
		if d > 9.0 and score > best_score:
			best_score = score
			best_pos = sp

	var enemy: Node3D = EnemyActorScript.new()
	enemy.position = best_pos
	var is_elite := randf() < float(wave_pacing["elite_chance"])
	entities_root.add_child(enemy)
	enemy.setup_from_catalog(arch_id, wave_pacing, is_elite)
	active_enemies.append(enemy)


func _tick_enemies_and_boids(dt: float) -> void:
	boid_tick_counter = (boid_tick_counter + 1) % 4
	var p_pos: Vector3 = player.global_position
	var count := active_enemies.size()

	for i in range(count):
		var e: Node3D = active_enemies[i]
		if not is_instance_valid(e) or float(e.hp) <= 0.0:
			continue
		if (i % 4) == boid_tick_counter:
			var sep := Vector3.ZERO
			for j in range(count):
				if i == j:
					continue
				var other: Node3D = active_enemies[j]
				if not is_instance_valid(other):
					continue
				var diff: Vector3 = e.position - other.position
				diff.y = 0.0
				var dist_sq: float = diff.length_squared()
				if dist_sq > 0.001 and dist_sq < 2.5:
					sep += diff.normalized() / sqrt(dist_sq)
			e.boid_push = sep
		e.tick_ai(dt, p_pos, self)


func resolve_melee_sector_attack(w_cfg: Dictionary, eff_reach: float, is_alt: bool) -> void:
	var p_pos: Vector3 = player.global_position
	var cam_fwd: Vector3 = -player.camera.global_transform.basis.z
	var horiz_fwd := Vector3(cam_fwd.x, 0.0, cam_fwd.z).normalized()
	if horiz_fwd.length_squared() < 0.01:
		horiz_fwd = -player.global_transform.basis.z

	var half_arc_cos := cos(deg_to_rad(float(w_cfg["horizontal_arc_deg"]) * (0.65 if is_alt else 0.5)))

	if bool(w_cfg.get("slices_projectiles", false)) or is_alt:
		var sliced_count := 0
		for p in proj_pool:
			if not bool(p["active"]) or bool(p["reflected"]):
				continue
			var p_pos_v: Vector3 = p["pos"]
			var to_proj: Vector3 = p_pos_v - (p_pos + Vector3(0, 1.2, 0))
			var d := to_proj.length()
			if d <= eff_reach + 1.2:
				var dir_h := Vector3(to_proj.x, 0.0, to_proj.z).normalized()
				if dir_h.dot(horiz_fwd) >= half_arc_cos - 0.15:
					p["reflected"] = true
					p["vel"] = cam_fwd * 28.0
					p["dmg"] = float(p["dmg"]) * 3.5 * (1.0 + float(player_stats["damage_mult"]))
					p["life"] = 3.0
					var p_mi: MeshInstance3D = p["mesh"]
					p_mi.material_override = p["mat_refl"]
					sliced_count += 1
		if sliced_count > 0:
			player.play_parry_clang()
			trigger_hitstop(0.032)
			heal_player(float(player_stats.get("parry_heal", 6.0)) * float(sliced_count))
			if selected_char_id == "tepes_aristocrat":
				player.blood_gauge = minf(player.max_blood_gauge, player.blood_gauge + 8.0)
				player.speed_buff_timer = 3.0
			show_banner("PARRIED & SLICED BLOOD ORB! (+350% REFLECT)", 1.4)

	var base_dmg := float(w_cfg["base_damage"]) * (1.45 if is_alt else 1.0)
	var cleave_hits := 0
	var max_cleave := int(w_cfg.get("cleave_max", 8))

	for e_var in active_enemies.duplicate():
		var e: Node3D = e_var
		if not is_instance_valid(e) or float(e.hp) <= 0.0:
			continue
		var diff: Vector3 = (e.position + Vector3(0, 1.0, 0)) - (p_pos + Vector3(0, 1.1, 0))
		if absf(diff.y) > float(w_cfg.get("vertical_slack", 1.8)) + 0.8:
			continue
		var horiz_diff := Vector3(diff.x, 0.0, diff.z)
		var dist := horiz_diff.length()
		if dist > eff_reach + 0.45:
			continue
		var dir_to_e := horiz_diff / maxf(0.001, dist)
		if dist > 0.65 and dir_to_e.dot(horiz_fwd) < half_arc_cos:
			continue

		var dmg_mult := 1.0
		var is_sweet_spot := false
		var bleed_to_add := 0

		if bool(w_cfg.get("has_sweet_spot", false)):
			var ratio := dist / maxf(0.1, eff_reach)
			if ratio >= float(w_cfg.get("sweet_spot_min_ratio", 0.65)) or is_alt:
				dmg_mult = float(w_cfg.get("sweet_spot_mult", 3.0)) + float(player_stats.get("sweet_spot_bonus", 0.0))
				is_sweet_spot = true
				bleed_to_add = 3
				if is_alt:
					e.position = p_pos + dir_to_e * (eff_reach * 0.78)
			else:
				dmg_mult = float(w_cfg.get("inner_shaft_mult", 0.45))
				e.velocity += dir_to_e * 9.5

		if bool(w_cfg.get("shatters_armor", false)) and bool(e.is_armored):
			e.is_armored = false
			dmg_mult *= 1.45
			show_banner("ARMOR SHATTERED!", 1.1)

		var final_dmg := _compute_player_damage(base_dmg * dmg_mult, is_sweet_spot)
		e.bleed_stacks += bleed_to_add
		e.poise -= float(w_cfg["stagger_power"]) * (1.0 + float(player_stats["stagger_mult"]))
		if float(e.poise) <= 0.0 and not bool(e.is_staggered):
			e.trigger_stagger()

		damage_enemy(e, final_dmg, is_sweet_spot, bool(w_cfg.get("shatters_armor", false)), e.position + Vector3(0, 1.3, 0), true)

		if bool(w_cfg.get("point_blank_nova", false)) and dist <= 1.45:
			_trigger_blood_nova(e.position, 55.0 * (1.0 + float(player_stats["damage_mult"])), 3.6)
			trigger_hitstop(0.028)

		if is_sweet_spot:
			trigger_hitstop(0.028)

		cleave_hits += 1
		if cleave_hits >= max_cleave:
			break


func resolve_ballistic_attack(w_cfg: Dictionary, is_alt: bool) -> void:
	var pellets := int(w_cfg.get("pellets", 1)) + int(player_stats.get("pellet_bonus", 0.0))
	var pierce_max := int(w_cfg.get("pierce", 0)) + int(player_stats.get("pierce_bonus", 0.0))
	var spread_deg := float(w_cfg.get("spread_deg", 1.0)) * (0.35 if is_alt else 1.0)
	var base_dmg := float(w_cfg["base_damage"]) * (1.65 if is_alt else 1.0)
	var max_range := float(w_cfg.get("reach", 50.0))

	var cam_org: Vector3 = player.camera.global_position
	var cam_fwd: Vector3 = -player.camera.global_transform.basis.z
	var hit_point_blank := false

	for p_i in range(pellets):
		var ray_dir: Vector3 = cam_fwd
		if spread_deg > 0.05 and p_i > 0:
			var rx := deg_to_rad(randf_range(-spread_deg, spread_deg))
			var ry := deg_to_rad(randf_range(-spread_deg, spread_deg))
			var cam_basis: Basis = player.camera.global_transform.basis
			ray_dir = (cam_fwd + cam_basis.x * rx + cam_basis.y * ry).normalized()

		var pierced := 0
		for e_var in active_enemies.duplicate():
			var e: Node3D = e_var
			if not is_instance_valid(e) or float(e.hp) <= 0.0:
				continue
			var e_center: Vector3 = e.position + Vector3(0, 1.05, 0)
			var to_e: Vector3 = e_center - cam_org
			var proj_dist: float = to_e.dot(ray_dir)
			if proj_dist < 0.2 or proj_dist > max_range:
				continue
			var closest_pt: Vector3 = cam_org + ray_dir * proj_dist
			var hit_radius: float = 0.78 * e.scale.x
			if closest_pt.distance_to(e_center) <= hit_radius:
				var is_headshot: bool = (closest_pt.y - e.position.y) >= 1.35 * e.scale.y
				var mult := 1.65 if is_headshot else 1.0
				var dmg := _compute_player_damage(base_dmg * mult, is_headshot)
				e.poise -= float(w_cfg["stagger_power"]) * (1.0 + float(player_stats["stagger_mult"]))
				if float(e.poise) <= 0.0 and not bool(e.is_staggered):
					e.trigger_stagger()
				damage_enemy(e, dmg, is_headshot, bool(w_cfg.get("shatters_armor", false)), closest_pt, true)
				if proj_dist < 3.5 and selected_weapon_id == "trench_shotgun":
					hit_point_blank = true
				pierced += 1
				if pierced > pierce_max:
					break

	if hit_point_blank:
		trigger_hitstop(0.025)


func resolve_quick_melee_or_execution(is_sliding: bool) -> void:
	var p_pos: Vector3 = player.global_position
	var fwd: Vector3 = -player.global_transform.basis.z
	fwd.y = 0.0
	fwd = fwd.normalized()

	for e_var in active_enemies.duplicate():
		var e: Node3D = e_var
		if not is_instance_valid(e) or float(e.hp) <= 0.0:
			continue
		var dist: float = e.position.distance_to(p_pos)
		if dist > 3.2:
			continue
		if is_sliding:
			e.is_bowling = true
			e.bowling_timer = 1.1
			e.velocity = fwd * 28.0 + Vector3(0, 2.5, 0)
			e.is_armored = false
			damage_enemy(e, 55.0, true, true, e.position + Vector3(0, 1.2, 0), true)
			trigger_hitstop(0.025)
			show_banner("SLIDE BLOOD-KICK BOWLING!", 1.2)
			return
		elif bool(e.is_staggered):
			damage_enemy(e, float(e.hp) + 999.0, true, true, e.position + Vector3(0, 1.3, 0), true)
			heal_player(25.0)
			trigger_hitstop(0.032)
			show_banner("VAMPIRIC EXECUTION! (+25 HP)", 1.4)
			return
		else:
			e.poise -= 65.0
			if float(e.poise) <= 0.0:
				e.trigger_stagger()
			damage_enemy(e, 42.0, false, false, e.position + Vector3(0, 1.2, 0), true)
			return


func check_bowling_impact(bowling_enemy: Node3D) -> void:
	for other_var in active_enemies.duplicate():
		var other: Node3D = other_var
		if other == bowling_enemy or not is_instance_valid(other) or float(other.hp) <= 0.0:
			continue
		if other.position.distance_to(bowling_enemy.position) < 1.65:
			other.trigger_stagger()
			damage_enemy(other, 85.0, true, true, other.position + Vector3(0, 1.2, 0), true)


func _compute_player_damage(raw_dmg: float, force_crit: bool) -> float:
	var vel_bonus := 0.0
	if selected_char_id == "nightrunner_wraith":
		vel_bonus = maxf(0.0, (float(player.get_horizontal_speed()) - 12.5) * 0.025)
	var dmg := raw_dmg * (1.0 + float(player_stats["damage_mult"]) + vel_bonus)
	var crit_c := float(player_stats["crit_chance"])
	if force_crit or randf() < crit_c:
		dmg *= 2.0
		if selected_char_id == "tepes_aristocrat":
			player.blood_gauge = minf(player.max_blood_gauge, player.blood_gauge + 8.0)
			player.speed_buff_timer = 3.0
	return dmg


func damage_enemy(
	enemy: Node3D,
	amount: float,
	is_crit: bool,
	ignores_armor: bool,
	hit_pos: Vector3,
	can_proc: bool
) -> void:
	if not is_instance_valid(enemy) or float(enemy.hp) <= 0.0:
		return
	var final_amt := amount
	if bool(enemy.is_armored) and not ignores_armor:
		final_amt *= 0.40

	enemy.hp -= final_amt
	enemy.trigger_hit_flash()
	_spawn_batched_damage_label(enemy.get_instance_id(), hit_pos, final_amt, is_crit)

	if can_proc and float(player_stats["life_leech"]) > 0.0:
		heal_player(final_amt * float(player_stats["life_leech"]) * 0.12)

	if float(enemy.hp) <= 0.0:
		_on_enemy_killed(enemy, is_crit)


func _on_enemy_killed(enemy: Node3D, was_violent_crit: bool) -> void:
	var death_pos: Vector3 = enemy.position + Vector3(0, 0.9, 0)
	var drop_val: float = float(enemy.vitae_value) * (1.0 + float(player_stats["vitae_mult"]))

	for i in range(2):
		_spawn_blood_orb(death_pos, drop_val * 0.5)

	var gib_count := 9 if (was_violent_crit or selected_weapon_id in ["trench_shotgun", "stake_and_hammer", "occult_scythe"]) else 5
	_spawn_gibs(death_pos, gib_count)
	if gib_sfx_player != null and gib_sfx_player.stream != null:
		gib_sfx_player.pitch_scale = randf_range(0.94, 1.06)
		gib_sfx_player.play()

	if float(player_stats.get("blood_nova_on_kill", 0.0)) > 0.0 or (selected_char_id == "nosferatu_leech" and death_pos.distance_to(player.global_position) < 3.6):
		_trigger_blood_nova(death_pos, 45.0 * (1.0 + float(player_stats["damage_mult"])), 3.5)

	wave_enemies_killed += 1
	total_kills += 1
	active_enemies.erase(enemy)
	enemy.queue_free()


func _trigger_blood_nova(center: Vector3, dmg: float, radius: float) -> void:
	_spawn_gibs(center, 6)
	for other_var in active_enemies.duplicate():
		var other: Node3D = other_var
		if is_instance_valid(other) and float(other.hp) > 0.0 and other.position.distance_to(center) <= radius:
			damage_enemy(other, dmg, false, true, other.position + Vector3(0, 1.1, 0), false)


func damage_player(amount: float, _source_pos: Vector3) -> void:
	var spd_evade := clampf((float(player.get_horizontal_speed()) - 12.5) * 0.015, 0.0, 0.35)
	if randf() < spd_evade:
		return
	var armor := maxf(0.0, float(player_stats.get("armor", 0.0)))
	var mitigated := amount * (100.0 / (100.0 + armor))

	if blood_barrier > 0.0:
		var absorbed := minf(blood_barrier, mitigated)
		blood_barrier -= absorbed
		mitigated -= absorbed

	player_hp -= mitigated
	damage_flash_alpha = 0.45
	player.trauma = minf(1.0, float(player.trauma) + 0.45)

	if player_hp <= 0.0:
		player_hp = 0.0
		_trigger_game_over()


func heal_player(amount: float) -> void:
	if player_hp + amount > player_max_hp:
		var excess := (player_hp + amount) - player_max_hp
		player_hp = player_max_hp
		if selected_char_id == "nosferatu_leech" or float(player_stats["life_leech"]) > 0.0:
			blood_barrier = minf(player_max_hp * 0.5, blood_barrier + excess)
	else:
		player_hp += amount


func trigger_hitstop(duration: float) -> void:
	hitstop_timer = maxf(hitstop_timer, duration)


func spawn_cultist_projectile(pos: Vector3, vel: Vector3, dmg: float) -> void:
	for p in proj_pool:
		if not bool(p["active"]):
			p["active"] = true
			p["reflected"] = false
			p["pos"] = pos
			p["vel"] = vel
			p["dmg"] = dmg
			p["life"] = 5.5
			var mi: MeshInstance3D = p["mesh"]
			mi.position = pos
			mi.material_override = p["mat_enemy"]
			mi.visible = true
			return


func _tick_projectiles(dt: float) -> void:
	var p_center: Vector3 = player.global_position + Vector3(0, 1.05, 0)
	for p in proj_pool:
		if not bool(p["active"]):
			continue
		p["life"] = float(p["life"]) - dt
		var cur_pos: Vector3 = p["pos"]
		var cur_vel: Vector3 = p["vel"]
		cur_pos += cur_vel * dt
		p["pos"] = cur_pos
		var mi: MeshInstance3D = p["mesh"]
		mi.position = cur_pos

		if float(p["life"]) <= 0.0 or absf(cur_pos.x) > 35.0 or absf(cur_pos.z) > 35.0 or cur_pos.y < 0.05:
			p["active"] = false
			mi.visible = false
			continue

		if bool(p["reflected"]):
			for e_var in active_enemies.duplicate():
				var e: Node3D = e_var
				if is_instance_valid(e) and float(e.hp) > 0.0 and cur_pos.distance_to(e.position + Vector3(0, 1.0, 0)) < 1.35:
					damage_enemy(e, float(p["dmg"]), true, true, cur_pos, true)
					p["active"] = false
					mi.visible = false
					break
		else:
			if cur_pos.distance_to(p_center) < 0.85:
				damage_player(float(p["dmg"]), cur_pos)
				p["active"] = false
				mi.visible = false


func _spawn_blood_orb(pos: Vector3, val: float) -> void:
	for orb in orb_pool:
		if not bool(orb["active"]):
			orb["active"] = true
			orb["pos"] = pos
			orb["vel"] = Vector3(randf_range(-3.5, 3.5), randf_range(3.5, 6.5), randf_range(-3.5, 3.5))
			orb["val"] = val
			orb["harvest"] = false
			var mi: MeshInstance3D = orb["mesh"]
			mi.position = pos
			mi.visible = true
			return


func _tick_orbs(dt: float) -> void:
	var p_pos: Vector3 = player.global_position + Vector3(0, 1.0, 0)
	var mag_r := 5.2 * (1.0 + float(player_stats.get("magnet_radius_pct", 0.0)))
	for orb in orb_pool:
		if not bool(orb["active"]):
			continue
		var pos: Vector3 = orb["pos"]
		var vel: Vector3 = orb["vel"]
		var d := pos.distance_to(p_pos)
		if bool(orb["harvest"]) or d < mag_r:
			var dir: Vector3 = (p_pos - pos).normalized()
			vel = dir * (48.0 if bool(orb["harvest"]) else 26.0)
		else:
			vel.y -= 18.0 * dt
			vel.x *= (1.0 - 3.0 * dt)
			vel.z *= (1.0 - 3.0 * dt)
		pos += vel * dt
		if pos.y < 0.25:
			pos.y = 0.25
			vel.y = 0.0
		orb["pos"] = pos
		orb["vel"] = vel
		var mi: MeshInstance3D = orb["mesh"]
		mi.position = pos
		mi.rotation.y += dt * 3.5

		if d < 1.45:
			orb["active"] = false
			mi.visible = false
			vitae_essence += int(round(float(orb["val"])))
			player.blood_gauge = minf(player.max_blood_gauge, player.blood_gauge + 3.0)
			if orb_sfx_player != null and orb_sfx_player.stream != null and not orb_sfx_player.playing:
				orb_sfx_player.pitch_scale = randf_range(0.95, 1.08)
				orb_sfx_player.play()


func _spawn_gibs(pos: Vector3, count: int) -> void:
	var spawned := 0
	for g in gib_pool:
		if not bool(g["active"]):
			g["active"] = true
			g["pos"] = pos
			g["vel"] = Vector3(randf_range(-8.5, 8.5), randf_range(4.0, 11.5), randf_range(-8.5, 8.5))
			g["life"] = 1.35
			g["max_life"] = 1.35
			var mi: MeshInstance3D = g["mesh"]
			mi.position = pos
			mi.scale = Vector3.ONE
			mi.visible = true
			spawned += 1
			if spawned >= count:
				return


func _tick_gibs(dt: float) -> void:
	for g in gib_pool:
		if not bool(g["active"]):
			continue
		var life := float(g["life"]) - dt
		g["life"] = life
		var mi: MeshInstance3D = g["mesh"]
		if life <= 0.0:
			g["active"] = false
			mi.visible = false
			continue
		var vel: Vector3 = g["vel"]
		var cur_pos: Vector3 = g["pos"]
		vel.y -= 26.0 * dt
		var pos: Vector3 = cur_pos + vel * dt
		if pos.y < 0.12:
			pos.y = 0.12
			vel.y = -vel.y * 0.35
			vel.x *= 0.7
			vel.z *= 0.7
		g["pos"] = pos
		g["vel"] = vel
		mi.position = pos
		mi.rotation += Vector3(dt * 8.0, dt * 6.0, 0.0)
		mi.scale = Vector3.ONE * clampf(life / float(g["max_life"]), 0.1, 1.0)


func _rebuild_familiars() -> void:
	for f in familiar_nodes:
		if is_instance_valid(f):
			f.queue_free()
	familiar_nodes.clear()

	var total_f := int(player_stats["familiar_bats"]) + int(player_stats["familiar_skulls"]) + int(player_stats["familiar_wolves"])
	var f_mat := StandardMaterial3D.new()
	f_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	f_mat.albedo_color = Color(0.75, 0.15, 1.0)
	var f_mesh := PrismMesh.new()
	f_mesh.size = Vector3(0.38, 0.28, 0.45)
	f_mesh.material = f_mat

	for i in range(total_f):
		var mi := MeshInstance3D.new()
		mi.mesh = f_mesh
		pools_root.add_child(mi)
		familiar_nodes.append(mi)


func _tick_familiars(dt: float) -> void:
	if familiar_nodes.is_empty():
		return
	var prev_t := familiar_time
	familiar_time += dt
	var p_pos: Vector3 = player.global_position + Vector3(0, 1.45, 0)
	for i in range(familiar_nodes.size()):
		var ang := familiar_time * 3.2 + (TAU * float(i) / float(familiar_nodes.size()))
		familiar_nodes[i].position = p_pos + Vector3(cos(ang) * 2.2, 0.25 * sin(familiar_time * 5.0 + float(i)), sin(ang) * 2.2)
		familiar_nodes[i].rotation.y = -ang

	if int(familiar_time / 0.65) > int(prev_t / 0.65) and not active_enemies.is_empty():
		var target: Node3D = active_enemies[0]
		if is_instance_valid(target) and float(target.hp) > 0.0:
			var f_dmg := 28.0 * float(familiar_nodes.size()) * (1.0 + float(player_stats["damage_mult"]))
			target.bleed_stacks += 1
			damage_enemy(target, f_dmg, false, false, target.position + Vector3(0, 1.3, 0), false)


func _spawn_batched_damage_label(target_id: int, world_pos: Vector3, amount: float, is_crit: bool) -> void:
	for d in dmg_label_pool:
		if bool(d["active"]) and int(d["target_id"]) == target_id and float(d["age"]) < 0.35:
			d["sum"] = float(d["sum"]) + amount
			d["age"] = 0.0
			d["pos"] = world_pos + Vector3(0, 0.25, 0)
			d["crit"] = bool(d["crit"]) or is_crit
			var lbl: Label3D = d["label"]
			lbl.text = "%d%s" % [int(round(float(d["sum"]))), "!" if bool(d["crit"]) else ""]
			lbl.modulate = Color(1.0, 0.85, 0.15) if bool(d["crit"]) else Color(1.0, 0.22, 0.26)
			lbl.pixel_size = 0.0115 if bool(d["crit"]) else 0.009
			return

	for d in dmg_label_pool:
		if not bool(d["active"]):
			d["active"] = true
			d["target_id"] = target_id
			d["sum"] = amount
			d["age"] = 0.0
			d["pos"] = world_pos
			d["crit"] = is_crit
			var lbl: Label3D = d["label"]
			lbl.position = world_pos
			lbl.text = "%d%s" % [int(round(amount)), "!" if is_crit else ""]
			lbl.modulate = Color(1.0, 0.85, 0.15) if is_crit else Color(0.95, 0.92, 0.88)
			lbl.pixel_size = 0.0105 if is_crit else 0.0082
			lbl.visible = true
			return


func _tick_damage_labels(dt: float) -> void:
	for d in dmg_label_pool:
		if not bool(d["active"]):
			continue
		var age := float(d["age"]) + dt
		d["age"] = age
		var lbl: Label3D = d["label"]
		if age >= 0.75:
			d["active"] = false
			lbl.visible = false
		else:
			var cur_pos: Vector3 = d["pos"]
			cur_pos += Vector3(0, 1.35 * dt, 0)
			d["pos"] = cur_pos
			lbl.position = cur_pos


func _open_blood_altar() -> void:
	phase = GamePhase.BLOOD_ALTAR
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	blood_dice = mini(blood_dice_max, blood_dice + 2)
	paid_rerolls_this_wave = 0
	altar_session_ban.clear()
	altar_slots.clear()

	for s_i in range(3):
		var perk := _roll_filtered_perk()
		altar_session_ban[String(perk["id"])] = true
		altar_slots.append({
			"perk": perk,
			"locked": false,
			"pity_boosted": pity_counter >= 6
		})

	_refresh_altar_ui()
	altar_panel.visible = true


func _roll_filtered_perk() -> Dictionary:
	var wep_cfg: Dictionary = DataCatalog.WEAPONS[selected_weapon_id]
	var wep_tag := String(wep_cfg["tag"])
	var wep_cat := String(wep_cfg["category"])

	var valid_perks: Array = []
	for p in DataCatalog.PERKS:
		var tags: Array = p["tags"]
		if "UNIVERSAL" in tags or wep_tag in tags or wep_cat in tags:
			if not altar_session_ban.has(String(p["id"])):
				valid_perks.append(p)
	if valid_perks.is_empty():
		valid_perks = DataCatalog.PERKS.duplicate()

	var target_rarity := "COMMON"
	var roll := randf()
	if pity_counter >= 10:
		target_rarity = "ELDRITCH" if roll < 0.28 else "EPIC"
	elif pity_counter >= 6:
		target_rarity = "ELDRITCH" if roll < 0.14 else ("EPIC" if roll < 0.48 else "RARE")
	else:
		var w_c := maxf(10.0, 70.0 - 2.0 * float(current_wave) - 8.5 * float(pity_counter))
		var w_r := 22.0 + 1.2 * float(current_wave) + 4.5 * float(pity_counter)
		var w_e := 7.0 + 0.6 * float(current_wave) + 2.6 * float(pity_counter)
		var w_el := 1.0 + 0.25 * float(current_wave) + 1.4 * float(pity_counter)
		var total_w := w_c + w_r + w_e + w_el
		var pick := randf() * total_w
		if pick < w_c:
			target_rarity = "COMMON"
		elif pick < w_c + w_r:
			target_rarity = "RARE"
		elif pick < w_c + w_r + w_e:
			target_rarity = "EPIC"
		else:
			target_rarity = "ELDRITCH"

	var rarity_matches: Array = []
	for p in valid_perks:
		if String(p["rarity"]) == target_rarity:
			rarity_matches.append(p)
	if rarity_matches.is_empty():
		rarity_matches = valid_perks

	return rarity_matches[randi() % rarity_matches.size()]


func _reroll_altar_slot(slot_idx: int) -> void:
	if slot_idx < 0 or slot_idx >= altar_slots.size():
		return
	var slot := altar_slots[slot_idx]
	if bool(slot["locked"]):
		show_banner("SLOT %d IS LOCKED! (Unpin to reroll)" % [slot_idx + 1], 1.2)
		return

	if blood_dice > 0:
		blood_dice -= 1
	else:
		var tithe_cost := int(50 * pow(2, paid_rerolls_this_wave))
		if vitae_essence < tithe_cost:
			show_banner("NOT ENOUGH VITAE FOR BLOOD TITHE (%d NEEDED)!" % tithe_cost, 1.4)
			return
		vitae_essence -= tithe_cost
		paid_rerolls_this_wave += 1

	pity_counter += 1
	var new_perk := _roll_filtered_perk()
	altar_session_ban[String(new_perk["id"])] = true
	slot["perk"] = new_perk
	slot["pity_boosted"] = pity_counter >= 6
	_refresh_altar_ui()


func _toggle_lock_altar_slot(slot_idx: int) -> void:
	if slot_idx < 0 or slot_idx >= altar_slots.size():
		return
	altar_slots[slot_idx]["locked"] = not bool(altar_slots[slot_idx]["locked"])
	_refresh_altar_ui()


func _select_altar_slot(slot_idx: int) -> void:
	if slot_idx < 0 or slot_idx >= altar_slots.size():
		return
	var perk: Dictionary = altar_slots[slot_idx]["perk"]
	var mods: Dictionary = perk["mods"]
	for k in mods.keys():
		player_stats[k] = float(player_stats.get(k, 0.0)) + float(mods[k])
		if k == "max_hp":
			player_max_hp += float(mods[k])
			player_hp += float(mods[k])

	if String(perk["rarity"]) in ["EPIC", "ELDRITCH"]:
		pity_counter = 0

	_rebuild_familiars()
	altar_panel.visible = false
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	_start_wave(current_wave + 1)


func _build_ui() -> void:
	for i in range(MAX_DMG_LABELS):
		var lbl := Label3D.new()
		lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		lbl.no_depth_test = true
		lbl.font_size = 42
		lbl.outline_size = 10
		lbl.text = "0"
		lbl.visible = false
		pools_root.add_child(lbl)
		dmg_label_pool.append({
			"active": false,
			"target_id": 0,
			"sum": 0.0,
			"age": 0.0,
			"pos": Vector3.ZERO,
			"crit": false,
			"label": lbl
		})

	ui_layer = CanvasLayer.new()
	add_child(ui_layer)

	hud_root = Control.new()
	hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_layer.add_child(hud_root)

	flash_rect = ColorRect.new()
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.color = Color(0.85, 0.05, 0.10, 0.0)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_root.add_child(flash_rect)

	var cross_lbl := Label.new()
	cross_lbl.text = "[ + ]"
	cross_lbl.add_theme_font_size_override("font_size", 20)
	cross_lbl.add_theme_color_override("font_color", Color(0.95, 0.15, 0.22, 0.90))
	cross_lbl.set_anchors_preset(Control.PRESET_CENTER)
	cross_lbl.position = Vector2(-20, -14)
	hud_root.add_child(cross_lbl)

	lbl_wave_info = Label.new()
	lbl_wave_info.add_theme_font_size_override("font_size", 18)
	lbl_wave_info.add_theme_color_override("font_color", Color(0.95, 0.88, 0.82))
	lbl_wave_info.position = Vector2(24, 16)
	hud_root.add_child(lbl_wave_info)

	lbl_banner = Label.new()
	lbl_banner.add_theme_font_size_override("font_size", 24)
	lbl_banner.add_theme_color_override("font_color", Color(1.0, 0.82, 0.20))
	lbl_banner.position = Vector2(360, 72)
	hud_root.add_child(lbl_banner)

	lbl_hp_speed = Label.new()
	lbl_hp_speed.add_theme_font_size_override("font_size", 20)
	lbl_hp_speed.add_theme_color_override("font_color", Color(0.95, 0.18, 0.24))
	lbl_hp_speed.position = Vector2(24, 715)
	hud_root.add_child(lbl_hp_speed)

	lbl_weapon_info = Label.new()
	lbl_weapon_info.add_theme_font_size_override("font_size", 17)
	lbl_weapon_info.add_theme_color_override("font_color", Color(0.88, 0.84, 0.80))
	lbl_weapon_info.position = Vector2(820, 715)
	hud_root.add_child(lbl_weapon_info)

	_build_loadout_panel()
	_build_altar_panel()
	_build_gameover_panel()


func _make_dark_panel_style(border_col: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.03, 0.04, 0.94)
	sb.border_color = border_col
	sb.set_border_width_all(2)
	sb.set_content_margin_all(20)
	return sb


func _build_loadout_panel() -> void:
	loadout_panel = PanelContainer.new()
	loadout_panel.add_theme_stylebox_override("panel", _make_dark_panel_style(Color(0.85, 0.08, 0.16)))
	loadout_panel.position = Vector2(140, 55)
	loadout_panel.custom_minimum_size = Vector2(1160, 690)
	ui_layer.add_child(loadout_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	loadout_panel.add_child(vbox)

	var title := Label.new()
	title.text = "SANGUINE_RUNNER — NATIVE GODOT 4 RETRO BOOMER-SHOOTER (DUSK / QUAKE / BLOOD)"
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color(0.95, 0.14, 0.20))
	vbox.add_child(title)

	var sub := Label.new()
	sub.text = "Select Vampiric Bloodline + 1 Signature Weapon (Single-Weapon Run) + Danger Tier (0-5). Waves 1-3 start slow & atmospheric!"
	sub.add_theme_color_override("font_color", Color(0.82, 0.78, 0.74))
	vbox.add_child(sub)

	var char_hdr := Label.new()
	char_hdr.text = "1. CHOOSE VAMPIRIC BLOODLINE (Stat Offsets & Passive — Decoupled from Weapons):"
	char_hdr.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	vbox.add_child(char_hdr)

	var char_box := HBoxContainer.new()
	char_box.add_theme_constant_override("separation", 10)
	vbox.add_child(char_box)
	for c_id in DataCatalog.CHARACTERS.keys():
		var c_cfg: Dictionary = DataCatalog.CHARACTERS[c_id]
		var btn := Button.new()
		btn.text = "%s\n(%s)" % [String(c_cfg["name"]), String(c_cfg["title"])]
		btn.custom_minimum_size = Vector2(265, 58)
		btn.pressed.connect(func():
			selected_char_id = c_id
			var allowed: Array = DataCatalog.CHARACTERS[c_id]["allowed_weapons"]
			if not (selected_weapon_id in allowed):
				selected_weapon_id = String(allowed[0])
			_refresh_loadout_ui()
		)
		char_box.add_child(btn)

	var wep_hdr := Label.new()
	wep_hdr.text = "2. CHOOSE 1 SIGNATURE WEAPON FOR THIS RUN (Allowed Pool for Selected Bloodline):"
	wep_hdr.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	vbox.add_child(wep_hdr)

	btn_weapons_box = HBoxContainer.new()
	btn_weapons_box.add_theme_constant_override("separation", 12)
	vbox.add_child(btn_weapons_box)

	var dng_hdr := Label.new()
	dng_hdr.text = "3. CHOOSE DANGER / CORRUPTION TIER (Danger 0 to Danger 5):"
	dng_hdr.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	vbox.add_child(dng_hdr)

	var dng_box := HBoxContainer.new()
	dng_box.add_theme_constant_override("separation", 8)
	vbox.add_child(dng_box)
	for d_i in range(6):
		var btn_d := Button.new()
		btn_d.text = "Danger %d" % d_i
		btn_d.custom_minimum_size = Vector2(165, 42)
		btn_d.pressed.connect(func():
			selected_danger_tier = d_i
			_refresh_loadout_ui()
		)
		dng_box.add_child(btn_d)

	lbl_loadout_summary = Label.new()
	lbl_loadout_summary.add_theme_font_size_override("font_size", 16)
	lbl_loadout_summary.add_theme_color_override("font_color", Color(0.92, 0.90, 0.86))
	vbox.add_child(lbl_loadout_summary)

	var start_btn := Button.new()
	start_btn.text = ">>> AWAKEN IN THE CATACOMBS (START NATIVE RUN — ENTER / SPACE) <<<"
	start_btn.custom_minimum_size = Vector2(1100, 58)
	start_btn.add_theme_font_size_override("font_size", 20)
	start_btn.pressed.connect(start_new_run)
	vbox.add_child(start_btn)


func _refresh_loadout_ui() -> void:
	for child in btn_weapons_box.get_children():
		child.queue_free()

	var c_cfg: Dictionary = DataCatalog.CHARACTERS[selected_char_id]
	var allowed: Array = c_cfg["allowed_weapons"]
	for w_id in allowed:
		var w_cfg: Dictionary = DataCatalog.WEAPONS[w_id]
		var b := Button.new()
		b.text = "%s\n[%s]" % [String(w_cfg["name"]), String(w_cfg["category"])]
		b.custom_minimum_size = Vector2(350, 62)
		b.pressed.connect(func():
			selected_weapon_id = w_id
			player.equip_single_weapon(w_id)
			_refresh_loadout_ui()
		)
		btn_weapons_box.add_child(b)

	var w_info: Dictionary = DataCatalog.WEAPONS[selected_weapon_id]
	var d_info: Dictionary = DataCatalog.DANGER_TIERS[selected_danger_tier]
	lbl_loadout_summary.text = (
		"SELECTED BLOODLINE: %s — %s\n" % [String(c_cfg["name"]), String(c_cfg["passive_desc"])]
		+ "SELECTED SINGLE WEAPON: %s — %s\n" % [String(w_info["name"]), String(w_info["desc"])]
		+ "SELECTED DIFFICULTY: %s | PACING: Wave 1-3 starts with 2-4 slow Catacomb Ghouls (+18%% count & +4%% speed/wave).\n" % String(d_info["name"])
		+ "CONTROLS: WASD Move | SPACE Jump/Wall-Kick/Bhop | SHIFT/CTRL Slide | LMB Attack | RMB Alt-Fire/Parry | F Slide-Kick/Execute | R Reload"
	)


func _build_altar_panel() -> void:
	altar_panel = PanelContainer.new()
	altar_panel.add_theme_stylebox_override("panel", _make_dark_panel_style(Color(1.0, 0.78, 0.18)))
	altar_panel.position = Vector2(120, 80)
	altar_panel.custom_minimum_size = Vector2(1200, 640)
	altar_panel.visible = false
	ui_layer.add_child(altar_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 16)
	altar_panel.add_child(vbox)

	altar_header_lbl = Label.new()
	altar_header_lbl.add_theme_font_size_override("font_size", 20)
	altar_header_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
	vbox.add_child(altar_header_lbl)

	altar_cards_box = HBoxContainer.new()
	altar_cards_box.add_theme_constant_override("separation", 18)
	vbox.add_child(altar_cards_box)


func _refresh_altar_ui() -> void:
	for child in altar_cards_box.get_children():
		child.queue_free()

	var tithe_cost := int(50 * pow(2, paid_rerolls_this_wave))
	var reroll_cost_str := "FREE (1 Blood Die)" if blood_dice > 0 else ("BLOOD TITHE: %d Vitae" % tithe_cost)
	altar_header_lbl.text = (
		"THE BLOOD ALTAR — WAVE %d CLEARED!\n" % current_wave
		+ "Blood Dice (Free Rerolls): %d / %d  |  Vitae Essence: %d  |  Pity Counter: %d (p>=6 No Common, p>=10 Guaranteed Epic/Eldritch)\n"
		% [blood_dice, blood_dice_max, vitae_essence, pity_counter]
		+ "Hotkeys: [1 / 2 / 3] Draft Card   |   [Q / W / E] Targeted Reroll Slot (%s)   |   [Alt + 1/2/3] Pin/Lock Slot" % reroll_cost_str
	)

	var reroll_keys := ["Q", "W", "E"]
	for i in range(altar_slots.size()):
		var slot := altar_slots[i]
		var perk: Dictionary = slot["perk"]
		var rarity := String(perk["rarity"])
		var border_c := Color(0.65, 0.65, 0.62)
		if rarity == "RARE":
			border_c = Color(0.95, 0.14, 0.20)
		elif rarity == "EPIC":
			border_c = Color(0.68, 0.18, 1.0)
		elif rarity == "ELDRITCH":
			border_c = Color(1.0, 0.84, 0.12)

		var card := PanelContainer.new()
		card.add_theme_stylebox_override("panel", _make_dark_panel_style(border_c))
		card.custom_minimum_size = Vector2(370, 440)
		altar_cards_box.add_child(card)

		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 12)
		card.add_child(cv)

		var r_lbl := Label.new()
		r_lbl.text = "[SLOT %d] %s %s %s" % [
			i + 1,
			rarity,
			" [LOCKED]" if bool(slot["locked"]) else "",
			" [PITY BOOST!]" if bool(slot["pity_boosted"]) else ""
		]
		r_lbl.add_theme_color_override("font_color", border_c)
		cv.add_child(r_lbl)

		var n_lbl := Label.new()
		n_lbl.text = String(perk["name"])
		n_lbl.add_theme_font_size_override("font_size", 20)
		cv.add_child(n_lbl)

		var d_lbl := Label.new()
		d_lbl.text = String(perk["desc"])
		d_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d_lbl.custom_minimum_size = Vector2(320, 140)
		cv.add_child(d_lbl)

		var btn_draft := Button.new()
		btn_draft.text = "DRAFT PERK [%d]" % [i + 1]
		btn_draft.custom_minimum_size = Vector2(320, 52)
		btn_draft.pressed.connect(func(): _select_altar_slot(i))
		cv.add_child(btn_draft)

		var btn_reroll := Button.new()
		btn_reroll.text = "REROLL ONLY SLOT %d [%s]\n(%s)" % [i + 1, reroll_keys[i], reroll_cost_str]
		btn_reroll.custom_minimum_size = Vector2(320, 52)
		btn_reroll.disabled = bool(slot["locked"])
		btn_reroll.pressed.connect(func(): _reroll_altar_slot(i))
		cv.add_child(btn_reroll)

		var btn_lock := Button.new()
		btn_lock.text = ("UNPIN / UNLOCK [Alt+%d]" if bool(slot["locked"]) else "PIN / LOCK CARD [Alt+%d]") % [i + 1]
		btn_lock.pressed.connect(func(): _toggle_lock_altar_slot(i))
		cv.add_child(btn_lock)


func _build_gameover_panel() -> void:
	gameover_panel = PanelContainer.new()
	gameover_panel.add_theme_stylebox_override("panel", _make_dark_panel_style(Color(0.95, 0.08, 0.14)))
	gameover_panel.position = Vector2(380, 220)
	gameover_panel.custom_minimum_size = Vector2(680, 320)
	gameover_panel.visible = false
	ui_layer.add_child(gameover_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 18)
	gameover_panel.add_child(vbox)

	var t := Label.new()
	t.text = "YOU WERE CONSUMED BY THE CATACOMBS"
	t.add_theme_font_size_override("font_size", 26)
	t.add_theme_color_override("font_color", Color(0.95, 0.12, 0.18))
	vbox.add_child(t)

	var btn := Button.new()
	btn.text = "RETURN TO BLOODLINE LOADOUT [ENTER / SPACE]"
	btn.custom_minimum_size = Vector2(600, 60)
	btn.pressed.connect(_show_loadout_screen)
	vbox.add_child(btn)


func _show_loadout_screen() -> void:
	phase = GamePhase.LOADOUT_SELECT
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	loadout_panel.visible = true
	altar_panel.visible = false
	gameover_panel.visible = false
	_refresh_loadout_ui()


func _trigger_game_over() -> void:
	phase = GamePhase.GAME_OVER
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	gameover_panel.visible = true


func show_banner(txt: String, duration: float = 2.0) -> void:
	status_banner_text = txt
	status_banner_timer = duration
	if lbl_banner != null:
		lbl_banner.text = txt


func _update_hud_labels() -> void:
	if lbl_hp_speed == null or player == null:
		return
	var state_names := ["IDLE", "RUN", "SLIDE", "WALL_RUN", "AIR", "MANTLE"]
	var st_str: String = state_names[int(player.move_state)]
	lbl_hp_speed.text = (
		"HP: %d / %d  (Barrier: +%d)   |   BLOOD GAUGE: %d%%\n"
		% [int(ceil(player_hp)), int(player_max_hp), int(blood_barrier), int(player.blood_gauge)]
		+ "SPEED: %.1f m/s   |   STATE: [%s]" % [float(player.get_horizontal_speed()), st_str]
	)

	var rem := maxi(0, wave_enemies_to_spawn - wave_enemies_killed)
	lbl_wave_info.text = (
		"WAVE %d (DANGER %d)  |  FOES REMAINING: %d  (ALIVE IN CRYPT: %d / %d)\n"
		% [current_wave, selected_danger_tier, rem, active_enemies.size(), int(wave_pacing.get("max_alive", 3))]
		+ "VITAE ESSENCE: %d  |  BLOOD DICE: %d  |  PITY: %d  |  KILLS: %d"
		% [vitae_essence, blood_dice, pity_counter, total_kills]
	)

	var w_cfg: Dictionary = player.weapon_cfg
	var w_name := String(w_cfg.get("name", "Weapon"))
	if String(w_cfg.get("category", "MELEE")) == "MELEE":
		lbl_weapon_info.text = (
			"SINGLE WEAPON: %s\n" % w_name
			+ "REACH: %.2fm (Arc: %d°)  |  [LMB] Cleave  [RMB] Technique  [F] Kick/Execute"
			% [float(player.get_effective_melee_reach()), int(w_cfg.get("horizontal_arc_deg", 120))]
		)
	else:
		var ammo_str := "RELOADING..." if bool(player.is_reloading) else ("%d / %d" % [int(player.ammo), int(player.max_ammo)])
		lbl_weapon_info.text = (
			"SINGLE WEAPON: %s\n" % w_name
			+ "AMMO: %s  |  [LMB] Fire  [RMB] Alt-Burst/Jump  [R] Active Blood Reload  [F] Kick" % ammo_str
		)
