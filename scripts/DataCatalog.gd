class_name DataCatalog
extends RefCounted

## Data-driven catalog for Characters (Brotato-style decoupled loadouts),
## Single-Weapon definitions (with differentiated melee geometry & sweet-spots),
## Slow-to-High Paced Enemy Archetypes, Danger 0-5 tiers, and Per-Card Reroll Perks.

const CHARACTERS: Dictionary = {
	"tepes_aristocrat": {
		"id": "tepes_aristocrat",
		"name": "Tepes Aristocrat",
		"title": "Alucard Bloodline",
		"passive_name": "Hellsing Arrogance",
		"passive_desc": "Headshots, Parries & Sweet-Spot Crits restore +8 Blood and grant +15% Move Speed for 3s.",
		"offsets": {"crit_chance": 0.20, "damage_mult": 0.15, "max_hp": -15.0},
		"allowed_weapons": ["alucard_sword", "occult_scythe", "jackal_and_casull"]
	},
	"nosferatu_leech": {
		"id": "nosferatu_leech",
		"name": "Nosferatu Leech-Lord",
		"title": "Ancient Hemomancer",
		"passive_name": "Sanguine Gorge",
		"passive_desc": "Overhealing grants up to +50 Blood Barrier; Point-Blank kills trigger a 3.5m Blood Nova.",
		"offsets": {"max_hp": 35.0, "life_leech": 0.25, "move_speed_pct": -0.08},
		"allowed_weapons": ["stake_and_hammer", "alucard_sword", "trench_shotgun"]
	},
	"nightrunner_wraith": {
		"id": "nightrunner_wraith",
		"name": "Nightrunner Wraith",
		"title": "Catacomb Velocity Assassin",
		"passive_name": "Phantom Momentum",
		"passive_desc": "Every 1 m/s above 12.5 m/s grants +2.5% Attack Damage and +1.5% Evasion.",
		"offsets": {"move_speed_pct": 0.20, "melee_reach_pct": 0.30, "armor": -15.0},
		"allowed_weapons": ["alucard_sword", "occult_scythe", "jackal_and_casull"]
	},
	"cathedral_juggernaut": {
		"id": "cathedral_juggernaut",
		"name": "Cathedral Juggernaut",
		"title": "Iron Executioner",
		"passive_name": "Inquisitor's Wrath",
		"passive_desc": "Breaking poise or shattering shields releases a 4.5m seismic stagger shockwave.",
		"offsets": {"stagger_mult": 0.50, "armor": 30.0, "fire_rate_pct": -0.12},
		"allowed_weapons": ["stake_and_hammer", "trench_shotgun", "occult_scythe"]
	}
}

