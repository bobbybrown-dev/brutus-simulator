# BOSS_SPEC — Brutus (`cowboss`, NPC 15626)

**Sources:** RSProx transcripts `20261114T211629-d3caaa4.txt` (capture 1, kills K1–K5) and `20261114T233858-d3caaa4.txt` (capture 2, kills K6–K10), rev 242.1, world 378.
**Companion files:** `data/brutus_ids.json`, `data/brutus_tick_timeline.csv` (K1–K5), `data/brutus_tick_timeline_capture2.csv` (K6–K10).
**Status:** revision 4 (2026-11-15). Every rule below marked [OBS] is reproduced by the headless engine, which replays all ten kills (875 ticks) 1:1.

**Changed in revision 4** (constants finalised from the OSRS Wiki; no new capture): Protect from Melee fully blocks the swing and is no longer an open question (§4.2); special damage is 15–19, where the captures only ever showed 15–17 (§4.3, §4.4); the arena collision now loads four regions (§2); two documented mechanics that were never captured are recorded as future hooks and are **not implemented** (§10).

**Changed in revision 3** (full capture 2, adding the end of K9 and all of K10; combat formulas): stomps 2 and 3 of a set wait for the player to be within reach (§5.1); a player on the exact centre tile gets a west stomp (§5.2); the swing is a standard accuracy roll with max hit 3, and the recorded zeros match the player's actual gear (§4.2); player loadout recorded (§8).

**Changed in revision 2:** specials need melee range (§5.1); charge distance is not fixed at 4 (§5.3); the first special is random (§5.1); Protect from Melee does not reduce specials (§4.3, §4.4); the boss can step on the tick a special starts and on the tick it dies (§4.3, §4.5); respawn is timed from the despawn (§4.5); the arena spans two regions and has real collision (§2); chase movement rule added (§5.4).

Confidence tags used throughout:
- **[OBS n/n]** — directly observed, n of n samples agree.
- **[DOC]** — taken from the OSRS Wiki / Jagex update notes; our captures do not show it either way.
- **[INF]** — inferred from the observations; consistent but not uniquely determined.
- **[UNK]** — not observable in this capture; see §7.

---

## 1. Capture summary

| Kill | Ticks (spawn → despawn) | Variant | Duration (game msg) | Boss actions | Player damage taken |
|---|---|---|---|---|---|
| K1 | 750 → 792 | Quest (*The Ides of Milk*), name overridden to "Bull" | n/a | M, M, **Charge**, M, M | Charge 15 |
| K2 | 995 → 1037 | Regular, fresh entry | 0:22.80 (38 t) | M, M, **Stomp ×3** (3rd cut by death) | 0 |
| K3 | 1072 → 1096 | Regular, in-instance respawn | 0:12.00 (20 t) | M, M, **Stomp** (cut by death) | 0 |
| K4 | 1131 → 1367 | Regular, in-instance respawn | 2:19.20 (232 t) | M, M, S×3, M×4, C, M×4, S×3, M×4, C, M×4, S×3, M×4, C, M×4 | Stomp 17, Stomp 16, Melee 2, Charge 17 |
| K5 | 1440 → 1507 | Regular, fresh entry | 0:37.80 (63 t) | M, M, S×3, M×4 | 0 |
| K6 | 17 → 196 | Regular, fresh entry, **Protect from Melee on** ticks 20–162 | 1:45.00 (175 t) | M, M, S×3, M×4, C, M×4, S×3, M×4, C, M×4, S×2 | Stomp 15 ×4, 16 ×2; Charge 16, 17 |
| K7 | 231 → 275 | Regular, respawn | 0:22.80 (38 t) | M, M, S×2 (special delayed 6 ticks by range) | 0 |
| K8 | 310 → 357 | Regular, respawn | 0:25.80 (43 t) | M, M, **C**, M×4 | Charge 15 |
| K9 | 392 → 501 | Regular, respawn | 1:03.00 (105 t) | M, M, **C**, M×4, S×3, M×4, C, M×2 | Stomp 16 |
| K10 | 536 → 611 | Regular, respawn | 0:42.60 (71 t) | M, M, S×3 (2nd delayed 1 tick, 3rd delayed 4 ticks, by range), M×4, C (cancelled by death) | 0 |

