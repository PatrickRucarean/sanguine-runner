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


static func load_wav(rel_path: String) -> AudioStreamWAV:
	if _wav_cache.has(rel_path):
		return _wav_cache[rel_path]
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
	_wav_cache[rel_path] = stream
	return stream
