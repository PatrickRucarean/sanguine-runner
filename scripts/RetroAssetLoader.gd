class_name RetroAssetLoader
extends RefCounted

## Loads 64x64 / 128x128 pixel-art PNG textures with Nearest filtering,
## parses sculpted low-poly .obj 3D models into Godot ArrayMesh resources with UVs & normals,
## and loads 16-bit PCM .wav sound effects into AudioStreamWAV.

static var _tex_cache: Dictionary = {}
static var _mat_cache: Dictionary = {}
static var _mesh_cache: Dictionary = {}
static var _wav_cache: Dictionary = {}


static func load_pixel_texture(rel_path: String) -> Texture2D:
	if _tex_cache.has(rel_path):
		return _tex_cache[rel_path]
	var abs_path := ProjectSettings.globalize_path(rel_path)
	var img := Image.new()
	var err := img.load(abs_path)
	if err != OK:
		push_warning("Fallback procedural texture for: " + rel_path)
		img = Image.create(64, 64, false, Image.FORMAT_RGBA8)
		img.fill(Color(0.35, 0.12, 0.15, 1.0))
	var tex := ImageTexture.create_from_image(img)
	_tex_cache[rel_path] = tex
	return tex


static func make_retro_material(
	tex_path: String,
	uv_scale: Vector3 = Vector3.ONE,
	albedo_tint: Color = Color.WHITE,
	emission_color: Color = Color.BLACK,
	emission_energy: float = 0.0
) -> StandardMaterial3D:
	var key := "%s|%s|%s|%s|%.2f" % [tex_path, str(uv_scale), albedo_tint.to_html(), emission_color.to_html(), emission_energy]
	if _mat_cache.has(key):
		return _mat_cache[key]

	var mat := StandardMaterial3D.new()
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	mat.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	mat.roughness = 1.0
	mat.metallic = 0.0
	mat.albedo_color = albedo_tint
	if tex_path != "":
		mat.albedo_texture = load_pixel_texture(tex_path)
	mat.uv1_scale = uv_scale
	if emission_energy > 0.0:
		mat.emission_enabled = true
		mat.emission = emission_color
		mat.emission_energy_multiplier = emission_energy
	_mat_cache[key] = mat
	return mat


static func load_obj_mesh(rel_path: String, material: Material = null) -> ArrayMesh:
	var cache_key := rel_path + "|" + (str(material.get_instance_id()) if material else "nomat")
	if _mesh_cache.has(cache_key):
		return _mesh_cache[cache_key]

	var abs_path := ProjectSettings.globalize_path(rel_path)
	var file := FileAccess.open(abs_path, FileAccess.READ)
	if file == null:
		push_warning("Could not open OBJ file: " + abs_path)
		return ArrayMesh.new()

	var raw_verts := PackedVector3Array()
	var raw_uvs := PackedVector2Array()
	var raw_norms := PackedVector3Array()

	var out_verts := PackedVector3Array()
	var out_uvs := PackedVector2Array()
	var out_norms := PackedVector3Array()

	while not file.eof_reached():
		var line := file.get_line().strip_edges()
		if line.is_empty() or line.begins_with("#"):
			continue
		var parts := line.split(" ", false)
		if parts.is_empty():
			continue
		var cmd := parts[0]
		if cmd == "v" and parts.size() >= 4:
			raw_verts.append(Vector3(parts[1].to_float(), parts[2].to_float(), parts[3].to_float()))
		elif cmd == "vt" and parts.size() >= 3:
			raw_uvs.append(Vector2(parts[1].to_float(), 1.0 - parts[2].to_float()))
		elif cmd == "vn" and parts.size() >= 4:
			raw_norms.append(Vector3(parts[1].to_float(), parts[2].to_float(), parts[3].to_float()))
		elif cmd == "f" and parts.size() >= 4:
			# Triangulate polygon fan and skip zero-area degenerate triangles
			for i in range(1, parts.size() - 2):
				var tri_tokens: Array[String] = [parts[1], parts[i + 1], parts[i + 2]]
				var tri_v: Array[Vector3] = []
				var tri_uv: Array[Vector2] = []
				var tri_n: Array[Vector3] = []
				for tok_str in tri_tokens:
					var idx_strs: PackedStringArray = tok_str.split("/")
					var vi: int = idx_strs[0].to_int() - 1
					var vti: int = (idx_strs[1].to_int() - 1) if (idx_strs.size() > 1 and idx_strs[1] != "") else 0
					var vni: int = (idx_strs[2].to_int() - 1) if (idx_strs.size() > 2 and idx_strs[2] != "") else 0

					tri_v.append(raw_verts[clampi(vi, 0, raw_verts.size() - 1)])
					if not raw_uvs.is_empty():
						tri_uv.append(raw_uvs[clampi(vti, 0, raw_uvs.size() - 1)])
					else:
						tri_uv.append(Vector2.ZERO)
					if not raw_norms.is_empty():
						tri_n.append(raw_norms[clampi(vni, 0, raw_norms.size() - 1)])
					else:
						tri_n.append(Vector3.UP)

				if (tri_v[1] - tri_v[0]).cross(tri_v[2] - tri_v[0]).length_squared() > 1e-10:
					for k in range(3):
						out_verts.append(tri_v[k])
						out_uvs.append(tri_uv[k])
						out_norms.append(tri_n[k])

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = out_verts
	arrays[Mesh.ARRAY_TEX_UV] = out_uvs
	arrays[Mesh.ARRAY_NORMAL] = out_norms

	var mesh := ArrayMesh.new()
	if not out_verts.is_empty():
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		if material != null:
			mesh.surface_set_material(0, material)

	_mesh_cache[cache_key] = mesh
	return mesh