const WEAPONS: Dictionary = {
	"alucard_sword": {
		"id": "alucard_sword",
		"name": "Alucard's Heirloom Broadsword",
		"category": "MELEE",
		"tag": "ALUCARD_SWORD",
		"obj_path": "res://assets/models/alucard_sword.obj",
		"sfx_path": "res://assets/audio/sword_slash.wav",
		"desc": "Medium reach (2.5m), wide 120° horizontal cleave. Slices & parries enemy Blood/Fire projectiles in mid-air!",
		"base_damage": 62.0,
		"fire_interval": 0.36,
		"reach": 2.5,
		"horizontal_arc_deg": 120.0,
		"vertical_slack": 1.6,
		"stagger_power": 38.0,
		"cleave_max": 8,
		"slices_projectiles": true,
		"shatters_armor": false,
		"point_blank_nova": false,
		"has_sweet_spot": false,
		"alt_name": "Crimson Dimension Wave (Parry Stance + Ranged Slash)"
	},
	"occult_scythe": {
		"id": "occult_scythe",
		"name": "Occult Grim-Scythe",
		"category": "MELEE",
		"tag": "OCCULT_SCYTHE",
		"obj_path": "res://assets/models/occult_scythe.obj",
		"sfx_path": "res://assets/audio/scythe_reap.wav",
		"desc": "Massive reach (4.0m), 160° arc. SWEET-SPOT: Outer blade tip (65%-100% reach) deals 3.0x DMG + 3 Bleed stacks!",
		"base_damage": 56.0,
		"fire_interval": 0.56,
		"reach": 4.0,
		"horizontal_arc_deg": 160.0,
		"vertical_slack": 1.8,
		"stagger_power": 52.0,
		"cleave_max": 14,
		"slices_projectiles": true,
		"shatters_armor": false,
		"point_blank_nova": false,
		"has_sweet_spot": true,
		"sweet_spot_min_ratio": 0.65,
		"sweet_spot_mult": 3.0,
		"inner_shaft_mult": 0.45,
		"alt_name": "Grim Harvest Vortex (Pulls Enemies Into Sweet-Spot Ring)"
	},
	"stake_and_hammer": {
		"id": "stake_and_hammer",
		"name": "Vampireslayer Stake & Hammer",
		"category": "MELEE",
		"tag": "STAKE_HAMMER",
		"obj_path": "res://assets/models/stake_hammer.obj",
		"sfx_path": "res://assets/audio/stake_impact.wav",
		"desc": "Short reach (1.3m), narrow 55° cone. Massive stagger, shatters Inquisitor shields, & Point-Blank Blood Explosion!",
		"base_damage": 118.0,
		"fire_interval": 0.48,
		"reach": 1.35,
		"horizontal_arc_deg": 55.0,
		"vertical_slack": 1.5,
		"stagger_power": 135.0,
		"cleave_max": 3,
		"slices_projectiles": false,
		"shatters_armor": true,
		"point_blank_nova": true,
		"has_sweet_spot": false,
		"alt_name": "Seismic Heart-Drive (Forward Lunge + Armor-Shattering Nova)"
	},
	"jackal_and_casull": {
		"id": "jackal_and_casull",
		"name": "The Jackal & Casull (13mm Dual)",
		"category": "BALLISTIC",
		"tag": "JACKAL_CASULL",
		"obj_path": "res://assets/models/jackal_casull.obj",
		"sfx_path": "res://assets/audio/pistol_fire.wav",
		"desc": "Precision 13mm twin handguns. High crit headshot multiplier (2.2x), 1 innate pierce, and Twin Cross-Burst RMB.",
		"base_damage": 48.0,
		"fire_interval": 0.24,
		"reach": 65.0,
		"pellets": 1,
		"spread_deg": 0.8,
		"pierce": 1,
		"stagger_power": 30.0,
		"shatters_armor": true,
		"alt_name": "Twin Cross-Burst (Simultaneous Armor-Piercing Explosive Shot)"
	},
	"trench_shotgun": {
		"id": "trench_shotgun",
		"name": "Cathedral Trench Coach-Gun",
		"category": "BALLISTIC",
		"tag": "TRENCH_SHOTGUN",
		"obj_path": "res://assets/models/trench_shotgun.obj",
		"sfx_path": "res://assets/audio/shotgun_blast.wav",
		"desc": "10-pellet brutalist scattergun. Point-blank blasts vaporize ghouls into gibs; RMB in air triggers Shotgun-Jump!",
		"base_damage": 16.0,
		"fire_interval": 0.62,
		"reach": 38.0,
		"pellets": 10,
		"spread_deg": 6.8,
		"pierce": 0,
		"stagger_power": 11.0,
		"shatters_armor": false,
		"alt_name": "Concentrated Gore-Slug + Recoil Vault (Shotgun Jump)"
	}
}