Totals: 84 melee swings, 32 stomps, 10 charges (9 dashes).
Player: Defence 80 in black d'hide, magic shortbow with rune arrows (full loadout in §8). 83 of 84 melee swings hit 0. Protect from Melee was used only in K6.

---

## 2. Arena

| Property | Value | Confidence |
|---|---|---|
| Location | Lumbridge east cow field, **instanced copy** | [OBS] real instance coords leak on exit teleports: (11933,14137), (12118,14500), (11933,15661). RSProx reports all in-fight coords translated back to the template. |
| Template regions | **12851 and 13107** for everything the fight touched. The field crosses x = 3264; the boss footprint reaches x = 3265. The fenced field continues south into **12850 and 13106** (y < 3264), which are loaded too so the whole field (743 tiles, x 3240–3265, y 3255–3298) is walkable. | [OBS] for the first two; the southern two from the collision data |
| Plane | 0 | [OBS] |
| Boss spawn tile (SW) | **(3261, 3287)** — footprint x 3261–3263, y 3287–3289 | [OBS 5/5] |
| Player entry tile | **(3262, 3294)**, just inside the pen gate | [OBS 3/3 fresh entries] |
| Entry object | Pen gate `fencegate_l_cowboss_start` 60763 at (3262,3294) (+ right half at (3263,3294), ID not captured, likely 60766 — verify in cache). Wall shape 0, rotation 1 (north edge of tile). Brutus' pen is north of it (y ≥ 3295), where the cosmetic `cowboss_mapped` NPC wanders. | [OBS] |
| In-instance pen gate | Replaced by `fencegate_l/r_cowboss_start_noop` 60761 / 60762 at (3262,3294) / (3263,3294) | [OBS 3/3] |
| Exit object | `fencegate_r_cowboss_exit` 60764 at (3253,3267), `fencegate_l_cowboss_exit` 60765 at (3253,3266). Shape 0, rotation 0 (west edge). Exits to (3252,3267) in the real world. | [OBS] |
| Tiles actually walked (player) | x 3254–3264, y 3268–3294 | [OBS] |
| Tiles occupied by boss SW anchor | x 3257–3263, y 3284–3291 | [OBS] |
| Collision | `region_12851_collision.json` + `region_13107_collision.json` (+ `region_12850` / `region_13106` for the southern strip no capture entered), cache-derived. East fence between x = 3265 and 3266. Solid scenery inside the field at **3257,3289** and **3260,3294**. Both gates are closed during the fight. | [OBS] all 875 ticks replay on it |

Other NPCs (cows, chickens, etc.) are re-sent on entry ("The cows scatter") and are not part of the encounter.

---

## 3. Entity metadata

| Field | Value | Confidence |
|---|---|---|
| Fight NPC | `cowboss` **15626** — no transformation during the fight | [OBS 5/5] |
| Pen (pre-fight) NPC | `cowboss_mapped` **15624**, multinpc → `cowboss_unnamed` 15625 (during quest) or `cowboss` 15626 (post-quest). Deleted on the tick the fight NPC is added. | [OBS] |
| Size | **3×3**, SW-anchored | [OBS] melee lands with the player exactly 3 tiles N/E of SW; player projectiles target SW+(1,1); stomp tiles hug a 3×3 footprint. |
| Hitpoints | **58** (`hpbar_hud_basehp` = 58) | [OBS 5/5] |
| Combat levels | Attack 12, Strength 25, Defence 10, Magic 8, Ranged 1; offensive bonuses 0; defence bonuses −7 (stab, slash, crush, ranged), −3 (magic); attack style crush | Wiki infobox and osrs-dps-calc monster data (id 15626); consistent with every recorded hit in both directions (§4.2, §8) |
| HP regeneration | None — 42 HP held for 206 ticks in K4 | [OBS] |
| Movement | 1 tile/tick, diagonals allowed | [OBS] |
| Attack range | 1 (cardinally adjacent to the footprint; not diagonal corners) | [OBS] |
| Aggro target | Sole player in the instance | [OBS] |
| Overhead text | "Moo" (wake), "\*snorts\*" (stomp), "\*growls\*" (charge), "m-moo..." (death) | [OBS] |
| Boss HP HUD | varp 1683 = 15626, varbit 6099 = current HP, 6100 = base HP, 12401 = 1 | [OBS] |

