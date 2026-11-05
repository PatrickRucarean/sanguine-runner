extends Node3D

## DUSK-inspired 3D Main Menu Scene (res://scenes/menus/MainMenu.tscn)
## Features a slow-panning grim 3D Gothic Crypt/Butcher Cellar backdrop, flickering candle & torch lights,
## hanging corpses, butcher cleaver table, drifting red embers, hover/click audio feedback,
## and professional menu stack: NEW SLAUGHTER, ENDLESS MODE, SETTINGS, CREDITS, EXIT.

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")
const DataCatalog = preload("res://scripts/DataCatalog.gd")

var menu_camera: Camera3D
var candle_light: OmniLight3D
var sanctuary_light: OmniLight3D
var hung_corpses: Array[Node3D] = []
var ember_particles: Array[Dictionary] = []
var ember_canvas: Control

var hover_sfx: AudioStreamPlayer
var click_sfx: AudioStreamPlayer
var ambient_music: AudioStreamPlayer

var settings_modal: PanelContainer
var credits_modal: PanelContainer
var time_acc: float = 0.0


func _ready() -> void:
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	_apply_audio_settings()
	_build_3d_dusk_crypt_backdrop()
	_build_audio_players()
	_build_dusk_ui()


func _apply_audio_settings() -> void:
	AudioServer.set_bus_volume_db(0, DataCatalog.master_vol_db)
	if DataCatalog.is_fullscreen:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)


func _build_audio_players() -> void:
	hover_sfx = AudioStreamPlayer.new()
	hover_sfx.stream = RetroAssetLoader.load_wav("res://assets/audio/ui_hover.wav")
	hover_sfx.volume_db = DataCatalog.sfx_vol_db - 2.0
	add_child(hover_sfx)

	click_sfx = AudioStreamPlayer.new()
	click_sfx.stream = RetroAssetLoader.load_wav("res://assets/audio/ui_click.wav")
	click_sfx.volume_db = DataCatalog.sfx_vol_db + 1.0
	add_child(click_sfx)

	ambient_music = AudioStreamPlayer.new()
	ambient_music.stream = RetroAssetLoader.load_wav("res://assets/audio/dark_organ_drone.wav", true)
	ambient_music.volume_db = DataCatalog.music_vol_db
	ambient_music.autoplay = true
	add_child(ambient_music)
	ambient_music.play()


func _play_hover() -> void:
	if hover_sfx:
		hover_sfx.volume_db = DataCatalog.sfx_vol_db - 2.0
		hover_sfx.pitch_scale = randf_range(0.95, 1.06)
		hover_sfx.play()


func _play_click() -> void:
	if click_sfx:
		click_sfx.volume_db = DataCatalog.sfx_vol_db + 1.0
		click_sfx.pitch_scale = randf_range(0.96, 1.04)
		click_sfx.play()