## Slow-to-High Paced Enemy Archetypes (DUSK / Quake / Blood Retro Models)
const ENEMIES: Dictionary = {
	"catacomb_ghoul": {
		"id": "catacomb_ghoul",
		"name": "Catacomb Ghoul",
		"role": "FODDER",
		"obj_path": "res://assets/models/ghoul.obj",
		"tex_path": "res://assets/textures/ghoul_tex.png",
		"min_wave": 1,
		"base_hp": 45.0,
		"base_speed": 3.4, # Deliberate, heavy-footed zombie shambling in Wave 1-3
		"poise": 25.0,
		"damage": 12.0,
		"attack_range": 1.85,
		"scale": Vector3(1.05, 1.05, 1.05),
		"vitae_drop": 14.0,
		"armored": false
	},
	"blood_cultist": {
		"id": "blood_cultist",
		"name": "Blood Cultist",
		"role": "RANGED",
		"obj_path": "res://assets/models/cultist.obj",
		"tex_path": "res://assets/textures/cultist_tex.png",
		"min_wave": 2,
		"base_hp": 68.0,
		"base_speed": 3.8,
		"poise": 35.0,
		"damage": 16.0,
		"attack_range": 22.0,
		"preferred_dist": 14.0,
		"projectile_speed": 10.5, # Slow, readable blood/fire orbs that can be dodged or sliced with sword!
		"scale": Vector3(1.08, 1.08, 1.08),
		"vitae_drop": 22.0,
		"armored": false
	},
	"crypt_nightstalker": {
		"id": "crypt_nightstalker",
		"name": "Crypt Nightstalker",
		"role": "STALKER",
		"obj_path": "res://assets/models/stalker.obj",
		"tex_path": "res://assets/textures/stalker_tex.png",
		"min_wave": 3,
		"base_hp": 62.0,
		"base_speed": 7.6, # Agile beast that leaps off catacomb walls
		"poise": 30.0,
		"damage": 15.0,
		"attack_range": 2.1,
		"scale": Vector3(1.12, 1.12, 1.12),
		"vitae_drop": 24.0,
		"armored": false
	},
	"iron_inquisitor": {
		"id": "iron_inquisitor",
		"name": "Iron Inquisitor",
		"role": "BRUISER",
		"obj_path": "res://assets/models/inquisitor.obj",
		"tex_path": "res://assets/textures/inquisitor_tex.png",
		"min_wave": 5,
		"base_hp": 210.0,
		"base_speed": 4.6,
		"poise": 110.0,
		"damage": 24.0,
		"attack_range": 2.3,
		"scale": Vector3(1.22, 1.22, 1.22),
		"vitae_drop": 45.0,
		"armored": true
	},
	"cathedral_executioner": {
		"id": "cathedral_executioner",
		"name": "Cathedral Executioner",
		"role": "BOSS",
		"obj_path": "res://assets/models/executioner.obj",
		"tex_path": "res://assets/textures/inquisitor_tex.png",
		"min_wave": 8,
		"base_hp": 680.0,
		"base_speed": 5.0,
		"poise": 240.0,
		"damage": 35.0,
		"attack_range": 3.2,
		"projectile_speed": 12.0,
		"scale": Vector3(1.45, 1.45, 1.45),
		"vitae_drop": 140.0,
		"armored": true
	}
}

const DANGER_TIERS: Array = [
	{"tier": 0, "name": "Danger 0: Initiate of Dusk", "hp_mult": 1.00, "dmg_mult": 1.00, "count_mult": 1.00, "elite_chance": 0.00, "vitae_mult": 1.00},
	{"tier": 1, "name": "Danger 1: Blood Moon Rising", "hp_mult": 1.15, "dmg_mult": 1.15, "count_mult": 1.10, "elite_chance": 0.06, "vitae_mult": 1.15},
	{"tier": 2, "name": "Danger 2: Inquisition Crusade", "hp_mult": 1.30, "dmg_mult": 1.25, "count_mult": 1.20, "elite_chance": 0.12, "vitae_mult": 1.30},
	{"tier": 3, "name": "Danger 3: Sanguine Famine", "hp_mult": 1.50, "dmg_mult": 1.40, "count_mult": 1.30, "elite_chance": 0.18, "vitae_mult": 1.50},
	{"tier": 4, "name": "Danger 4: Abyssal Eclipse", "hp_mult": 1.75, "dmg_mult": 1.60, "count_mult": 1.45, "elite_chance": 0.25, "vitae_mult": 1.75},
	{"tier": 5, "name": "Danger 5: Alucard's Nightmare", "hp_mult": 2.10, "dmg_mult": 1.85, "count_mult": 1.65, "elite_chance": 0.35, "vitae_mult": 2.10}
]

