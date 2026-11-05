extends Node3D

## Risk of Rain 2 + DUSK Inspired Character & Weapon Select Scene (res://scenes/menus/CharacterSelect.tscn)
## - Top-Left: "Character Select" + 3 Supernatural Character Portraits + 3 Locked Crypt Slots
## - Left Panel: Character Name, Race, Attire, [OVERVIEW & STATS] / [SKILLS & PASSIVES] Tabs
## - Center 3D Stage: Live 3D Character Model (Vampire Lord, Lycan Stalker, Plague Lich) on a Gothic Pedestal holding the selected weapon
## - Bottom Row: Shared Starting Weapon Cards with icons, fire modes, and detailed specs (Reach, Arc, Damage, Mechanics)
## - Right Panel: Difficulty / Corruption Tier selector (Danger 0-5) + Artifacts summary + READY / EMBARK button

const RetroAssetLoader = preload("res://scripts/RetroAssetLoader.gd")
const DataCatalog = preload("res://scripts/DataCatalog.gd")

var stage_camera: Camera3D
var pedestal_pivot: Node3D
var char_mesh_inst: MeshInstance3D
var char_right_weapon_inst: MeshInstance3D
var char_left_weapon_inst: MeshInstance3D
var aura_light: OmniLight3D

var hover_sfx: AudioStreamPlayer
var click_sfx: AudioStreamPlayer
var ambient_music: AudioStreamPlayer

# UI References
var portrait_row: HBoxContainer
var lbl_char_name: Label
var lbl_char_race: Label
var lbl_char_attire: Label
var tab_overview_btn: Button
var tab_skills_btn: Button
var overview_container: VBoxContainer
var skills_container: VBoxContainer
var weapons_row: HBoxContainer
var lbl_weapon_detail: Label
var diff_buttons_row: HBoxContainer
var lbl_diff_desc: Label

var active_tab: String = "SKILLS" # Default to RoR2 Skills view or toggleable with Overview
var time_acc: float = 0.0


func _ready() -> void:
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	# Ensure valid default character & weapon
	if not DataCatalog.CHARACTERS.has(DataCatalog.selected_char_id):
		DataCatalog.selected_char_id = "vlad_vampire"
	var allowed: Array = DataCatalog.CHARACTERS[DataCatalog.selected_char_id]["allowed_weapons"]
	if not (DataCatalog.selected_weapon_id in allowed):
		DataCatalog.selected_weapon_id = String(allowed[0])

	_build_audio()
	_build_3d_pedestal_stage()
	_build_ror2_dusk_ui()
	_refresh_all()


func _build_audio() -> void:
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
	ambient_music.volume_db = DataCatalog.music_vol_db - 2.0
	add_child(ambient_music)
	ambient_music.play()


func _play_hover() -> void:
	if hover_sfx:
		hover_sfx.pitch_scale = randf_range(0.95, 1.06)
		hover_sfx.play()


func _play_click() -> void:
	if click_sfx:
		click_sfx.pitch_scale = randf_range(0.96, 1.04)
		click_sfx.play()