func _build_3d_dusk_crypt_backdrop() -> void:
	# 1. Atmospheric WorldEnvironment (DUSK oppressive amber-crimson fog)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.03, 0.015, 0.015)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.24, 0.12, 0.10)
	env.ambient_light_energy = 0.65
	env.fog_enabled = true
	env.fog_light_color = Color(0.14, 0.04, 0.03)
	env.fog_density = 0.042
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC

	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	# 2. Materials (Nearest pixel-art filtering)
	var mat_tile: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/dusk_tile_wall.png", Vector3(4, 3, 4))
	var mat_floor: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/wet_stone_floor.png", Vector3(5, 5, 5))
	var mat_wood: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/rotten_wood.png", Vector3(3, 2, 3))
	var mat_stone: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/gothic_arch_stone.png", Vector3(2, 3, 2))
	var mat_prop: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/weapon_atlas.png", Vector3.ONE)
	var mat_corpse: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/ghoul_tex.png", Vector3.ONE)

	# 3. Butcher Cellar / Cathedral Crypt Room Geometry
	_add_box_mesh(Vector3(0, -0.25, 0), Vector3(14.0, 0.5, 16.0), mat_floor)
	_add_box_mesh(Vector3(0, 5.25, 0), Vector3(14.0, 0.5, 16.0), mat_wood)
	_add_box_mesh(Vector3(0, 2.5, -6.5), Vector3(14.0, 5.5, 0.5), mat_tile)
	_add_box_mesh(Vector3(-6.2, 2.5, 0), Vector3(0.5, 5.5, 16.0), mat_tile)
	_add_box_mesh(Vector3(6.2, 2.5, 0), Vector3(0.5, 5.5, 16.0), mat_tile)

	# Wooden structural beams & pillars (DUSK cellar look)
	for z_beam in [-4.5, -1.5, 1.5]:
		_add_box_mesh(Vector3(0, 4.75, z_beam), Vector3(13.0, 0.45, 0.45), mat_wood)
	for sx in [-3.4, 3.4]:
		_add_box_mesh(Vector3(sx, 2.5, -4.5), Vector3(0.55, 5.0, 0.55), mat_wood)
		_add_box_mesh(Vector3(sx, 2.5, -1.2), Vector3(0.65, 5.0, 0.65), mat_stone)

	# 4. Left Sacrifice Table + Stuck Butcher Meat Cleaver + Flickering Candle (Direct DUSK Homage!)
	_add_box_mesh(Vector3(-2.6, 0.95, -2.6), Vector3(2.2, 0.14, 3.6), mat_wood)
	for lx in [-3.4, -1.8]:
		for lz in [-4.1, -1.1]:
			_add_box_mesh(Vector3(lx, 0.45, lz), Vector3(0.18, 0.9, 0.18), mat_wood)

	# Blood splatter decal on the sacrifice table & floor
	var splat_tex: Texture2D = RetroAssetLoader.load_pixel_texture("res://assets/textures/blood_splatter.png")
	var splat_mat := StandardMaterial3D.new()
	splat_mat.albedo_texture = splat_tex
	splat_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	splat_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	splat_mat.roughness = 0.35
	_add_box_mesh(Vector3(-2.4, 1.03, -2.5), Vector3(1.5, 0.01, 1.8), splat_mat)
	_add_box_mesh(Vector3(0.4, 0.01, -3.2), Vector3(2.8, 0.01, 2.8), splat_mat)
	_add_box_mesh(Vector3(0.6, 2.2, -6.22), Vector3(2.4, 2.2, 0.02), splat_mat)

	# Meat Cleaver embedded into the sacrifice table
	var cleaver_mi := MeshInstance3D.new()
	cleaver_mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/meat_cleaver.obj", mat_prop)
	cleaver_mi.material_override = mat_prop
	cleaver_mi.position = Vector3(-2.15, 1.16, -2.25)
	cleaver_mi.rotation_degrees = Vector3(28.0, 35.0, -18.0)
	cleaver_mi.scale = Vector3.ONE * 1.45
	add_child(cleaver_mi)

	# Candle on table corner
	var candle_mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.045
	cyl.bottom_radius = 0.055
	cyl.height = 0.36
	cyl.material = mat_prop
	candle_mi.mesh = cyl
	candle_mi.position = Vector3(-1.68, 1.20, -3.45)
	add_child(candle_mi)

	# Overturned wooden chair & barrels on floor (DUSK composition)
	var chair_node := Node3D.new()
	chair_node.position = Vector3(-0.65, 0.38, -1.65)
	chair_node.rotation_degrees = Vector3(58.0, -32.0, 24.0)
	add_child(chair_node)
	var ch_seat := MeshInstance3D.new()
	var ch_box := BoxMesh.new()
	ch_box.size = Vector3(0.68, 0.08, 0.68)
	ch_box.material = mat_wood
	ch_seat.mesh = ch_box
	chair_node.add_child(ch_seat)
	var ch_back := MeshInstance3D.new()
	var back_box := BoxMesh.new()
	back_box.size = Vector3(0.68, 0.75, 0.08)
	back_box.material = mat_wood
	ch_back.mesh = back_box
	ch_back.position = Vector3(0, 0.38, -0.30)
	chair_node.add_child(ch_back)

	# Blood Fountain & Impaled Skull Pikes in background
	var fount_mi := MeshInstance3D.new()
	fount_mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/blood_fountain.obj", mat_stone)
	fount_mi.material_override = mat_stone
	fount_mi.position = Vector3(2.4, 0.0, -4.2)
	fount_mi.scale = Vector3.ONE * 0.78
	add_child(fount_mi)

	for px in [-0.8, 1.8]:
		var pike_mi := MeshInstance3D.new()
		pike_mi.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/impaled_skull_pike.obj", mat_corpse)
		pike_mi.material_override = mat_corpse
		pike_mi.position = Vector3(px, 0.0, -5.2)
		add_child(pike_mi)

	# Swaying Hung Corpses suspended from ceiling beams
	var corpse_mesh: ArrayMesh = RetroAssetLoader.load_obj_mesh("res://assets/models/hung_corpse.obj", mat_corpse)
	for c_pos in [Vector3(-1.2, 4.8, -4.4), Vector3(2.1, 4.8, -2.6), Vector3(3.8, 4.8, -4.8)]:
		var c_mi := MeshInstance3D.new()
		c_mi.mesh = corpse_mesh
		c_mi.material_override = mat_corpse
		c_mi.position = c_pos
		add_child(c_mi)
		hung_corpses.append(c_mi)

	# 5. Dynamic Flickering Candle & Crimson Sanctuary Lights
	candle_light = OmniLight3D.new()
	candle_light.position = Vector3(-1.68, 1.55, -3.45)
	candle_light.light_color = Color(1.0, 0.56, 0.18)
	candle_light.light_energy = 2.6
	candle_light.omni_range = 9.5
	candle_light.shadow_enabled = true
	add_child(candle_light)

	sanctuary_light = OmniLight3D.new()
	sanctuary_light.position = Vector3(1.8, 3.2, -3.5)
	sanctuary_light.light_color = Color(0.95, 0.14, 0.12)
	sanctuary_light.light_energy = 1.9
	sanctuary_light.omni_range = 13.0
	add_child(sanctuary_light)

	# 6. Slow-Panning DUSK Camera3D
	menu_camera = Camera3D.new()
	menu_camera.fov = 74.0
	menu_camera.position = Vector3(-0.35, 2.35, 1.35)
	menu_camera.rotation_degrees = Vector3(-16.0, -8.0, 0.0)
	add_child(menu_camera)


