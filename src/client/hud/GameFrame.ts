import { PRAYER_SPRITES, SpriteIds } from '../../assets.ts';
import type { EquipmentSlot } from '../../content/loadouts/CaptureLoadout.ts';
import type { Stance } from '../../sdk/combat/Loadout.ts';
import type { PrayerName } from '../../sdk/combat/Prayers.ts';
import type { InventorySlot, PrayerSlot } from '../GameSession.ts';

/**
 * The classic fixed-mode game frame, 765×503 at native size: the 512×334 game viewport, the
 * minimap surround with its orbs, the chatbox, and the side panel with its two rows of tab stones.
 * It is laid out in native pixels and scaled as one block to fit its container.
 *
 * It is a pure view: it renders a `FrameSnapshot` and reports clicks as `FrameActions` intents. It
 * never touches the engine, so the same intents can come from a bot or a test. The 3D view and the
 * simulator's own controls are mounted by the caller into `viewport` and `chat`.
 */

export interface FrameSnapshot {
  hitpoints: number;
  maxHitpoints: number;
  prayerPoints: number;
  maxPrayerPoints: number;
  running: boolean;
  autoRetaliate: boolean;
  quickPrayersOn: boolean;
  prayers: readonly PrayerSlot[];
  inventory: readonly InventorySlot[];
  worn: Readonly<Partial<Record<EquipmentSlot, { itemId: number; name: string }>>>;
  weaponName: string;
  stance: Stance;
  stances: readonly Stance[];
  /** Lines for the stats tab and the equipment bonuses, already formatted by the caller. */
  /** Positions for the minimap, in world tiles. */
  minimap: { player: { x: number; y: number }; npcs: ReadonlyArray<{ x: number; y: number; size: number }>; isFloor(x: number, y: number): boolean };
  /** One line for the strip under the chatbox. */
  status: string;
  levels: ReadonlyArray<{ name: string; level: number; base: number }>;
  bonuses: ReadonlyArray<{ name: string; value: number }>;
}

export interface FrameActions {
  togglePrayer(name: PrayerName): void;
  toggleQuickPrayers(): void;
  useItem(slot: number): void;
  setStance(stance: Stance): void;
  setAutoRetaliate(on: boolean): void;
  setRun(on: boolean): void;
}

/** Where the frame gets its art. Null entries fall back to text and plain shapes. */
export interface FrameIcons {
  /** `large` asks for the higher-resolution render, used when the frame is drawn bigger than native. */
  item(itemId: number, large: boolean): string | null;
  sprite(spriteId: number, frame?: number): string | null;
}

export type TabId = 'combat' | 'stats' | 'quests' | 'inventory' | 'equipment' | 'prayer' | 'magic' | `other${number}`;

interface TabDef {
  id: TabId;
  label: string;
  sprite: number;
  row: 'top' | 'bottom';
}

const TABS: readonly TabDef[] = [
  { id: 'combat', label: 'Combat Options', sprite: SpriteIds.tabCombat, row: 'top' },
  { id: 'stats', label: 'Skills', sprite: SpriteIds.tabStats, row: 'top' },
  { id: 'quests', label: 'Quest List', sprite: SpriteIds.tabQuests, row: 'top' },
  { id: 'inventory', label: 'Inventory', sprite: SpriteIds.tabInventory, row: 'top' },
  { id: 'equipment', label: 'Worn Equipment', sprite: SpriteIds.tabEquipment, row: 'top' },
  { id: 'prayer', label: 'Prayer', sprite: SpriteIds.tabPrayer, row: 'top' },
  { id: 'magic', label: 'Magic', sprite: SpriteIds.tabMagic, row: 'top' },
  ...[SpriteIds.tabBottom0, SpriteIds.tabBottom1, SpriteIds.tabBottom2, SpriteIds.tabBottom3, SpriteIds.tabBottom4, SpriteIds.tabBottom5, SpriteIds.tabBottom6].map(
    (sprite, i): TabDef => ({ id: `other${i}`, label: 'Not simulated', sprite, row: 'bottom' }),
  ),
];

/** Tab hotkeys, in the game's default order. Change or empty this map to rebind. */
export const DEFAULT_TAB_KEYS: Readonly<Record<string, TabId>> = {
  F1: 'combat',
  F2: 'stats',
  F3: 'quests',
  F4: 'inventory',
  F5: 'equipment',
  F6: 'prayer',
  F7: 'magic',
  Escape: 'inventory',
};