const PERKS: Array = [
	# Universal Kinetic, Occult, Movement & Familiar Perks
	{"id": "serrated_vitae", "name": "Serrated Vitae Edge", "rarity": "COMMON", "tags": ["UNIVERSAL"], "desc": "+18% Weapon Damage & +15% Bleed Potency.", "mods": {"damage_mult": 0.18, "bleed_damage": 0.15}},
	{"id": "quicksilver_tendons", "name": "Quicksilver Tendons", "rarity": "COMMON", "tags": ["UNIVERSAL"], "desc": "+12% Move Speed & +15% Slide Impulse.", "mods": {"move_speed_pct": 0.12, "slide_boost_pct": 0.15}},
	{"id": "crimson_frenzy", "name": "Crimson Attack Haste", "rarity": "COMMON", "tags": ["UNIVERSAL"], "desc": "+20% Attack Speed / Fire Rate.", "mods": {"fire_rate_pct": 0.20}},
	{"id": "obsidian_marrow", "name": "Obsidian Bone Marrow", "rarity": "COMMON", "tags": ["UNIVERSAL"], "desc": "+30 Max HP & +12 Armor.", "mods": {"max_hp": 30.0, "armor": 12.0}},
	{"id": "arterial_magnet", "name": "Arterial Magnet Aura", "rarity": "COMMON", "tags": ["UNIVERSAL"], "desc": "+45% Blood Orb Pickup Radius & +15% Vitae Value.", "mods": {"magnet_radius_pct": 0.45, "vitae_mult": 0.15}},
	{"id": "assassin_crit", "name": "Dusk Stalker Precision", "rarity": "RARE", "tags": ["UNIVERSAL"], "desc": "+25% Crit Chance & +20% Stagger Power.", "mods": {"crit_chance": 0.25, "stagger_mult": 0.20}},
	{"id": "vampiric_siphon", "name": "Vampiric Siphon Fang", "rarity": "RARE", "tags": ["UNIVERSAL"], "desc": "+15% Life Leech on Hit & Overheal Barrier.", "mods": {"life_leech": 0.15, "damage_mult": 0.10}},
	{"id": "corpse_nova", "name": "Hellsing Corpse Detonation", "rarity": "RARE", "tags": ["UNIVERSAL"], "desc": "Slain enemies explode in a 3.5m Crimson Blood Nova for 45 Occult DMG.", "mods": {"blood_nova_on_kill": 1.0, "damage_mult": 0.12}},
	{"id": "shadow_bats", "name": "Familiar: Nocturne Shadow Bats", "rarity": "EPIC", "tags": ["UNIVERSAL"], "desc": "Summons +2 orbiting Shadow Bats that dive through nearby ghouls and apply Bleed.", "mods": {"familiar_bats": 2.0}},
	{"id": "spectral_skulls", "name": "Familiar: Baskerville Skulls", "rarity": "EPIC", "tags": ["UNIVERSAL"], "desc": "Summons +1 floating Spectral Skull turret that fires occult beams at cultists.", "mods": {"familiar_skulls": 1.0}},
	{"id": "blood_wolves", "name": "Familiar: Hounds of Baskerville", "rarity": "EPIC", "tags": ["UNIVERSAL"], "desc": "Summons +1 autonomous Blood Wolf pack hunter that mauls high-HP targets.", "mods": {"familiar_wolves": 1.0}},
	# Weapon-Archetype Specific Perks
	{"id": "phantom_blade_reach", "name": "Phantom Blade Extension", "rarity": "RARE", "tags": ["MELEE"], "desc": "+30% Melee Reach Multiplier (`melee_reach_multiplier`) & +15% Cleave Damage.", "mods": {"melee_reach_pct": 0.30, "damage_mult": 0.15}},
	{"id": "reaper_sweet_spot", "name": "Grim Crescent Sweet-Spot", "rarity": "EPIC", "tags": ["OCCULT_SCYTHE"], "desc": "Occult Scythe Sweet-Spot multiplier increased to 4.0x DMG + +25% Reach!", "mods": {"sweet_spot_bonus": 1.0, "melee_reach_pct": 0.25}},
	{"id": "alucard_mirror_parry", "name": "Mirror of Tepes Deflection", "rarity": "EPIC", "tags": ["ALUCARD_SWORD"], "desc": "Sliced/Parried Cultist projectiles deal 300% DMG and heal +12 HP!", "mods": {"parry_heal": 12.0, "melee_reach_pct": 0.20, "damage_mult": 0.25}},
	{"id": "inquisitor_breaker", "name": "Seismic Stake Impale", "rarity": "EPIC", "tags": ["STAKE_HAMMER"], "desc": "Stake & Hammer Point-Blank Blood Explosion radius doubled + +40% Damage!", "mods": {"damage_mult": 0.40, "melee_reach_pct": 0.25}},
	{"id": "casull_pierce_split", "name": "Silver-Mercury Hollowpoints", "rarity": "EPIC", "tags": ["JACKAL_CASULL", "TRENCH_SHOTGUN"], "desc": "+2 Projectile Pierce, +2 Bonus Pellets/Split, & +25% Crit Chance.", "mods": {"pierce_bonus": 2.0, "pellet_bonus": 2.0, "crit_chance": 0.25}},
	{"id": "eldritch_restraint_zero", "name": "ELDRITCH: Restraint Level Zero", "rarity": "ELDRITCH", "tags": ["UNIVERSAL"], "desc": "+55% All Damage, +35% Attack Speed, +30% Melee Reach, & +2 Shadow Bats!", "mods": {"damage_mult": 0.55, "fire_rate_pct": 0.35, "melee_reach_pct": 0.30, "familiar_bats": 2.0}}
]


