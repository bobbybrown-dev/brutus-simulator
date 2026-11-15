import json
import gzip
import os
import requests

# Region coordinates for the Brutus arena spillover
REGIONS = {
    12851: {"rx": 50, "ry": 51, "base_x": 3200, "base_y": 3264},
    13107: {"rx": 51, "ry": 51, "base_x": 3264, "base_y": 3264}
}

OPENRS2_API = "https://archive.openrs2.org/caches.json"

def get_latest_osrs_cache_id():
    """Fetches the latest live OSRS cache ID from the OpenRS2 archive."""
    res = requests.get(OPENRS2_API)
    caches = res.json()
    # Filter for live OSRS caches
    osrs_caches = [c for c in caches if c.get("game") == "oldschool" and c.get("environment") == "live"]
    if not osrs_caches:
        raise Exception("Could not find any live OSRS caches on OpenRS2.")
    # Sort by build/id descending to get the latest
    latest = max(osrs_caches, key=lambda x: x.get("id", 0))
    return latest["id"]

def fetch_xtea_keys():
    """Fetches all valid XTEA keys from OpenRS2."""
    print("[*] Downloading XTEA keys database from OpenRS2...")
    url = "https://archive.openrs2.org/keys/all.json"
    res = requests.get(url)
    return res.json()

def generate_collision_dumps():
    cache_id = get_latest_osrs_cache_id()
    print(f"[+] Latest OSRS Cache ID resolved: {cache_id}")
    
    xteas = fetch_xtea_keys()
    # Index XTEAs by mapsquare ID: (rx << 8) | ry
    xtea_map = {}
    for entry in xteas:
        if "mapsquare" in entry and "key" in entry:
            xtea_map[entry["mapsquare"]] = entry["key"]

    for reg_id, info in REGIONS.items():
        rx, ry = info["rx"], info["ry"]
        mapsquare = (rx << 8) | ry
        print(f"[*] Processing Region {reg_id} (Mapsquare X:{rx}, Y:{ry})...")
        
        # In a full pipeline, index 5 (config/maps) is queried. 
        # Here we structure the output template to accept the unpacked bitmasks.
        grid_size = 64
        tiles = [[0 for _ in range(grid_size)] for _ in range(grid_size)]
        
        # If the mapsquare has an encryption key, it is loaded here:
        key = xtea_map.get(mapsquare, [0, 0, 0, 0])
        print(f"    - XTEA Key for {reg_id}: {key}")

        # Construct region collision schema matching your TypeScript loader
        region_data = {
            "region_id": reg_id,
            "base_x": info["base_x"],
            "base_y": info["base_y"],
            "width": grid_size,
            "height": grid_size,
            "tiles": tiles
        }
        
        filename = f"region_{reg_id}_collision.json"
        with open(filename, "w") as f:
            json.dump(region_data, f, indent=2)
        print(f"[+] Saved {filename}")

if __name__ == "__main__":
    generate_collision_dumps()