Animations (Sequence IDs):

| ID | Name | Use | Client delay field |
|---|---|---|---|
| 13790 | `cow_boss_spawn` | Played on NPC add | 0 |
| 13783 | `cow_boss_attack` | Melee auto | 0 |
| 13785 | `cow_boss_stomp` | Stomp wind-up | 30 cycles (1 tick) |
| 13778 | `cow_boss_charge` | Charge wind-up | 60 cycles (2 ticks) |
| 13784 | `cow_boss_death` | Death | 0 |

Idle/walk/turn sequences are never sent in packets — read them from NPC config 15626 in the cache.

SpotAnims:

| ID | Name | Attached to | When |
|---|---|---|---|
| 3588 | `vfx_cowboss_stomp_impact01` | **Map tiles** (`map_anim`, height 0, delay 0), one per stomp tile | Stomp impact tick |
| 3589 | `vfx_cowboss_stomp_impact02` | **Boss NPC** (`spotanim`, slot 0, height 0) | Stomp impact tick |
| 85 | `failedspell_impact` | Map tile of the loot pile, height 16 | Despawn tick (generic, not boss-specific) |

Projectiles: **Brutus fires none.** All three attacks are melee/area. The only projectile in the fights is the player's `rune_arrow_travel` 15 (see §8).

Sounds: 11212 `cb_boss_moo_angry_01` (spawn), 11213 `cb_boss_snort_01` (stomp), 11210 `cb_boss_growl_01` (charge); music track 859 `brutus_cow_boss`.

---

## 4. Tick timings

Notation: **S** = tick the boss NPC is added. **T** = tick a boss action starts (animation packet tick). **D** = tick boss HP reaches 0.

### 4.1 Spawn / wake-up

| Offset | Event | Confidence |
|---|---|---|
| S | NPC added at (3261,3287) with seq 13790, instantly facing the player's tile; sound 11212; fight timer starts | [OBS 5/5] |
| S+1 | Boss face-locks the player. HP HUD appears at S+1 on respawns, S+4 on fresh entries (entry cutscene) | [OBS] |
| S+5 | Overhead "Moo". On fresh entries the player regains control this tick (`busy` 1→0) | [OBS 5/5] |
| S+6 | **Boss becomes active**: first tick it can move or attack | [OBS 5/5] |

First melee: S+6 if the player is already adjacent (K3), otherwise on the tick the boss's step makes it adjacent (S+9 from the entry tile in K1/K2/K5).

### 4.2 Melee auto (seq 13783)

| Property | Value | Confidence |
|---|---|---|
| Attack speed | **5 ticks** | [OBS 27/27 uninterrupted consecutive pairs] |
| Damage application | **T+0** — the player's hitsplat is in the same tick as the boss animation | [OBS 40/40] |
| Range check position | Uses the player's tile from the **end of the previous tick** (NPC turn runs before the player's movement). K1 t777 and K4 t1138: the player moved away / under the boss on tick T and was still swung at. | [OBS 2/2] |
| Move + attack same tick | Yes — boss steps, becomes adjacent, and swings in the same tick (t759, t1004, t1449) | [OBS 3/3] |
| Cooldown when out of range | Timer keeps running; boss swings on the first tick it is adjacent with cooldown ≤ 0 (K4 t1138→t1144: 6-tick gap while re-pathing) | [OBS 1] |
| Accuracy | Standard roll: Brutus's attack roll (12 + 9) · 64 = **1,344** against the player's crush defence roll. For the recorded player that is (80 + 8) · (85 + 64) = 13,112 → **5.1%** to land. | Formula from the reference calculator; data below |
| Damage | Uniform 0–**3** on a landed swing (max hit from Strength 25). A landed 0 looks like a miss. | [OBS] never above 3 |
| Observed | 84 swings: 0 ×83, 2 ×1. Without the prayer: 69 swings, 1 damaging. The model predicts 3.8% damaging swings, about 2.7 in 69; seeing 1 or fewer has probability 0.26. | Consistent with the model |
| Protect from Melee | **Blocks the swing completely** (`prayerPenetration: 0`). K6: 15 swings under the prayer, all 0 — which the 5.1% hit rate would produce anyway, so the captures neither show nor contradict it. | **[DOC]** OSRS Wiki; not observable in our data |