const STANCE_LABEL: Record<Stance, string> = { accurate: 'Accurate', rapid: 'Rapid', longrange: 'Longrange', aggressive: 'Aggressive', defensive: 'Defensive', controlled: 'Controlled' };
const STANCE_NOTE: Partial<Record<Stance, string>> = { accurate: '+3 Ranged', rapid: '1 tick faster', longrange: '+2 range, +3 Defence' };
const REFUSAL_TEXT = { level: 'Prayer level too low', locked: 'Not unlocked', 'no-points': 'Out of prayer points' } as const;

/** Equipment slots on the classic worn-equipment grid: [column 0–2, row 0–4]. */
const WORN_LAYOUT: ReadonlyArray<{ slot: EquipmentSlot; col: number; row: number; empty: number }> = [
  { slot: 'head', col: 1, row: 0, empty: SpriteIds.wornHead },
  { slot: 'cape', col: 0, row: 1, empty: SpriteIds.wornCape },
  { slot: 'neck', col: 1, row: 1, empty: SpriteIds.wornNeck },
  { slot: 'ammo', col: 2, row: 1, empty: SpriteIds.wornAmmo },
  { slot: 'weapon', col: 0, row: 2, empty: SpriteIds.wornWeapon },
  { slot: 'body', col: 1, row: 2, empty: SpriteIds.wornTorso },
  { slot: 'shield', col: 2, row: 2, empty: SpriteIds.wornShield },
  { slot: 'legs', col: 1, row: 3, empty: SpriteIds.wornLegs },
  { slot: 'hands', col: 0, row: 4, empty: SpriteIds.wornHands },
  { slot: 'feet', col: 1, row: 4, empty: SpriteIds.wornFeet },
  { slot: 'ring', col: 2, row: 4, empty: SpriteIds.wornRing },
];