func _add_box_mesh(pos: Vector3, size: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	bm.material = mat
	mi.mesh = bm
	mi.position = pos
	add_child(mi)
	return mi


func _build_dusk_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)

	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(root)

	# Subtle dark vignette bars at top & bottom
	var top_vignette := ColorRect.new()
	top_vignette.color = Color(0.0, 0.0, 0.0, 0.45)
	top_vignette.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_vignette.custom_minimum_size = Vector2(0, 70)
	root.add_child(top_vignette)

	# Drifting Red Ember Particles Layer
	ember_canvas = Control.new()
	ember_canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	ember_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ember_canvas)
	for i in range(36):
		var dot := ColorRect.new()
		var sz: float = randf_range(2.0, 5.0)
		dot.size = Vector2(sz, sz)
		dot.color = Color(1.0, randf_range(0.18, 0.55), 0.08, randf_range(0.35, 0.85))
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ember_canvas.add_child(dot)
		ember_particles.append({
			"node": dot,
			"pos": Vector2(randf_range(0.0, 1600.0), randf_range(0.0, 900.0)),
			"vel": Vector2(randf_range(-18.0, 22.0), randf_range(-42.0, -16.0))
		})

	# Center DUSK Logo + Menu Stack
	var center_vbox := VBoxContainer.new()
	center_vbox.set_anchors_preset(Control.PRESET_CENTER)
	center_vbox.position = Vector2(-340, -270)
	center_vbox.custom_minimum_size = Vector2(680, 540)
	center_vbox.add_theme_constant_override("separation", 14)
	root.add_child(center_vbox)

	# Jagged Corroded DUSK-Style Logo Header
	var logo_shadow := Label.new()
	logo_shadow.text = "S A N G U I N E"
	logo_shadow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	logo_shadow.add_theme_font_size_override("font_size", 74)
	logo_shadow.add_theme_color_override("font_color", Color(0.82, 0.22, 0.08))
	logo_shadow.add_theme_color_override("font_shadow_color", Color(0.05, 0.01, 0.01, 0.98))
	logo_shadow.add_theme_constant_override("shadow_offset_x", 5)
	logo_shadow.add_theme_constant_override("shadow_offset_y", 6)
	logo_shadow.add_theme_color_override("font_outline_color", Color(1.0, 0.48, 0.12))
	logo_shadow.add_theme_constant_override("outline_size", 4)
	center_vbox.add_child(logo_shadow)

	var sub_logo := Label.new()
	sub_logo.text = "— DUSK OF THE CATACOMB SLAUGHTER —"
	sub_logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub_logo.add_theme_font_size_override("font_size", 16)
	sub_logo.add_theme_color_override("font_color", Color(0.75, 0.66, 0.62))
	center_vbox.add_child(sub_logo)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 24)
	center_vbox.add_child(spacer)

	var header_lbl := Label.new()
	header_lbl.text = "MAIN MENU"
	header_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	header_lbl.add_theme_font_size_override("font_size", 26)
	header_lbl.add_theme_color_override("font_color", Color(0.95, 0.12, 0.08))
	header_lbl.add_theme_color_override("font_shadow_color", Color.BLACK)
	header_lbl.add_theme_constant_override("shadow_offset_y", 3)
	center_vbox.add_child(header_lbl)

	# Menu Buttons (Styled like DUSK's centered weathered stone text buttons)
	_add_dusk_menu_button(center_vbox, "NEW SLAUGHTER (SELECT BLOODLINE)", func():
		_play_click()
		get_tree().change_scene_to_file("res://scenes/menus/CharacterSelect.tscn")
	)
	_add_dusk_menu_button(center_vbox, "ENDLESS ARENA (QUICK DROP)", func():
		_play_click()
		DataCatalog.selected_danger_tier = 1
		get_tree().change_scene_to_file("res://scenes/Main.tscn")
	)
	_add_dusk_menu_button(center_vbox, "SETTINGS", func():
		_play_click()
		credits_modal.visible = false
		settings_modal.visible = not settings_modal.visible
	)
	_add_dusk_menu_button(center_vbox, "CREDITS", func():
		_play_click()
		settings_modal.visible = false
		credits_modal.visible = not credits_modal.visible
	)
	_add_dusk_menu_button(center_vbox, "EXIT TO DESKTOP", func():
		_play_click()
		get_tree().quit()
	)

	# Build Modals (Settings & Credits)
	_build_settings_modal(root)
	_build_credits_modal(root)


