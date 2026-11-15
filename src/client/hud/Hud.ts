import type { GameSession, SessionStats } from '../GameSession.ts';

export interface HudActions {
  start(): void;
  reset(): void;
  setClickToMove(on: boolean): void;
  setSound(on: boolean): void;
  setPixelPerfect(on: boolean): void;
  setDebug(on: boolean): void;
}

const STATE_LABEL: Record<SessionStats['state'], string> = {
  idle: 'Waiting at the pen gate',
  fighting: 'Fighting',
  dead: 'You died',
};

/** The simulator's own controls and fight statistics, shown in the game frame's chatbox. Plain DOM; knows nothing about Three.js. */
export class Hud {
  private readonly values = new Map<string, HTMLElement>();
  private readonly startButton: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly session: GameSession, actions: HudActions, private readonly assetNote = '') {
    root.innerHTML = `
      <div class="sim-controls">
        <div>
          <p class="state" data-value="state"></p>
          <div class="buttons">
            <button type="button" data-action="start">Release Brutus</button>
            <button type="button" data-action="reset">Reset</button>
          </div>
          <fieldset>
            <label><input type="checkbox" data-toggle="move" checked> Click to move</label>
            <label><input type="checkbox" data-toggle="sound"> Sound effects</label>
            <label><input type="checkbox" data-toggle="debug"> Tile grid and region seam</label>
            <label title="Draw the frame at whole multiples of its native 765×503 size only"><input type="checkbox" data-toggle="pixels"> Pixel-perfect scaling</label>
          </fieldset>
        </div>
        <dl>
          <dt>Tick</dt><dd data-value="tick"></dd>
          <dt>Kills</dt><dd data-value="kills"></dd>
          <dt>Brutus HP</dt><dd data-value="bossHp"></dd>
          <dt>Your HP</dt><dd data-value="playerHp"></dd>
          <dt>Dealt</dt><dd data-value="dealt"></dd>
          <dt>Taken</dt><dd data-value="taken"></dd>
          <dt>DPS</dt><dd data-value="dps"></dd>
          <dt>Last kill</dt><dd data-value="lastKill"></dd>
          <dt>Seed</dt><dd data-value="seed"></dd>
          <dt></dt><dd></dd>
          <p class="note" data-value="assets"></p>
        </dl>
      </div>`;

    for (const el of root.querySelectorAll<HTMLElement>('[data-value]')) this.values.set(el.dataset.value!, el);
    this.startButton = root.querySelector<HTMLButtonElement>('[data-action="start"]')!;
    this.startButton.addEventListener('click', () => actions.start());
    root.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener('click', () => actions.reset());

    const toggles: Record<string, (on: boolean) => void> = {
      move: actions.setClickToMove,
      sound: actions.setSound,
      pixels: actions.setPixelPerfect,
      debug: actions.setDebug,
    };
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-toggle]')) {
      input.addEventListener('change', () => toggles[input.dataset.toggle!]!(input.checked));
    }
    this.refresh();
  }

  /** Redraw the numbers. Call once per tick. */
  refresh(): void {
    const s = this.session.stats;
    const set = (key: string, text: string): void => {
      const el = this.values.get(key);
      if (el && el.textContent !== text) el.textContent = text;
    };
    set('state', STATE_LABEL[s.state]);
    set('tick', String(s.tick));
    set('bossHp', s.bossHp === null ? '—' : `${s.bossHp} / ${s.bossMaxHp}`);
    set('playerHp', `${s.playerHp} / ${s.playerMaxHp}`);
    set('dealt', String(s.damageDealt));
    set('taken', String(s.damageTaken));
    set('dps', s.dps.toFixed(2));
    set('kills', String(s.kills));
    set('lastKill', s.lastKillTicks === null ? '—' : `${s.lastKillTicks} t (${(s.lastKillTicks * 0.6).toFixed(1)} s)`);
    set('seed', String(s.seed));
    set('assets', this.assetNote);
    this.startButton.disabled = s.state !== 'idle';
  }
}