export const FRAME_WIDTH = 765;
export const FRAME_HEIGHT = 503;
const MINIMAP_SIZE = 152;
const MINIMAP_TILE = 4;

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class GameFrame {
  /** Mount the 3D view here: the 512×334 game viewport. */
  readonly viewport: HTMLElement;
  /** Mount the simulator's own controls here: the chatbox area. */
  readonly chat: HTMLElement;
  /** How much larger than native the frame is currently drawn. */
  scale = 1;
  /** Snap to whole multiples of the native size (sharpest pixel art, but usually smaller). */
  pixelPerfect = false;
  onScale: (scale: number) => void = () => {};

  private tab: TabId = 'inventory';
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly orbs: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private lastPanel = '';
  private lastOrbs = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly read: () => FrameSnapshot,
    private readonly actions: FrameActions,
    private readonly icons: FrameIcons | null,
    tabKeys: Readonly<Record<string, TabId>> = DEFAULT_TAB_KEYS,
  ) {
    container.classList.add('osrs-stage');
    this.root = document.createElement('div');
    this.root.className = `osrs-frame${icons ? ' has-art' : ''}`;
    const art = (...ids: number[]): string => {
      const urls = ids.map((id) => icons?.sprite(id)).filter((url): url is string => !!url);
      return urls.length === ids.length ? ` style="background-image:${urls.map((u) => `url('${u}')`).join(',')}"` : '';
    };
    const stones = (row: 'top' | 'bottom'): string =>
      TABS.filter((t) => t.row === row)
        .map((t) => {
          const url = icons?.sprite(t.sprite);
          return `<button class="tab-stone" data-tab="${t.id}" title="${escapeHtml(t.label)}">${url ? `<img src="${url}" alt="">` : escapeHtml(t.label.slice(0, 3))}</button>`;
        })
        .join('');
    this.root.innerHTML = `
      <div class="viewport"></div>
      <div class="edge top"${art(SpriteIds.mainTop)}></div>
      <div class="chat"${art(SpriteIds.chatBackground)}></div>
      <div class="chat-stones"${art(SpriteIds.mainStonesBottom)}><span></span></div>
      <div class="mini">
        <canvas class="minimap" width="${MINIMAP_SIZE}" height="${MINIMAP_SIZE}"></canvas>
        <div class="mini-left"${art(SpriteIds.miniLeft)}></div>
        <div class="mini-cover"${art(SpriteIds.fixedMinimapCover)}></div>
        <div class="mini-right"${art(SpriteIds.miniRight)}></div>
        <div class="mini-bottom"${art(SpriteIds.miniBottom)}></div>
        <div class="orbs"></div>
      </div>
      <div class="stones top"${art(SpriteIds.sideBackgroundTop)}>${stones('top')}</div>
      <div class="column left"${art(SpriteIds.sideBackgroundLeft1, SpriteIds.sideBackgroundLeft2)}></div>
      <div class="panel"${art(SpriteIds.sideBackground)}></div>
      <div class="column right"${art(SpriteIds.sideBackgroundRight)}></div>
      <div class="stones bottom"${art(SpriteIds.sideBackgroundBottom)}>${stones('bottom')}</div>`;
    container.appendChild(this.root);
    const part = <T extends HTMLElement>(selector: string): T => this.root.querySelector<T>(selector)!;
    this.viewport = part('.viewport');
    this.chat = part('.chat');
    this.panel = part('.panel');
    this.orbs = part('.orbs');
    this.statusLine = part('.chat-stones span');
    this.minimap = part<HTMLCanvasElement>('.minimap');

    this.root.addEventListener('click', (event) => this.onClick(event));
    window.addEventListener('keydown', (event) => {
      const tab = tabKeys[event.key];
      if (!tab || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      this.show(tab);
    });
    new ResizeObserver(() => this.fit()).observe(container);
    this.fit();
    this.refresh();
  }

  /** Scale the 765×503 frame to the largest size that fits the container, centred. */
  fit(): void {
    const available = Math.min(this.container.clientWidth / FRAME_WIDTH, this.container.clientHeight / FRAME_HEIGHT);
    const scale = Math.max(0.25, this.pixelPerfect && available >= 1 ? Math.floor(available) : available);
    const left = Math.max(0, (this.container.clientWidth - FRAME_WIDTH * scale) / 2);
    const top = Math.max(0, (this.container.clientHeight - FRAME_HEIGHT * scale) / 2);
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px) scale(${scale})`;
    // Pixel art stays crisp at whole multiples; in between, smooth filtering avoids uneven pixels.
    this.root.classList.toggle('whole-scale', Number.isInteger(scale));
    if (scale === this.scale) return;
    this.scale = scale;
    this.lastPanel = '';
    this.onScale(scale);
    this.refresh();
  }

  show(tab: TabId): void {
    this.tab = tab;
    this.refresh();
  }

  get currentTab(): TabId {
    return this.tab;
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-prayer],[data-slot],[data-stance],[data-action]');
    if (!target) return;
    const data = target.dataset;
    if (data.tab) return this.show(data.tab as TabId);
    if (data.prayer) this.actions.togglePrayer(data.prayer as PrayerName);
    else if (data.slot) this.actions.useItem(Number(data.slot));
    else if (data.stance) this.actions.setStance(data.stance as Stance);
    else if (data.action === 'retaliate') this.actions.setAutoRetaliate(!this.read().autoRetaliate);
    else if (data.action === 'run') this.actions.setRun(!this.read().running);
    else if (data.action === 'quick-prayers') this.actions.toggleQuickPrayers();
    this.refresh();
  }

  /** Re-render whatever changed. Cheap enough to call every tick. */
  refresh(): void {
    const s = this.read();
    const orbs = `
      <button class="orb hp" title="Hitpoints: ${s.hitpoints} / ${s.maxHitpoints}"><span>${s.hitpoints}</span></button>
      <button class="orb orb-prayer${s.quickPrayersOn ? ' on' : ''}" data-action="quick-prayers" title="Quick-prayers (Protect from Melee)"><span>${s.prayerPoints}</span></button>
      <button class="orb run${s.running ? ' on' : ''}" data-action="run" title="Toggle run"><span>${s.running ? 'Run' : 'Walk'}</span></button>`;
    if (orbs !== this.lastOrbs) this.orbs.innerHTML = this.lastOrbs = orbs;

    if (this.statusLine.textContent !== s.status) this.statusLine.textContent = s.status;
    this.drawMinimap(s);

    const html = this.renderTab(s);
    if (html !== this.lastPanel) this.panel.innerHTML = this.lastPanel = html;
    for (const stone of this.root.querySelectorAll<HTMLElement>('.tab-stone')) stone.classList.toggle('selected', stone.dataset.tab === this.tab);
  }

  /** Top-down view centred on the player: field tiles, the player in white, NPCs in yellow. */
  private drawMinimap(s: FrameSnapshot): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const { player, npcs, isFloor } = s.minimap;
    const half = Math.ceil(MINIMAP_SIZE / MINIMAP_TILE / 2);
    const centre = MINIMAP_SIZE / 2 - MINIMAP_TILE / 2;
    const at = (x: number, y: number): [number, number] => [centre + (x - player.x) * MINIMAP_TILE, centre - (y - player.y) * MINIMAP_TILE];
    ctx.fillStyle = '#1d2a14';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = '#4c6b2c';
    for (let dy = -half; dy <= half; dy++)
      for (let dx = -half; dx <= half; dx++)
        if (isFloor(player.x + dx, player.y + dy)) ctx.fillRect(...at(player.x + dx, player.y + dy), MINIMAP_TILE, MINIMAP_TILE);
    ctx.fillStyle = '#ffff00';
    for (const npc of npcs) {
      const [x, y] = at(npc.x, npc.y + npc.size - 1);
      ctx.fillRect(x, y, npc.size * MINIMAP_TILE, npc.size * MINIMAP_TILE);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(...at(player.x, player.y), MINIMAP_TILE, MINIMAP_TILE);
  }

  private renderTab(s: FrameSnapshot): string {
    switch (this.tab) {
      case 'combat':
        return this.renderCombat(s);
      case 'stats':
        return `<div class="tab-title">Skills</div><div class="levels">${s.levels
          .map((l) => `<div class="level${l.level !== l.base ? ' boosted' : ''}"><span>${escapeHtml(l.name)}</span><b>${l.level}/${l.base}</b></div>`)
          .join('')}</div>`;
      case 'inventory':
        return `<div class="inventory">${s.inventory.map((slot) => this.renderItemSlot(slot)).join('')}</div>`;
      case 'equipment':
        return this.renderEquipment(s);
      case 'prayer':
        return `<div class="prayers">${s.prayers.map((p) => this.renderPrayer(p)).join('')}</div><div class="prayer-points">${s.prayerPoints} / ${s.maxPrayerPoints}</div>`;
      case 'quests':
        return this.placeholder('Quest List');
      case 'magic':
        return this.placeholder('Magic');
      default:
        return this.placeholder('This tab');
    }
  }

  private placeholder(name: string): string {
    return `<div class="tab-title">${escapeHtml(name)}</div><p class="placeholder">Not part of this simulator. The tab is here to keep the game frame complete.</p>`;
  }

  private renderCombat(s: FrameSnapshot): string {
    const styles = s.stances
      .map((stance) => `<button class="style${stance === s.stance ? ' selected' : ''}" data-stance="${stance}"><b>${STANCE_LABEL[stance]}</b><small>${STANCE_NOTE[stance] ?? ''}</small></button>`)
      .join('');
    return `<div class="tab-title">${escapeHtml(s.weaponName)}</div>
      <div class="styles">${styles}</div>
      <button class="retaliate${s.autoRetaliate ? ' selected' : ''}" data-action="retaliate">Auto Retaliate<small>(${s.autoRetaliate ? 'On' : 'Off'})</small></button>`;
  }

  private renderItemSlot(slot: InventorySlot): string {
    if (!slot.item) return '<div class="item-slot"></div>';
    const icon = this.icons?.item(slot.item.id, this.scale !== 1);
    const body = icon ? `<img src="${icon}" alt="${escapeHtml(slot.item.name)}">` : `<span>${escapeHtml(slot.item.name)}</span>`;
    return `<button class="item-slot${slot.usable ? ' usable' : ''}" ${slot.usable ? `data-slot="${slot.slot}"` : ''} title="${escapeHtml(slot.item.name)}">${body}</button>`;
  }

  private renderEquipment(s: FrameSnapshot): string {
    const slots = WORN_LAYOUT.map(({ slot, col, row, empty }) => {
      const worn = s.worn[slot];
      const url = worn ? this.icons?.item(worn.itemId, this.scale !== 1) : this.icons?.sprite(empty);
      const body = url ? `<img src="${url}" alt="">` : worn ? `<span>${escapeHtml(worn.name)}</span>` : '';
      return `<div class="worn-slot${worn ? ' filled' : ''}" style="grid-column:${col + 1};grid-row:${row + 1}" title="${escapeHtml(worn?.name ?? slot)}">${body}</div>`;
    }).join('');
    const bonuses = s.bonuses.map((b) => `<div><span>${escapeHtml(b.name)}</span><b>${b.value >= 0 ? '+' : ''}${b.value}</b></div>`).join('');
    return `<div class="worn">${slots}</div><div class="bonuses">${bonuses}</div>`;
  }

  private renderPrayer(p: PrayerSlot): string {
    const sprites = (PRAYER_SPRITES as Record<string, readonly [number, number]>)[p.info.name];
    // A prayer that is merely out of points still shows its lit icon, as in the game.
    const unavailable = p.refusal === 'level' || p.refusal === 'locked';
    const url = sprites ? this.icons?.sprite(sprites[unavailable ? 1 : 0]) : null;
    const title = `${p.info.label} (level ${p.info.level})${p.refusal ? ` — ${REFUSAL_TEXT[p.refusal]}` : ''}`;
    const body = url ? `<img src="${url}" alt="">` : `<span>${escapeHtml(p.info.label)}</span>`;
    return `<button class="prayer${p.active ? ' active' : ''}${unavailable ? ' unavailable' : ''}" data-prayer="${p.info.name}" title="${escapeHtml(title)}">${body}</button>`;
  }
}