func _add_dusk_menu_button(parent: Control, label_text: String, on_click: Callable) -> Button:
	var btn := Button.new()
	btn.text = label_text
	btn.custom_minimum_size = Vector2(460, 46)
	btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	btn.add_theme_font_size_override("font_size", 24)
	btn.add_theme_color_override("font_color", Color(0.76, 0.74, 0.72))
	btn.add_theme_color_override("font_hover_color", Color(1.0, 0.18, 0.12))
	btn.add_theme_color_override("font_pressed_color", Color(1.0, 0.82, 0.24))

	var normal_sb := StyleBoxFlat.new()
	normal_sb.bg_color = Color(0.04, 0.02, 0.02, 0.55)
	normal_sb.border_width_bottom = 2
	normal_sb.border_color = Color(0.32, 0.12, 0.12, 0.65)
	btn.add_theme_stylebox_override("normal", normal_sb)

	var hover_sb := StyleBoxFlat.new()
	hover_sb.bg_color = Color(0.18, 0.03, 0.04, 0.88)
	hover_sb.border_width_left = 4
	hover_sb.border_width_right = 4
	hover_sb.border_width_top = 1
	hover_sb.border_width_bottom = 2
	hover_sb.border_color = Color(0.95, 0.16, 0.12, 1.0)
	btn.add_theme_stylebox_override("hover", hover_sb)
	btn.add_theme_stylebox_override("pressed", hover_sb)

	btn.mouse_entered.connect(_play_hover)
	btn.pressed.connect(on_click)
	parent.add_child(btn)
	return btn