## Calculates Slow-to-High Pacing wave parameters:
## Waves 1-3: Only 2-4 slow enemies simultaneously (atmospheric catacomb exploration).
## Every wave: +18% total enemies (15-20%) and +4% enemy speed (3-5%).
## Wave 8-10+: Reaches high-intensity bullet-heaven chaos.
static func get_wave_pacing(wave_num: int, danger_tier: int) -> Dictionary:
	var d_cfg: Dictionary = DANGER_TIERS[clampi(danger_tier, 0, DANGER_TIERS.size() - 1)]
	var w := maxi(1, wave_num)

	var total_enemies := int(round((6.0 * pow(1.18, float(w - 1)) + 1.5 * float(w - 1)) * float(d_cfg["count_mult"])))
	var max_alive := 3
	if w == 1:
		max_alive = 3 # 2-3 slow ghouls simultaneously
	elif w == 2:
		max_alive = 4 # 3-4 enemies simultaneously
	elif w == 3:
		max_alive = 4 # 4 enemies simultaneously
	else:
		max_alive = mini(75, int(round(4.5 * pow(1.20, float(w - 3)) + 2.0 * float(w - 3))))

	var speed_mult := 1.0 + 0.04 * float(w - 1) # +4% speed per wave (within 3-5% spec)
	var hp_mult := float(d_cfg["hp_mult"]) * (1.0 + 0.12 * float(w - 1) + 0.015 * float((w - 1) * (w - 1)))
	var dmg_mult := float(d_cfg["dmg_mult"]) * (1.0 + 0.07 * float(w - 1))
	var spawn_interval := clampf(2.6 - 0.18 * float(w - 1), 0.32, 2.6)

	return {
		"wave": w,
		"total_enemies": total_enemies,
		"max_alive": max_alive,
		"speed_mult": speed_mult,
		"hp_mult": hp_mult,
		"dmg_mult": dmg_mult,
		"spawn_interval": spawn_interval,
		"elite_chance": float(d_cfg["elite_chance"]),
		"vitae_mult": float(d_cfg["vitae_mult"])
	}