func _build_3d_pedestal_stage() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.03, 0.015, 0.025)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.22, 0.14, 0.18)
	env.ambient_light_energy = 0.75
	env.fog_enabled = true
	env.fog_light_color = Color(0.10, 0.03, 0.05)
	env.fog_density = 0.032
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC

	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var mat_floor: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/wet_stone_floor.png", Vector3(6, 6, 6))
	var mat_stone: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/gothic_arch_stone.png", Vector3(3, 3, 3))
	var mat_brick: StandardMaterial3D = RetroAssetLoader.make_retro_material("res://assets/textures/gothic_brick.png", Vector3(5, 3, 5))

	# Crypt Hall Floor & Background Columns
	_add_stage_box(Vector3(0, -0.3, 0), Vector3(22.0, 0.6, 18.0), mat_floor)
	_add_stage_box(Vector3(0, 4.0, -5.5), Vector3(22.0, 9.0, 0.6), mat_brick)
	for px in [-4.5, -1.5, 2.5, 5.5]:
		_add_stage_box(Vector3(px, 3.5, -4.2), Vector3(0.85, 7.5, 0.85), mat_stone)

	# Raised Octagonal Pedestal at X = +0.55 (Center-Right like Risk of Rain 2!)
	pedestal_pivot = Node3D.new()
	pedestal_pivot.position = Vector3(0.55, 0.0, -0.85)
	add_child(pedestal_pivot)

	var ped_base := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 1.05
	cyl.bottom_radius = 1.25
	cyl.height = 0.28
	cyl.radial_segments = 8
	cyl.material = mat_stone
	ped_base.mesh = cyl
	ped_base.position = Vector3(0, 0.14, 0)
	pedestal_pivot.add_child(ped_base)

	# Character 3D Mesh Instance + Equipped Weapon Instances
	char_mesh_inst = MeshInstance3D.new()
	char_mesh_inst.position = Vector3(0, 0.28, 0)
	pedestal_pivot.add_child(char_mesh_inst)

	char_right_weapon_inst = MeshInstance3D.new()
	char_mesh_inst.add_child(char_right_weapon_inst)

	char_left_weapon_inst = MeshInstance3D.new()
	char_mesh_inst.add_child(char_left_weapon_inst)

	# Dramatic Rim & Key Lighting
	var key_light := SpotLight3D.new()
	key_light.position = Vector3(2.2, 4.2, 2.6)
	key_light.look_at_from_position(key_light.position, Vector3(0.55, 1.3, -0.85), Vector3.UP)
	key_light.light_color = Color(1.0, 0.92, 0.86)
	key_light.light_energy = 3.2
	key_light.spot_range = 12.0
	key_light.spot_angle = 42.0
	add_child(key_light)

	aura_light = OmniLight3D.new()
	aura_light.position = Vector3(0.55, 1.5, -1.8)
	aura_light.light_color = Color(0.95, 0.14, 0.22)
	aura_light.light_energy = 2.8
	aura_light.omni_range = 7.5
	add_child(aura_light)

	# Camera positioned so character stands prominently at Center/Center-Right
	stage_camera = Camera3D.new()
	stage_camera.fov = 52.0
	stage_camera.position = Vector3(0.0, 1.48, 2.85)
	stage_camera.rotation_degrees = Vector3(-5.0, 0.0, 0.0)
	add_child(stage_camera)