func _build_settings_modal(root: Control) -> void:
	settings_modal = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.03, 0.04, 0.97)
	sb.border_width_left = 3
	sb.border_width_right = 3
	sb.border_width_top = 3
	sb.border_width_bottom = 3
	sb.border_color = Color(0.85, 0.14, 0.18)
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 20
	sb.content_margin_bottom = 20
	settings_modal.add_theme_stylebox_override("panel", sb)
	settings_modal.set_anchors_preset(Control.PRESET_CENTER)
	settings_modal.position = Vector2(-260, -210)
	settings_modal.custom_minimum_size = Vector2(520, 420)
	settings_modal.visible = false
	root.add_child(settings_modal)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	settings_modal.add_child(vb)

	var title := Label.new()
	title.text = "CRYPT SETTINGS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color(0.95, 0.16, 0.20))
	vb.add_child(title)

	# Master Volume
	var lbl_m := Label.new()
	lbl_m.text = "Master Volume: %d dB" % int(DataCatalog.master_vol_db)
	vb.add_child(lbl_m)
	var sl_m := HSlider.new()
	sl_m.min_value = -40.0
	sl_m.max_value = 6.0
	sl_m.step = 1.0
	sl_m.value = DataCatalog.master_vol_db
	sl_m.value_changed.connect(func(v: float):
		DataCatalog.master_vol_db = v
		AudioServer.set_bus_volume_db(0, v)
		lbl_m.text = "Master Volume: %d dB" % int(v)
	)
	vb.add_child(sl_m)

	# SFX Volume
	var lbl_s := Label.new()
	lbl_s.text = "SFX Volume: %d dB" % int(DataCatalog.sfx_vol_db)
	vb.add_child(lbl_s)
	var sl_s := HSlider.new()
	sl_s.min_value = -40.0
	sl_s.max_value = 6.0
	sl_s.step = 1.0
	sl_s.value = DataCatalog.sfx_vol_db
	sl_s.value_changed.connect(func(v: float):
		DataCatalog.sfx_vol_db = v
		lbl_s.text = "SFX Volume: %d dB" % int(v)
	)
	vb.add_child(sl_s)

	# Music Volume
	var lbl_mu := Label.new()
	lbl_mu.text = "Music / Organ Volume: %d dB" % int(DataCatalog.music_vol_db)
	vb.add_child(lbl_mu)
	var sl_mu := HSlider.new()
	sl_mu.min_value = -40.0
	sl_mu.max_value = 6.0
	sl_mu.step = 1.0
	sl_mu.value = DataCatalog.music_vol_db
	sl_mu.value_changed.connect(func(v: float):
		DataCatalog.music_vol_db = v
		ambient_music.volume_db = v
		lbl_mu.text = "Music / Organ Volume: %d dB" % int(v)
	)
	vb.add_child(sl_mu)

	# Mouse Sensitivity
	var lbl_sens := Label.new()
	lbl_sens.text = "Mouse Sensitivity: %.1f" % (DataCatalog.mouse_sens * 1000.0)
	vb.add_child(lbl_sens)
	var sl_sens := HSlider.new()
	sl_sens.min_value = 0.5
	sl_sens.max_value = 6.5
	sl_sens.step = 0.1
	sl_sens.value = DataCatalog.mouse_sens * 1000.0
	sl_sens.value_changed.connect(func(v: float):
		DataCatalog.mouse_sens = v * 0.001
		lbl_sens.text = "Mouse Sensitivity: %.1f" % v
	)
	vb.add_child(sl_sens)

	# Invert Y + Fullscreen Toggle Row
	var chk_row := HBoxContainer.new()
	chk_row.add_theme_constant_override("separation", 20)
	vb.add_child(chk_row)

	var chk_inv := CheckBox.new()
	chk_inv.text = "Invert Mouse Y-Axis"
	chk_inv.button_pressed = DataCatalog.invert_y
	chk_inv.toggled.connect(func(on: bool):
		DataCatalog.invert_y = on
	)
	chk_row.add_child(chk_inv)

	var btn_fs := Button.new()
	btn_fs.text = "TOGGLE FULLSCREEN"
	btn_fs.pressed.connect(func():
		_play_click()
		DataCatalog.is_fullscreen = not DataCatalog.is_fullscreen
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if DataCatalog.is_fullscreen else DisplayServer.WINDOW_MODE_WINDOWED)
	)
	chk_row.add_child(btn_fs)

	var close_btn := Button.new()
	close_btn.text = "CLOSE SETTINGS"
	close_btn.custom_minimum_size = Vector2(0, 38)
	close_btn.pressed.connect(func():
		_play_click()
		settings_modal.visible = false
	)
	vb.add_child(close_btn)


