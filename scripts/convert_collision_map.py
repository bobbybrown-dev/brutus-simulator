#!/usr/bin/env python3
"""
Build region_<id>_collision.json files from the cache-derived collision map published by the
RuneLite shortest-path plugin (https://github.com/Skretzo/shortest-path, BSD 2-Clause).

    git clone --depth 1 https://github.com/Skretzo/shortest-path
    python scripts/convert_collision_map.py shortest-path/src/main/resources/collision-map.zip

That zip is regenerated from the live OSRS cache every week by the plugin's own workflow. Each
region entry packs four bits per tile per plane: north edge open, east edge open, north edge is a
wall, east edge is a wall. This script turns plane 0 into OSRS-style collision bit flags:

    0x100  tile is impassable (no open edge)
    0x02 / 0x08 / 0x20 / 0x80   closed north / east / south / west edge of a walkable tile

Diagonal-only wall flags (pillars) are not recoverable from this source and are left unset.
Output goes to the current directory, in the schema `src/sdk/Collision.ts` loads.
"""
import json
import sys
import zipfile

REGION = 64
REGIONS = [(50, 51), (51, 51), (50, 50), (51, 50)]  # 12851, 13107, 12850, 13106
WALL_N, WALL_E, WALL_S, WALL_W, SOLID = 0x2, 0x8, 0x20, 0x80, 0x100


def main(zip_path: str) -> None:
    archive = zipfile.ZipFile(zip_path)
    names = set(archive.namelist())
    cache: dict[tuple[int, int], bytes | None] = {}

    def bit(x: int, y: int, flag: int) -> bool:
        key = (x >> 6, y >> 6)
        if key not in cache:
            name = f"{key[0]}_{key[1]}"
            cache[key] = archive.read(name) if name in names else None
        data = cache[key]
        if data is None:
            return False
        index = ((y & 63) * REGION + (x & 63)) * 4 + flag  # plane 0
        byte = index >> 3
        return byte < len(data) and (data[byte] >> (index & 7)) & 1 == 1

    north = lambda x, y: bit(x, y, 0)
    east = lambda x, y: bit(x, y, 1)
    south = lambda x, y: north(x, y - 1)
    west = lambda x, y: east(x - 1, y)
    solid = lambda x, y: not (north(x, y) or east(x, y) or south(x, y) or west(x, y))

    def flags(x: int, y: int) -> int:
        if solid(x, y):
            return SOLID
        f = 0
        if not north(x, y) and not solid(x, y + 1): f |= WALL_N
        if not east(x, y) and not solid(x + 1, y): f |= WALL_E
        if not south(x, y) and not solid(x, y - 1): f |= WALL_S
        if not west(x, y) and not solid(x - 1, y): f |= WALL_W
        return f

    for rx, ry in REGIONS:
        region_id = (rx << 8) | ry
        base_x, base_y = rx * REGION, ry * REGION
        tiles = [[flags(base_x + lx, base_y + ly) for ly in range(REGION)] for lx in range(REGION)]
        out = f"region_{region_id}_collision.json"
        with open(out, "w") as f:
            json.dump({"region_id": region_id, "base_x": base_x, "base_y": base_y,
                       "width": REGION, "height": REGION, "tiles": tiles}, f)
        flagged = sum(1 for column in tiles for v in column if v)
        print(f"wrote {out}: {flagged} flagged tiles")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: convert_collision_map.py <collision-map.zip>")
    main(sys.argv[1])