func _add_stage_box(pos: Vector3, size: Vector3, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	bm.material = mat
	mi.mesh = bm
	mi.position = pos
	add_child(mi)


func _make_panel_sb(border_col: Color, bg_col: Color = Color(0.05, 0.02, 0.03, 0.90)) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg_col
	sb.border_width_left = 2
	sb.border_width_right = 2
	sb.border_width_top = 2
	sb.border_width_bottom = 2
	sb.border_color = border_col
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	return sb


func _build_ror2_dusk_ui() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)

	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(root)

	# =========================================================================
	# 1. TOP-LEFT: "Character Select" Title + RoR2 Portrait Row
	# =========================================================================
	var top_left := VBoxContainer.new()
	top_left.position = Vector2(38, 22)
	top_left.add_theme_constant_override("separation", 10)
	root.add_child(top_left)

	var title_lbl := Label.new()
	title_lbl.text = "Character Select"
	title_lbl.add_theme_font_size_override("font_size", 32)
	title_lbl.add_theme_color_override("font_color", Color(0.96, 0.94, 0.92))
	title_lbl.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_lbl.add_theme_constant_override("shadow_offset_y", 3)
	top_left.add_child(title_lbl)

	portrait_row = HBoxContainer.new()
	portrait_row.add_theme_constant_override("separation", 8)
	top_left.add_child(portrait_row)

	# =========================================================================
	# 2. LEFT PANEL: Character Name, Race, Attire & [Overview | Skills] Tabs
	# =========================================================================
	var left_panel := PanelContainer.new()
	left_panel.add_theme_stylebox_override("panel", _make_panel_sb(Color(0.42, 0.14, 0.18), Color(0.04, 0.02, 0.03, 0.88)))
	left_panel.position = Vector2(38, 152)
	left_panel.custom_minimum_size = Vector2(520, 445)
	root.add_child(left_panel)

	var left_vb := VBoxContainer.new()
	left_vb.add_theme_constant_override("separation", 8)
	left_panel.add_child(left_vb)

	lbl_char_name = Label.new()
	lbl_char_name.add_theme_font_size_override("font_size", 24)
	lbl_char_name.add_theme_color_override("font_color", Color(1.0, 0.88, 0.32))
	left_vb.add_child(lbl_char_name)

	lbl_char_race = Label.new()
	lbl_char_race.add_theme_font_size_override("font_size", 14)
	lbl_char_race.add_theme_color_override("font_color", Color(0.95, 0.28, 0.34))
	left_vb.add_child(lbl_char_race)

	lbl_char_attire = Label.new()
	lbl_char_attire.add_theme_font_size_override("font_size", 13)
	lbl_char_attire.add_theme_color_override("font_color", Color(0.80, 0.76, 0.74))
	lbl_char_attire.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left_vb.add_child(lbl_char_attire)

	# RoR2 Style Tab Buttons: [Overview] | [Skills]
	var tab_row := HBoxContainer.new()
	tab_row.add_theme_constant_override("separation", 8)
	left_vb.add_child(tab_row)

	tab_overview_btn = Button.new()
	tab_overview_btn.text = "Overview & Stats"
	tab_overview_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tab_overview_btn.custom_minimum_size = Vector2(0, 32)
	tab_overview_btn.pressed.connect(func():
		_play_click()
		active_tab = "OVERVIEW"
		_refresh_all()
	)
	tab_row.add_child(tab_overview_btn)

	tab_skills_btn = Button.new()
	tab_skills_btn.text = "Skills & Passives"
	tab_skills_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tab_skills_btn.custom_minimum_size = Vector2(0, 32)
	tab_skills_btn.pressed.connect(func():
		_play_click()
		active_tab = "SKILLS"
		_refresh_all()
	)
	tab_row.add_child(tab_skills_btn)

	overview_container = VBoxContainer.new()
	overview_container.add_theme_constant_override("separation", 8)
	left_vb.add_child(overview_container)

	skills_container = VBoxContainer.new()
	skills_container.add_theme_constant_override("separation", 8)
	left_vb.add_child(skills_container)

	# =========================================================================
	# 3. RIGHT PANEL: Difficulty (Danger 0-5) & Catacomb Modifiers (RoR2 Style)
	# =========================================================================
	var right_panel := PanelContainer.new()
	right_panel.add_theme_stylebox_override("panel", _make_panel_sb(Color(0.45, 0.16, 0.20), Color(0.04, 0.02, 0.03, 0.88)))
	right_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	right_panel.position = Vector2(-385, 152)
	right_panel.custom_minimum_size = Vector2(348, 360)
	root.add_child(right_panel)

	var right_vb := VBoxContainer.new()
	right_vb.add_theme_constant_override("separation", 10)
	right_panel.add_child(right_vb)

	var diff_hdr := Label.new()
	diff_hdr.text = "DIFFICULTY / CORRUPTION"
	diff_hdr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	diff_hdr.add_theme_font_size_override("font_size", 18)
	diff_hdr.add_theme_color_override("font_color", Color(0.95, 0.22, 0.28))
	right_vb.add_child(diff_hdr)

	diff_buttons_row = HBoxContainer.new()
	diff_buttons_row.alignment = BoxContainer.ALIGNMENT_CENTER
	diff_buttons_row.add_theme_constant_override("separation", 6)
	right_vb.add_child(diff_buttons_row)

	lbl_diff_desc = Label.new()
	lbl_diff_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl_diff_desc.add_theme_font_size_override("font_size", 13)
	lbl_diff_desc.add_theme_color_override("font_color", Color(0.88, 0.82, 0.78))
	right_vb.add_child(lbl_diff_desc)

	var sep := HSeparator.new()
	right_vb.add_child(sep)

	var art_hdr := Label.new()
	art_hdr.text = "CRYPT LAWS & SYNERGIES"
	art_hdr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	art_hdr.add_theme_font_size_override("font_size", 16)
	art_hdr.add_theme_color_override("font_color", Color(0.75, 0.55, 0.95))
	right_vb.add_child(art_hdr)

	var art_lbl := Label.new()
	art_lbl.text = "• Single-Weapon Mastery (No Multi-Weapon Clutter)\n• Dual-Wield Left-Hand Stake + Right-Hand Hammer\n• Compounded +20% HP & +3% Speed per Wave\n• ARAM Mayhem Per-Card Reroll + Pity Timer"
	art_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	art_lbl.add_theme_font_size_override("font_size", 12)
	art_lbl.add_theme_color_override("font_color", Color(0.76, 0.72, 0.74))
	right_vb.add_child(art_lbl)

	# =========================================================================
	# 4. BOTTOM ROW: Starting Weapon Arsenal (Shared 5-Weapon Pool) + BACK / READY
	# =========================================================================
	var bottom_panel := PanelContainer.new()
	bottom_panel.add_theme_stylebox_override("panel", _make_panel_sb(Color(0.50, 0.16, 0.20), Color(0.04, 0.02, 0.03, 0.92)))
	bottom_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	bottom_panel.position = Vector2(38, -238)
	bottom_panel.custom_minimum_size = Vector2(1364, 172)
	root.add_child(bottom_panel)

	var bot_vb := VBoxContainer.new()
	bot_vb.add_theme_constant_override("separation", 6)
	bottom_panel.add_child(bot_vb)

	var w_hdr_row := HBoxContainer.new()
	w_hdr_row.add_theme_constant_override("separation", 18)
	bot_vb.add_child(w_hdr_row)

	var w_hdr := Label.new()
	w_hdr.text = "STARTING SIGNATURE WEAPON (SHARED 5-WEAPON ARSENAL):"
	w_hdr.add_theme_font_size_override("font_size", 15)
	w_hdr.add_theme_color_override("font_color", Color(1.0, 0.82, 0.26))
	w_hdr_row.add_child(w_hdr)

	lbl_weapon_detail = Label.new()
	lbl_weapon_detail.add_theme_font_size_override("font_size", 13)
	lbl_weapon_detail.add_theme_color_override("font_color", Color(0.92, 0.78, 0.80))
	w_hdr_row.add_child(lbl_weapon_detail)

	weapons_row = HBoxContainer.new()
	weapons_row.add_theme_constant_override("separation", 10)
	bot_vb.add_child(weapons_row)

	# Bottom-Left BACK button & Bottom-Right READY / EMBARK button (RoR2 Layout)
	var btn_back := Button.new()
	btn_back.text = "BACK TO MAIN MENU"
	btn_back.position = Vector2(38, 842)
	btn_back.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	btn_back.position = Vector2(38, -56)
	btn_back.custom_minimum_size = Vector2(210, 44)
	btn_back.add_theme_font_size_override("font_size", 16)
	btn_back.mouse_entered.connect(_play_hover)
	btn_back.pressed.connect(func():
		_play_click()
		get_tree().change_scene_to_file("res://scenes/menus/MainMenu.tscn")
	)
	root.add_child(btn_back)

	var btn_ready := Button.new()
	btn_ready.text = "READY — EMBARK INTO THE CRYPT"
	btn_ready.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn_ready.position = Vector2(-385, -58)
	btn_ready.custom_minimum_size = Vector2(348, 48)
	btn_ready.add_theme_font_size_override("font_size", 18)
	var ready_sb := _make_panel_sb(Color(1.0, 0.84, 0.25), Color(0.55, 0.08, 0.12, 0.98))
	btn_ready.add_theme_stylebox_override("normal", ready_sb)
	btn_ready.add_theme_stylebox_override("hover", _make_panel_sb(Color.WHITE, Color(0.75, 0.12, 0.16, 1.0)))
	btn_ready.mouse_entered.connect(_play_hover)
	btn_ready.pressed.connect(func():
		_play_click()
		get_tree().change_scene_to_file("res://scenes/Main.tscn")
	)
	root.add_child(btn_ready)