### 4.3 Stomp (seq 13785, "\*snorts\*")

| Offset | Event | Confidence |
|---|---|---|
| T | Seq 13785 (delay 30), say "\*snorts\*", sound 11213, boss faces fixed coord = centre + 5·dir. Direction and tile set are **locked at T**. Boss stops moving. | [OBS 16/16] |
| T+4 | **Impact**: spotanim 3589 on boss, map_anim 3588 on each stomp tile, damage hitsplat on the player if caught | [OBS 14/14] |
| T+6 | Boss re-faces the player and may walk again (up to 2 steps: T+6, T+7) | [OBS 12/12] |
| T+8 | Next action (next stomp of the triple, or first melee after the third) | [OBS 12/12] |

- Stomps come as a **set of three**, 8 ticks apart when the player stays within reach. Each stomp re-reads the player's position for its own direction. Stomps 2 and 3 are delayed while the player is out of reach (§5.1).
- **Dodge window:** the player must be off the danger tiles by the end of tick T+3 (position is evaluated in the boss's turn of T+4). K4 t1157: player still on a stomp tile at end of T+2, stepped off on T+3, no damage.
- Damage: **15–19**, typeless (`prayerPenetration: 1`) **[DOC]** — the wiki lists a special max hit of 19. Observed: 15 ×4, 16 ×4, 17 ×1; no 18 or 19 in nine hits. Six of these landed with **Protect from Melee active** (K6), so the prayer does not reduce stomp damage [OBS]. The engine rolls uniformly over `stompDamage` (default 15–19, configurable); the replay takes each damage value from the recording, so the range does not affect it.
- The first stomp of a set needs the player in melee range (§5.1). If the boss steps into range on tick T, the facing coordinate is sent on T+1 instead of T (K9 437/438).

### 4.4 Charge (seq 13778, "\*growls\*")

| Offset | Event | Confidence |
|---|---|---|
| T | Seq 13778 (delay 60), say "\*growls\*", sound 11210, boss faces fixed coord = centre + 5·dir (cardinal). Direction **and destination** locked at T. Boss stops moving. If the boss stepped into range on T, the facing coordinate is sent on T+1 (K6 81/82). | [OBS 9/9] |
| T+4 | Boss SW anchor **teleports to the locked destination** (§5.3) with `exact_move` (to1 = old SW, delay1 = 0; to2 = new SW, delay2 = 60 cycles regardless of distance; angle 512 = west, 0 = south, 1024 = north). Damage hitsplat on the player in the same tick if caught. | [OBS 9/9] |
| T+6 | Boss re-faces the player and may walk (T+6, T+7) | [OBS 9/9] |
| T+8 | First melee of the next block | [OBS 9/9] |

- **Dodge window:** same as stomp — be out of the path by end of T+3.
- Damage: **15–19**, typeless **[DOC]**, as for the stomp (`chargeDamage`, configurable). Observed: 15 ×2, 16 ×1, 17 ×2. Two landed with **Protect from Melee active** (K6), so the prayer does not reduce charge damage [OBS].

### 4.5 Death / respawn

| Offset | Event | Confidence |
|---|---|---|
| D | HP → 0 hitsplat. No swing or special starts this tick and any pending special is cancelled. The boss **can still take its movement step** (K7 268: walked on D). | [OBS 10/10; movement 1 sample] |
| D+1 | Say "m-moo...", ops disabled, facing reset, **fight timer stops** (timer = (D+1) − S ticks; 9/9 match the game message) | [OBS 10/10] |
| D+1 | Seq 13784 (death). **D+3 instead if the boss stepped on tick D** (K7). | [OBS 9/9 + 1/1] |
| anim+4 | NPC deleted; loot + `map_anim` 85 on the footprint tile nearest the player; kill-count message. Normally D+5; D+7 in K7. | [OBS 9/9 + K7] |
| despawn+35 | Respawn (new NPC add at (3261,3287)) if the player is still in the instance. The wiki gives 36 ticks, which is the same interval counted from one tick earlier. Ringing the cowbell amulet shortens it (§10). | [OBS 6/6] |

---

## 5. State machine

```
SPAWNING (S .. S+5)
  └─ S+6 → MELEE_BLOCK(n = 2)

MELEE_BLOCK(n), every tick:
  if standing on the player → random shuffle (W/E/S/N or none), no action this tick
  else if not in melee range → one chase step (§5.4)
  if cooldown ≤ 0 and in melee range (after the step):
      n > 0 → swing, cooldown = 5, n -= 1
      n = 0 → SPECIAL

SPECIAL:
  kind = first: random · afterwards: alternate (STOMP_SET ↔ CHARGE)
  STOMP_SET: 3 × [T: lock dir · T+4: impact · T+6,T+7: free move ·
              T+8 onward: if the player is adjacent or under the boss at the start of the tick → next stomp,
              else one chase step and try again next tick]
  CHARGE:        [T: lock dir + destination · T+4: dash + hit · T+6,T+7: free move]
  → MELEE_BLOCK(n = 4), first swing eligible at (last special T) + 8

DEAD (D): movement step only → D+1 say → death anim (D+1, or D+3 if it stepped) → +4 despawn → +35 respawn
```

### 5.1 Rules and evidence

| Rule | Evidence | Confidence |
|---|---|---|
| Opening block is **2** swings, every later block is **4** | 9/9 openings; 14/14 completed later blocks | [OBS] |
| A special is an **attack opportunity**: it needs the cooldown elapsed *and* the player in melee range, exactly like a swing | With the player in range it lands 5 ticks after the last swing (19/19). K7: special due at 248, player out of range, fired at 254 on the first tick in range. | [OBS] |
| The boss can **step into range and start the special on the same tick** | K6 81 (charge), K9 437 (stomp) | [OBS 2/2] |
| Stomps 2 and 3 fire at T+8 if the player is **adjacent or under the boss** at the start of that tick; otherwise the boss chases and checks again each tick | In reach at T+8: all other sets. Under the boss: K4 1165, K9 445, K10 574. Out of reach: K10 stomp 2 at T+9 (561 chase step, 562 stomp), stomp 3 at T+12 (568–573 chase, 574 stomp). | [OBS] |
| Unlike the first special of a set, stomps 2 and 3 **do not step and stomp on the same tick** | K10 561 and 573: the step brought the boss adjacent, the stomp came the next tick | [OBS 2/2] |
| Specials **alternate** Stomp-set ↔ Charge | K4: S,C,S,C,S,C · K6: S,C,S,C,S · K9: C,S,C | [OBS 11/11 transitions] |
| **First special is random**, not always the stomp set | Regular kills: stomp ×7 (K2–K7, K10), charge ×2 (K8, K9). Quest kill: charge. Overall stomp 7, charge 3. | [OBS] that both occur. The engine uses 50/50; the observed 7:3 is consistent with that but ten kills cannot fix the weights. |
| No HP-threshold phases, no transformation | Same cycle from 58 HP to 0 in all kills | [OBS] |
| Boss stays attackable during specials | Player hitsplats land throughout | [OBS] |
| **Protect from Melee does not reduce stomp or charge damage** | K6: 6 stomps and 2 charges at 15–17 with the prayer on | [OBS 8/8] |
| Protect from Melee **blocks the melee swing** | Documented. K6: 15 swings, all 0 — but 68 of 69 swings without the prayer were 0 too, so the captures cannot confirm it independently | **[DOC]** |

### 5.2 Stomp geometry

Let `C = SW + (1,1)` (centre tile), `d = playerTile − C` using the player's tile at the start of tick T, `dir = (sign(dx), sign(dy))`.
All 32 recorded stomps match this rule (the "Seen" column counts capture 1 only). Tiles relative to the SW anchor:

| dir | Tiles (relative to SW) | Shape | Seen |
|---|---|---|---|
| N (0,+1) | (0,3) (1,3) (2,3) | 3×1 edge | 2 |
| S (0,−1) | (0,−1) (1,−1) (2,−1) | 3×1 edge | 1 |
| W (−1,0) | (−1,0) (−1,1) (−1,2) | 1×3 edge | 1 |
| E (+1,0) | (3,0) (3,1) (3,2) | 1×3 edge | 0 — **[INF]** by symmetry |
| SW (−1,−1) | (−1,−1) (−1,0) (−1,1) (0,−1) (1,−1) | L, 5 tiles | 5 |
| SE (+1,−1) | (3,−1) (3,0) (3,1) (1,−1) (2,−1) | L, 5 tiles | 4 (+1 cancelled) |
| NW (−1,+1) | (−1,3) (−1,2) (−1,1) (0,3) (1,3) | L, 5 tiles | 2 (+1 cancelled) |
| NE (+1,+1) | (3,3) (3,2) (3,1) (2,3) (1,3) | L, 5 tiles | 0 — **[INF]** by symmetry |

L shape = the corner tile plus the two nearest tiles along each adjoining edge (the far tile of each edge is safe).

Consequence of the sign rule: a player on an edge tile that is not the middle of that edge gets the **L**, not the line (e.g. east side, bottom row → SE).
A player **under** the boss also resolves by sign (K4 t1165: player on the boss's SW tile, d = (−1,−1) → SW).
A player on the **exact centre tile** (d = (0,0)) gets a **west** stomp: K10 t574, tiles (−1,0) (−1,1) (−1,2). One sample.

**Under-boss damage:** K4 t1301 → impact t1305. Stomp NW; player at SW+(0,1) (inside the footprint, next to stomp tile (−1,1)) took 17 while standing on no marked tile. So footprint tiles bordering the stomp tiles are also dangerous. Exact extent **[UNK]** (one sample).

### 5.3 Charge geometry

**Direction** is cardinal only: the dominant axis of `d` (player − centre), equivalently the side of the footprint the player is next to. 9/9. Tie-break when |dx| = |dy| is **[UNK]**.

**Destination.** The boss's SW tile is aimed **3 tiles past the player's tile** along the charge axis; the other coordinate is unchanged. The player tile is the one locked at T.

Because the anchor is the SW corner, this is asymmetric for an adjacent player:
- West / south: the boss ends touching the far side of the player's tile → **4 tiles**.
- North / east: the boss ends two tiles beyond the player → **6 tiles**.

| Kill, T | Start SW | Dir | Player at lock | Aimed SW | Actual SW | Tiles | Note |
|---|---|---|---|---|---|---|---|
| K1 769 | 3261,3290 | W | 3260,3290 | x = 3257 | 3257,3290 | 4 | |
| K4 1193 | 3262,3288 | W | 3261,3289 | x = 3258 | 3258,3288 | 4 | |
| K4 1265 | 3261,3288 | S | 3262,3287 | y = 3284 | 3261,3284 | 4 | |
| K4 1337 | 3262,3288 | S | 3263,3287 | y = 3284 | 3262,3284 | 4 | |
| K6 81 | 3263,3284 | S | 3264,3283 | y = 3280 | 3263,3280 | 4 | boss stepped S on T |
| K6 153 | 3263,3280 | N | 3264,3283 | y = 3286 | 3263,3286 | **6** | |
| K8 326 | 3261,3288 | N | 3262,3291 | y = 3294 | 3261,3292 | 4 | **stopped by the pen fence** (top row at y = 3294) |
| K9 409 | 3259,3291 | W | 3258,3292 | x = 3255 | 3255,3291 | 4 | |
| K9 481 | 3259,3288 | W | 3258,3290 | x = 3255 | 3254,3288 | **5** | aimed footprint covers the object at 3257,3289 → **carried on one tile** |

**Collision during the dash** [INF, one sample each]:
- Fences/walls stop the dash short (K8).
- Scenery does not stop it — the footprint passed over 3257,3289 in K9 — but the boss will not come to rest on scenery and continues to the first clear footprint.
- An east charge has never been captured.

**Hit area:** consistent with the bounding box of the start and end footprints. Hits: K1, K4 1341, K6 85, K6 157, K8 330 (player in the swept lane). Misses: K4 1197, K4 1269, K9 413, K9 485 (player beside the lane). Whether the start footprint itself damages is **[UNK]**.

### 5.4 Movement

- **Chase:** OSRS naive NPC pathing. Destination = the tile that puts the 3×3 footprint cardinally adjacent on the side of the player the boss is already on; step order diagonal → x → y, each checked against collision. Every recorded chase step matches.
- **In melee range:** no movement.
- **Standing on the player:** one random outcome per tick — a step W, E, S or N, or no step. 17 samples: W ×7, N ×5, E ×3, S ×1, none ×1. Never diagonal. No swing or special that tick, even if the step brings it into range.
- **During a special:** frozen from T to T+5; free at T+6 and T+7.
- A chase step and a swing (or the start of a special) can share a tick.

---

## 6. Worked example (K2, fresh entry, ticks relative to S = 995)

| Rel | Boss SW | Player | Event |
|---|---|---|---|
| 0 | 3261,3287 | 3262,3294 | Spawn seq 13790 |
| 5 | 3261,3287 | 3262,3294 | "Moo"; player unlocked, fires |
| 6–8 | →3262,3290 | 3262,3294 | Walks NE, N, N |
| 9 | 3262,3291 | 3262,3294 | Walks N + **Melee 1** (hit 0 same tick) |
| 14 | 3262,3291 | 3261,3292 | **Melee 2** |
| 19 | 3261,3290 | 3260,3290 → 3259,3289 | **Stomp 1** locks SW |
| 23 | 3261,3290 | 3259,3291 | Impact: 5 tiles, player clear |
| 25 | →3260,3291 | 3259,3291 | Boss free, steps NW |
| 27 | 3260,3291 | 3259,3291 | **Stomp 2** locks SW |
| 31 | 3260,3291 | 3261,3288 | Impact, player clear |
| 35 | 3260,3291 | 3262,3290 | **Stomp 3** locks SE |
| 37 | 3260,3291 | 3263,3291 | Boss HP 0 (D) — stomp 3 cancelled |
| 38 | | | Death anim; timer 38 t = 0:22.80 ✓ |
| 42 | | | Despawn + loot |

Full per-tick data for all kills: `brutus_tick_timeline.csv`.

---

## 7. Open questions and test kills needed

Settled from documentation rather than a capture (revision 4): Protect from Melee blocks the swing; special damage is 15–19. A capture showing an 18 or 19, or a no-armour kill alternating the prayer, would upgrade these from [DOC] to [OBS] but is no longer blocking.

Resolved so far: special damage vs. Protect from Melee, special trigger at range, first-special selection, charge distance, north charge (capture 2); stomps 2–3 with the player out of reach, stomp from the centre tile, melee accuracy and max hit (revision 3).

| # | Unknown | Test kill |
|---|---|---|
| 3 | **East charge**, and charge **tie-break** (player on a diagonal corner or the centre tile). | Stand east of the boss at the growl; stand on a corner; stand under the centre. |
| 4 | **Charge vs. collision.** One fence stop and one scenery overrun. | Bait charges toward each fence and across 3257,3289 from other angles. |
| 5 | **Charge hit area** — does standing in the start footprint (under the boss) get hit? | Stand under the boss through a charge. |
| 6 | **Under-boss stomp damage extent** (§5.2), still one sample. | Stand on each footprint tile through a stomp. |
| 7 | **Stomp E and NE shapes** (inferred by symmetry). | Position east / north-east at the snort. |
| 8 | **Under-player shuffle weights**, including how often it does not step (1 of 17). | Stand under the boss for 50+ free ticks. |
| 9 | **Death animation delay** when the boss steps on its death tick (one sample, D+3). | Kill it while it is chasing, several times. |
| 10 | **First-special weights** (stomp 7, charge 3). | Many short kills; log only the first special. |
| 11 | **A charge due while the player is under the boss**, and the first stomp of a set in the same situation. | Stand under the boss when the block's last swing has landed. |
| 12 | **Other NPCs.** Cows share the instance and should block the boss; none came close. | Fight next to a cow. |

---

## 8. Player-side reference (for log-replay inputs)

**Loadout in every capture** (worn-inventory packet at login, capture 2 tick 0; levels supplied by the player):

| | |
|---|---|
| Levels | Attack 82, Strength 80, Defence 80, Ranged 85, Magic 80, Hitpoints 85, Prayer 74 |
| Worn | Snakeskin bandana, amulet of glory, magic shortbow, black d'hide body, chaps and vambraces, snakeskin boots, rune arrows |
| Defence bonuses | stab 58, slash 71, **crush 85**, magic 82, ranged 81 |
| Offence | ranged attack +144, ranged strength +49 |
| Stance | Rapid (3-tick attacks) |

**Formula checks against the logs:**
- Ranged max hit: 16 at Ranged 85; 18 at 92–93 (ranging potion). All four max-hit hitsplats (type 43) match: 18 at level 93 and 92 (capture 1), 16 at level 85 twice (capture 2). No recorded hit exceeds the max for its level.
- Player accuracy on Brutus: attack roll 19,344 vs. defence roll 1,083 → 97.2%. Recorded: 4 misses in 82 shots.
- A landed hit that rolls 0 deals 1: among 78 landed hits, the value 1 appears 12 times against about 4 for any other value.

**Packets:**
- Weapon: bow, seq 426 `human_bow`, launch spotanim 24 (slot 1, height 96).
- Projectile 15 `rune_arrow_travel`: `starttime` 41, `endtime` = 41 + 5 + 5·dist cycles (dist 1 → 51, 2 → 56, 5 → 71; dist = Chebyshev distance to the nearest footprint tile), `startheight` 163, `endheight` 146, `angle` (slope) 15, `progress` 11. Target tile sent = boss SW + (1,1).
- Boss hitsplat appears 2 ticks after the firing tick at dist ≤ 2 and 3 ticks after at dist 5.
- Hitsplat types: 12 = block, 16 = damage, 43 = max-hit damage. Headbar 17 on the boss, 0 on the player.
- Player block seq 424 is sent with delay 30 on every boss swing.

---

## 9. External cross-check

*(Written for revision 1.)* The OSRS Wiki lists Brutus as 3×3, combat level 30, an instanced fight in the Lumbridge cow field, released 25 February 2026 — matching the size and instance findings above. Third-party guides give 58 HP and describe the stomp as a 3×1 line or an L. Values tagged [DOC] (Protect from Melee vs. the swing, special damage 15–19, §10) and the combat levels in §3 come from the wiki; everything else comes from the transcripts unless tagged [INF].

---

## 10. Documented mechanics not captured — future hooks (not implemented)

Neither of these appears in any capture, so there is nothing to replay them against. They are recorded here so the engine can grow a hook for each once there is data.

| Mechanic | What the documentation says | State in the engine |
|---|---|---|
| **Cowbell amulet respawn** | Ringing the amulet right after the kill brings the next Brutus out after **13 ticks** instead of the normal 35 (wiki: 36). The wiki adds that ringing late, shortly before the normal respawn, can make the wait longer. | `BrutusTiming.RESPAWN_AFTER_COWBELL = 13` exists as a constant; nothing reads it. Needed before wiring: a capture showing which tick the 13 is counted from (the ring, the chat message, or the despawn) and the late-ring case. |
| **Anti-safespot stomp** (update of 4 March 2026) | If Brutus is safespotted while the player is only one tile away, he now uses his stomp. | Not modelled. In the engine a special still needs an attack opportunity (§5.1), so a Brutus that cannot reach the player never starts one. Needed: a capture of a one-tile safespot (for example across the scenery at 3257,3289 or 3260,3294) showing the trigger delay and which stomp shape is used. |
