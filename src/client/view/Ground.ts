/** Height of the ground under a scene position, so entities and markers sit on the terrain. */
export interface Ground {
  heightAt(x: number, z: number): number;
}

export const FLAT_GROUND: Ground = { heightAt: () => 0 };