func _refresh_all() -> void:
	var c_id: String = DataCatalog.selected_char_id
	var c_cfg: Dictionary = DataCatalog.CHARACTERS[c_id]
	var accent: Color = c_cfg["accent_color"]

	# 1. Refresh Top Portrait Row (3 Playable + 3 Locked "Coming Soon" Slots)
	for ch in portrait_row.get_children():
		ch.queue_free()

	for char_key in DataCatalog.CHARACTER_ORDER:
		var is_sel: bool = (char_key == c_id)
		var cfg_i: Dictionary = DataCatalog.CHARACTERS[char_key]
		var col_i: Color = cfg_i["accent_color"]
		var p_btn := Button.new()
		p_btn.custom_minimum_size = Vector2(68, 68)
		p_btn.icon = RetroAssetLoader.make_silhouette_icon(char_key, Color.WHITE if is_sel else col_i)
		p_btn.expand_icon = true
		p_btn.tooltip_text = "%s (%s)" % [String(cfg_i["name"]), String(cfg_i["race"])]
		var p_border := Color.WHITE if is_sel else col_i.darkened(0.35)
		var p_bg := Color(0.22, 0.06, 0.09, 0.98) if is_sel else Color(0.07, 0.04, 0.05, 0.92)
		p_btn.add_theme_stylebox_override("normal", _make_panel_sb(p_border, p_bg))
		p_btn.mouse_entered.connect(_play_hover)
		p_btn.pressed.connect(func():
			_play_click()
			DataCatalog.selected_char_id = char_key
			var pool: Array = DataCatalog.CHARACTERS[char_key]["allowed_weapons"]
			if not (DataCatalog.selected_weapon_id in pool):
				DataCatalog.selected_weapon_id = String(pool[0])
			_refresh_all()
		)
		portrait_row.add_child(p_btn)

	# 3 Locked Supernatural Archetype Slots (RoR2 style)
	var locked_names: Array[String] = [
		"Strigoi Blood-Seraph (Locked)",
		"Gargoyle Bastion (Locked)",
		"Abyssal Flagellant (Locked)"
	]
	for l_name in locked_names:
		var l_btn := Button.new()
		l_btn.custom_minimum_size = Vector2(68, 68)
		l_btn.icon = RetroAssetLoader.make_silhouette_icon("locked_slot", Color(0.55, 0.48, 0.32))
		l_btn.expand_icon = true
		l_btn.disabled = true
		l_btn.tooltip_text = l_name
		l_btn.add_theme_stylebox_override("disabled", _make_panel_sb(Color(0.25, 0.22, 0.24), Color(0.04, 0.03, 0.04, 0.85)))
		portrait_row.add_child(l_btn)

	# 2. Refresh Left Panel Character Info & Tabs
	lbl_char_name.text = "%s — %s" % [String(c_cfg["name"]).to_upper(), String(c_cfg["title"])]
	lbl_char_name.add_theme_color_override("font_color", accent.lightened(0.25))
	lbl_char_race.text = "SUPERNATURAL RACE: %s" % String(c_cfg["race"])
	lbl_char_attire.text = "VESTMENTS: %s" % String(c_cfg["attire"])

	overview_container.visible = (active_tab == "OVERVIEW")
	skills_container.visible = (active_tab == "SKILLS")

	for ch in overview_container.get_children():
		ch.queue_free()
	for ch in skills_container.get_children():
		ch.queue_free()

	# Populate Overview Tab (Stat Progress Bars + Badges)
	var badges_arr: Array = c_cfg["badges"]
	var b_lbl := Label.new()
	b_lbl.text = "STAT OFFSETS:  " + "   |   ".join(PackedStringArray(badges_arr))
	b_lbl.add_theme_font_size_override("font_size", 14)
	b_lbl.add_theme_color_override("font_color", accent.lightened(0.2))
	overview_container.add_child(b_lbl)

	var stat_bars: Dictionary = c_cfg["stat_bars"]
	for stat_key in ["HP", "SPEED", "CRIT", "ARMOR"]:
		var hb := HBoxContainer.new()
		hb.add_theme_constant_override("separation", 10)
		overview_container.add_child(hb)

		var sl := Label.new()
		sl.text = stat_key
		sl.custom_minimum_size = Vector2(75, 0)
		sl.add_theme_font_size_override("font_size", 13)
		hb.add_child(sl)

		var pb := ProgressBar.new()
		pb.min_value = 0.0
		pb.max_value = 100.0
		pb.value = float(stat_bars[stat_key]) * 100.0
		pb.show_percentage = false
		pb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pb.custom_minimum_size = Vector2(0, 18)
		var fill_sb := StyleBoxFlat.new()
		fill_sb.bg_color = accent
		pb.add_theme_stylebox_override("fill", fill_sb)
		hb.add_child(pb)

	var lore_lbl := Label.new()
	lore_lbl.text = "\nBLOODLINE PASSIVE — %s:\n%s" % [String(c_cfg["passive_name"]), String(c_cfg["passive_desc"])]
	lore_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lore_lbl.add_theme_font_size_override("font_size", 13)
	lore_lbl.add_theme_color_override("font_color", Color(0.88, 0.84, 0.82))
	overview_container.add_child(lore_lbl)

	# Populate Skills Tab (RoR2 Skill Rows)
	var skills_list: Array = c_cfg["skills"]
	for sk_raw in skills_list:
		var sk: Dictionary = sk_raw
		var sk_card := PanelContainer.new()
		sk_card.add_theme_stylebox_override("panel", _make_panel_sb(accent.darkened(0.25), Color(0.07, 0.03, 0.05, 0.94)))
		skills_container.add_child(sk_card)

		var sk_vb := VBoxContainer.new()
		sk_vb.add_theme_constant_override("separation", 3)
		sk_card.add_child(sk_vb)

		var sk_title := Label.new()
		sk_title.text = String(sk["name"])
		sk_title.add_theme_font_size_override("font_size", 14)
		sk_title.add_theme_color_override("font_color", accent.lightened(0.25))
		sk_vb.add_child(sk_title)

		var sk_desc := Label.new()
		sk_desc.text = String(sk["desc"])
		sk_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sk_desc.add_theme_font_size_override("font_size", 12)
		sk_desc.add_theme_color_override("font_color", Color(0.86, 0.82, 0.80))
		sk_vb.add_child(sk_desc)

	# 3. Refresh Right Panel Difficulty Selector (Danger 0..5)
	for ch in diff_buttons_row.get_children():
		ch.queue_free()
	for d_tier in range(6):
		var is_d_sel: bool = (d_tier == DataCatalog.selected_danger_tier)
		var d_btn := Button.new()
		d_btn.text = "D%d" % d_tier
		d_btn.custom_minimum_size = Vector2(46, 42)
		var d_col := Color(0.95, 0.16, 0.22) if is_d_sel else Color(0.38, 0.34, 0.36)
		d_btn.add_theme_stylebox_override("normal", _make_panel_sb(d_col, Color(0.20, 0.04, 0.06) if is_d_sel else Color(0.06, 0.03, 0.04)))
		d_btn.pressed.connect(func():
			_play_click()
			DataCatalog.selected_danger_tier = d_tier
			_refresh_all()
		)
		diff_buttons_row.add_child(d_btn)

	var d_cfg: Dictionary = DataCatalog.DANGER_TIERS[DataCatalog.selected_danger_tier]
	lbl_diff_desc.text = "%s\n• Spawn Count: %.2fx   • Enemy HP: %.2fx   • Vitae XP: %.2fx" % [
		String(d_cfg["name"]),
		float(d_cfg["count_mult"]),
		float(d_cfg["hp_mult"]),
		float(d_cfg["vitae_mult"])
	]

	# 4. Refresh Bottom Row Weapon Cards (from Shared 5-Weapon Pool)
	for ch in weapons_row.get_children():
		ch.queue_free()

	var allowed_weapons: Array = c_cfg["allowed_weapons"]
	for w_raw in allowed_weapons:
		var w_id: String = String(w_raw)
		var w_cfg: Dictionary = DataCatalog.WEAPONS[w_id]
		var is_w_sel: bool = (w_id == DataCatalog.selected_weapon_id)

		var w_card := PanelContainer.new()
		var w_border := Color(1.0, 0.84, 0.24) if is_w_sel else Color(0.36, 0.22, 0.26)
		var w_bg := Color(0.18, 0.04, 0.07, 0.98) if is_w_sel else Color(0.06, 0.03, 0.04, 0.92)
		w_card.add_theme_stylebox_override("panel", _make_panel_sb(w_border, w_bg))
		w_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		w_card.custom_minimum_size = Vector2(260, 118)
		weapons_row.add_child(w_card)

		var w_vb := VBoxContainer.new()
		w_vb.add_theme_constant_override("separation", 4)
		w_card.add_child(w_vb)

		var w_top := HBoxContainer.new()
		w_top.add_theme_constant_override("separation", 8)
		w_vb.add_child(w_top)

		var w_ico := TextureRect.new()
		w_ico.texture = RetroAssetLoader.make_silhouette_icon(w_id, Color(1.0, 0.84, 0.24) if is_w_sel else accent)
		w_ico.custom_minimum_size = Vector2(40, 40)
		w_ico.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		w_top.add_child(w_ico)

		var w_title := Label.new()
		w_title.text = "%s\n[%s]" % [String(w_cfg["name"]), String(w_cfg["category"])]
		w_title.add_theme_font_size_override("font_size", 13)
		w_title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.30) if is_w_sel else Color.WHITE)
		w_top.add_child(w_title)

		var w_badges: Array = w_cfg["badges"]
		var wb_lbl := Label.new()
		wb_lbl.text = " | ".join(PackedStringArray(w_badges))
		wb_lbl.add_theme_font_size_override("font_size", 11)
		wb_lbl.add_theme_color_override("font_color", Color(0.95, 0.36, 0.42))
		w_vb.add_child(wb_lbl)

		var w_btn := Button.new()
		w_btn.text = "EQUIPPED" if is_w_sel else "SELECT WEAPON"
		w_btn.mouse_entered.connect(_play_hover)
		w_btn.pressed.connect(func():
			_play_click()
			DataCatalog.selected_weapon_id = w_id
			_refresh_all()
		)
		w_vb.add_child(w_btn)

	var sel_w_cfg: Dictionary = DataCatalog.WEAPONS[DataCatalog.selected_weapon_id]
	lbl_weapon_detail.text = "%s — DMG: %d | REACH: %.1fm | %s" % [
		String(sel_w_cfg["name"]),
		int(sel_w_cfg["base_damage"]),
		float(sel_w_cfg["reach"]),
		String(sel_w_cfg["desc"])
	]

	# 5. Update 3D Character Model & Equipped Weapon on the Pedestal!
	_update_3d_character_preview(c_cfg, sel_w_cfg)