static func load_wav(rel_path: String, looped: bool = false) -> AudioStreamWAV:
	var cache_key := rel_path + ("|loop" if looped else "")
	if _wav_cache.has(cache_key):
		return _wav_cache[cache_key]
	var abs_path := ProjectSettings.globalize_path(rel_path)
	var file := FileAccess.open(abs_path, FileAccess.READ)
	if file == null:
		return null
	var bytes := file.get_buffer(file.get_length())
	if bytes.size() <= 44:
		return null
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.stereo = false
	stream.data = bytes.slice(44)
	if looped:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_begin = 0
		stream.loop_end = stream.data.size() / 2
	_wav_cache[cache_key] = stream
	return stream


static func make_silhouette_icon(icon_id: String, fg_col: Color) -> Texture2D:
	var key := "icon|" + icon_id + "|" + fg_col.to_html()
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img := Image.create(48, 48, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.05, 0.02, 0.03, 1.0))
	var border_col := fg_col.darkened(0.35)
	for i in range(48):
		img.set_pixel(i, 0, border_col)
		img.set_pixel(i, 47, border_col)
		img.set_pixel(0, i, border_col)
		img.set_pixel(47, i, border_col)

	for y in range(6, 42):
		for x in range(6, 42):
			var dx := float(x - 24)
			var dy := float(y - 24)
			var draw := false
			match icon_id:
				"vlad_vampire", "tepes_aristocrat", "nosferatu_leech": # Nosferatu High Collar, Fangs & Glowing Eyes
					var collar := (dy > -8.0 and dy < 16.0 and absf(dx) > 7.0 and absf(dx) < 16.0 - (dy + 8.0) * 0.25)
					var head := (dx * dx + (dy + 4.0) * (dy + 4.0) < 52.0)
					var fangs := (absf(dx) in [2.0, 3.0] and dy > 3.0 and dy < 11.0)
					draw = collar or head or fangs
				"fenrir_lycan", "nightrunner_wraith": # Carpathian Werewolf Ears, Snout & Claws
					var ears := (dy < -5.0 and dy > -17.0 and absf(absf(dx) - 8.0) < (17.0 + dy) * 0.42)
					var snout := (absf(dx) < 11.0 - maxf(0.0, dy) * 0.45 and dy >= -8.0 and dy < 13.0)
					var slashes := (absf(dx + dy - 10.0) < 1.8 and dx > 2.0 and dy > 2.0)
					draw = ears or snout or slashes
				"malakor_lich", "cathedral_juggernaut": # Spiked Lich Crown & Hollow Skull Visage
					var crown := (dy <= -7.0 and dy > -17.0 and (int(absf(dx)) % 4 <= 1) and absf(dx) < 13.0)
					var skull := (absf(dx) < 10.0 and dy > -8.0 and dy < 8.0) and not (absf(dx) in [3.0, 4.0, 5.0] and dy > -5.0 and dy < 0.0)
					var jaw := (absf(dx) < 6.0 and dy >= 8.0 and dy < 15.0 and int(dx) % 2 == 0)
					draw = crown or skull or jaw
				"locked_slot": # Chained Padlock / Sealed Crypt Slot (RoR2 style)
					var shackle := (dy < -1.0 and dy > -13.0 and absf(sqrt(dx * dx + (dy + 2.0) * (dy + 2.0)) - 7.0) < 2.2)
					var body := (absf(dx) < 10.0 and dy >= -2.0 and dy < 14.0) and not (absf(dx) < 2.2 and dy > 2.0 and dy < 9.0)
					draw = shackle or body
				"alucard_sword": # Diagonal Broadsword & Swept Crossguard
					draw = (absf(dx + dy) < 2.4 and absf(dx - dy) < 22.0) or (absf(dx - dy + 8.0) < 2.2 and absf(dx + dy) < 9.0)
				"occult_scythe": # Sweeping Crescent Reaper Blade
					var r := sqrt(dx * dx + (dy + 4.0) * (dy + 4.0))
					draw = (r > 9.0 and r < 15.0 and dy < 2.0) or (absf(dx - 6.0) < 2.0 and dy > -10.0)
				"stake_and_hammer": # Crossed Iron Stake & War-Hammer
					draw = (absf(dx - dy) < 2.5) or (absf(dx + dy) < 2.5) or (dx > 4.0 and dy < -4.0 and absf(dx + dy) < 8.0)
				"jackal_and_casull": # Dual Crossed 13mm Handcannons
					draw = (absf(dy + 4.0) < 3.5 and absf(dx) < 14.0) or (absf(dx + 8.0) < 3.0 and dy > -4.0 and dy < 12.0)
				"trench_shotgun": # Double-Barrel Coach Gun Silhouette
					draw = (absf(dy + 2.0) < 3.2 and dx > -15.0 and dx < 14.0) or (dx > 4.0 and dy > 0.0 and dy < 10.0 and absf(dx - dy - 4.0) < 3.5)
				_:
					draw = (absf(dx) + absf(dy) < 14.0)
			if draw:
				img.set_pixel(x, y, fg_col)

	var tex := ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex

