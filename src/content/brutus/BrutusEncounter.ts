import type { World } from '../../sdk/World.ts';
import { Brutus } from './Brutus.ts';
import { BrutusTiming, DEFAULT_BRUTUS_CONFIG, type BrutusConfig } from './BrutusConstants.ts';

export interface BrutusEncounterOptions {
  config?: BrutusConfig;
  /** Respawn Brutus 35 ticks after each despawn while the player stays in the instance. Default true. */
  respawn?: boolean;
}

export interface BrutusKillRecord {
  spawnTick: number;
  deathTick: number;
  fightDurationTicks: number;
}

/**
 * The instanced fight: owns the current Brutus, counts kills and handles the respawn timer.
 * `start()` queues the first spawn for the next world tick.
 */
export class BrutusEncounter {
  boss: Brutus | null = null;
  readonly kills: BrutusKillRecord[] = [];
  private readonly config: BrutusConfig;
  private readonly respawn: boolean;

  constructor(
    private readonly world: World,
    options: BrutusEncounterOptions = {},
  ) {
    this.config = options.config ?? DEFAULT_BRUTUS_CONFIG;
    this.respawn = options.respawn ?? true;
  }

  start(): Brutus {
    return this.spawnBoss();
  }

  private spawnBoss(): Brutus {
    const boss = new Brutus(this.config);
    boss.onDespawn = (world, dead) => {
      this.kills.push({
        spawnTick: dead.spawnTick,
        deathTick: dead.deathTick,
        fightDurationTicks: dead.fightDurationTicks,
      });
      this.boss = null;
      if (this.respawn) {
        // Scheduled callbacks run before the NPC phase, so the new boss spawns on this exact tick.
        world.schedule(world.tick + BrutusTiming.RESPAWN_AFTER_DESPAWN, () => this.spawnBoss());
      }
    };
    this.boss = boss;
    this.world.addMob(boss);
    return boss;
  }
}