func _update_3d_character_preview(c_cfg: Dictionary, w_cfg: Dictionary) -> void:
	var accent: Color = c_cfg["accent_color"]
	if aura_light:
		aura_light.light_color = accent

	var char_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		String(c_cfg["tex_path"]),
		Vector3.ONE,
		Color.WHITE,
		accent,
		0.42
	)
	char_mesh_inst.mesh = RetroAssetLoader.load_obj_mesh(String(c_cfg["model_path"]), char_mat)
	char_mesh_inst.material_override = char_mat

	# Attach selected 3D weapon(s) to the character's hands on the pedestal!
	var w_mat: StandardMaterial3D = RetroAssetLoader.make_retro_material(
		"res://assets/textures/weapon_atlas.png",
		Vector3.ONE,
		Color.WHITE,
		Color(0.95, 0.14, 0.22),
		0.45
	)
	var w_id: String = String(w_cfg["id"])
	if w_id == "stake_and_hammer":
		# Dual-Wield: Left hand holds Iron Stake, Right hand holds War-Hammer!
		char_right_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/war_hammer.obj", w_mat)
		char_right_weapon_inst.material_override = w_mat
		char_right_weapon_inst.position = Vector3(0.46, 1.08, -0.32)
		char_right_weapon_inst.rotation_degrees = Vector3(15.0, 0.0, -12.0)
		char_right_weapon_inst.scale = Vector3.ONE * 1.15

		char_left_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/stake_held.obj", w_mat)
		char_left_weapon_inst.material_override = w_mat
		char_left_weapon_inst.position = Vector3(-0.46, 1.05, -0.35)
		char_left_weapon_inst.rotation_degrees = Vector3(-10.0, 0.0, 10.0)
		char_left_weapon_inst.scale = Vector3.ONE * 1.15
		char_left_weapon_inst.visible = true
	elif w_id == "jackal_and_casull":
		char_right_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/single_pistol.obj", w_mat)
		char_right_weapon_inst.material_override = w_mat
		char_right_weapon_inst.position = Vector3(0.46, 1.12, -0.38)
		char_right_weapon_inst.rotation_degrees = Vector3.ZERO
		char_right_weapon_inst.scale = Vector3.ONE * 1.15

		char_left_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh("res://assets/models/single_pistol.obj", w_mat)
		char_left_weapon_inst.material_override = w_mat
		char_left_weapon_inst.position = Vector3(-0.46, 1.12, -0.38)
		char_left_weapon_inst.rotation_degrees = Vector3.ZERO
		char_left_weapon_inst.scale = Vector3.ONE * 1.15
		char_left_weapon_inst.visible = true
	else:
		char_right_weapon_inst.mesh = RetroAssetLoader.load_obj_mesh(String(w_cfg["obj_path"]), w_mat)
		char_right_weapon_inst.material_override = w_mat
		char_right_weapon_inst.position = Vector3(0.44, 1.12, -0.34)
		char_right_weapon_inst.rotation_degrees = Vector3(12.0, 15.0, -8.0)
		char_right_weapon_inst.scale = Vector3.ONE * 1.15
		char_left_weapon_inst.visible = false


func _process(delta: float) -> void:
	time_acc += delta
	if pedestal_pivot:
		# Subtle idle combat turn & breathing pose on the pedestal
		pedestal_pivot.rotation.y = -0.32 + sin(time_acc * 0.75) * 0.38
		char_mesh_inst.position.y = 0.28 + absf(sin(time_acc * 1.8)) * 0.035