func _build_credits_modal(root: Control) -> void:
	credits_modal = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.03, 0.04, 0.97)
	sb.border_width_left = 3
	sb.border_width_right = 3
	sb.border_width_top = 3
	sb.border_width_bottom = 3
	sb.border_color = Color(0.85, 0.14, 0.18)
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 20
	sb.content_margin_bottom = 20
	credits_modal.add_theme_stylebox_override("panel", sb)
	credits_modal.set_anchors_preset(Control.PRESET_CENTER)
	credits_modal.position = Vector2(-260, -160)
	credits_modal.custom_minimum_size = Vector2(520, 320)
	credits_modal.visible = false
	root.add_child(credits_modal)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 14)
	credits_modal.add_child(vb)

	var title := Label.new()
	title.text = "SANGUINE RUNNER — CREDITS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.95, 0.18, 0.22))
	vb.add_child(title)

	var body := Label.new()
	body.text = "Engine: Godot 4.3 Native (Retro Nearest-Pixel Pipeline)\nAesthetic Inspiration: DUSK, Quake, Blood & Hellsing Ultimate\nLoadout & Drafting Inspiration: Risk of Rain 2, Brotato & ARAM Mayhem\n\nCrafted for high-velocity Gothic Catacomb slaughter."
	body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(body)

	var close_btn := Button.new()
	close_btn.text = "CLOSE"
	close_btn.custom_minimum_size = Vector2(0, 38)
	close_btn.pressed.connect(func():
		_play_click()
		credits_modal.visible = false
	)
	vb.add_child(close_btn)


func _process(delta: float) -> void:
	time_acc += delta

	# Slow atmospheric DUSK camera pan & breathing
	if menu_camera:
		menu_camera.position.x = -0.35 + sin(time_acc * 0.42) * 0.38
		menu_camera.position.y = 2.35 + cos(time_acc * 0.65) * 0.08
		menu_camera.rotation_degrees.y = -8.0 + sin(time_acc * 0.35) * 4.5
		menu_camera.rotation_degrees.x = -16.0 + cos(time_acc * 0.50) * 1.6

	# Candle & Sanctuary Light Flicker
	if candle_light:
		candle_light.light_energy = 2.5 + sin(time_acc * 11.0) * 0.35 + cos(time_acc * 23.0) * 0.20
	if sanctuary_light:
		sanctuary_light.light_energy = 1.85 + sin(time_acc * 4.2) * 0.25

	# Swaying Hung Corpses
	for i in range(hung_corpses.size()):
		var c: Node3D = hung_corpses[i]
		c.rotation.z = sin(time_acc * 1.4 + float(i) * 1.7) * 0.065
		c.rotation.x = cos(time_acc * 1.1 + float(i) * 2.1) * 0.045

	# Drifting Red Ember Particles
	var vp_sz: Vector2 = get_viewport().get_visible_rect().size
	for p in ember_particles:
		var node: ColorRect = p["node"]
		var pos: Vector2 = p["pos"] + p["vel"] * delta
		if pos.y < -10.0:
			pos.y = vp_sz.y + 10.0
			pos.x = randf_range(0.0, vp_sz.x)
		if pos.x < -10.0:
			pos.x = vp_sz.x + 10.0
		elif pos.x > vp_sz.x + 10.0:
			pos.x = -10.0
		p["pos"] = pos
		node.position = pos
