import region12850 from '../../region_12850_collision.json';
import region12851 from '../../region_12851_collision.json';
import region13106 from '../../region_13106_collision.json';
import region13107 from '../../region_13107_collision.json';
import type { RegionCollisionJson } from '../sdk/Collision.ts';
import { TickClock } from '../sdk/TickClock.ts';
import { GameSession } from './GameSession.ts';
import { CAPTURE_WORN } from '../content/loadouts/CaptureLoadout.ts';
import { GameFrame, type FrameSnapshot } from './hud/GameFrame.ts';
import { Hud } from './hud/Hud.ts';
import './style.css';
import { BrutusView } from './view/BrutusView.ts';
import { GltfModelProvider, PlaceholderModelProvider, cacheModelManifest } from './view/models.ts';
import { SpriteIds, HEAD_ICON_FRAMES } from '../assets.ts';
import { BrutusIds } from '../content/brutus/BrutusConstants.ts';
import { AssetBundle } from './assets/AssetBundle.ts';
import { SoundPlayer } from './audio/SoundPlayer.ts';

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const session = new GameSession({
  regionDumps: [region12851, region13107, region12850, region13106] as RegionCollisionJson[],
  seed: newSeed(),
});

// Cache assets come from osrs-assets/ next to the page (`npm run assets`). Without a bundle the
// client still runs, on placeholder boxes and a flat field.
const bundle = await AssetBundle.load();
const models = bundle ? new GltfModelProvider(cacheModelManifest(bundle, [BrutusIds.SEQ_DEATH])) : new PlaceholderModelProvider();
const terrain = bundle ? await bundle.terrain('arena') : null;
const sounds = new SoundPlayer(bundle);

const clock = new TickClock(() => {
  const events = session.tick();
  view!.onTick(events);
  refresh();
});

let view: BrutusView | null = null;

const STATUS = {
  idle: 'Click "Release Brutus" to begin. Click the ground to move and Brutus to attack; F1–F7 switch tabs.',
  fighting: 'Red tiles: stomp. Orange tiles: charge lane. The prayer orb toggles Protect from Melee.',
  dead: 'Oh dear, you are dead! Click Reset to try again.',
} as const;

const refresh = (): void => {
  frame.refresh();
  hud.refresh();
};

// The frame only sees a snapshot and only emits intents; everything it shows comes from the engine.
const snapshot = (): FrameSnapshot => {
  const { player } = session;
  const stats = session.stats;
  const { loadout } = player;
  const level = (name: string, stat: keyof typeof loadout.stats): { name: string; level: number; base: number } => {
    const base = loadout.stats[stat] ?? 1;
    return { name, level: base + (loadout.boosts?.[stat] ?? 0), base };
  };
  return {
    hitpoints: player.hitpoints,
    maxHitpoints: player.maxHitpoints,
    prayerPoints: stats.prayerPoints,
    maxPrayerPoints: stats.maxPrayerPoints,
    running: player.running,
    autoRetaliate: session.autoRetaliate,
    quickPrayersOn: session.protectFromMelee,
    prayers: session.prayerBook,
    inventory: session.inventory,
    worn: CAPTURE_WORN,
    weaponName: CAPTURE_WORN.weapon?.name ?? 'Unarmed',
    stance: stats.stance,
    stances: session.stances,
    levels: [level('Attack', 'attack'), level('Strength', 'strength'), level('Defence', 'defence'), level('Ranged', 'range'), level('Magic', 'magic'), level('Prayer', 'prayer'), { name: 'Hitpoints', level: player.hitpoints, base: player.maxHitpoints }],
    minimap: {
      player: player.location,
      npcs: session.boss && session.boss.spawnTick >= 0 && session.world.npcs.includes(session.boss) ? [{ ...session.boss.location, size: session.boss.size }] : [],
      isFloor: (x, y) => view?.isFloor(x, y) ?? false,
    },
    status: STATUS[stats.state],
    bonuses: [
      { name: 'Ranged attack', value: loadout.bonuses.attack.range },
      { name: 'Ranged str', value: loadout.bonuses.other.rangedStrength },
      { name: 'Def stab', value: loadout.bonuses.defence.stab },
      { name: 'Def slash', value: loadout.bonuses.defence.slash },
      { name: 'Def crush', value: loadout.bonuses.defence.crush },
      { name: 'Def magic', value: loadout.bonuses.defence.magic },
      { name: 'Def ranged', value: loadout.bonuses.defence.range },
      { name: 'Prayer', value: loadout.bonuses.other.prayer },
    ],
  };
};

const frame = new GameFrame(
  document.getElementById('stage')!,
  snapshot,
  {
    togglePrayer: (name) => void session.togglePrayer(name),
    toggleQuickPrayers: () => void session.togglePrayer('PROTECT_FROM_MELEE'),
    useItem: (slot) => void session.useItem(slot),
    setStance: (stance) => void session.setStance(stance),
    setAutoRetaliate: (on) => (session.autoRetaliate = on),
    setRun: (on) => (session.player.running = on),
  },
  bundle ? { item: (id, large) => bundle.itemIcon(id, large), sprite: (id, f) => bundle.sprite(id, f) } : null,
);


view = new BrutusView(frame.viewport, session, clock, models, {
  terrain,
  textureUrl: (id) => bundle?.texture(id) ?? null,
  protectMeleeIcon: bundle?.sprite(SpriteIds.headIconsPrayer, HEAD_ICON_FRAMES.PROTECT_FROM_MELEE) ?? null,
  playSound: (id) => sounds.play(id),
});
view.debugVisible = false;

frame.onScale = (scale) => view!.setPixelScale(scale);
view.setPixelScale(frame.scale);

const hud = new Hud(
  frame.chat,
  session,
  {
    start: () => {
      session.start();
      refresh();
    },
    reset: () => {
      session.reset(newSeed());
      view!.reset();
      refresh();
    },
    setClickToMove: (on) => (view!.clickToMove = on),
    setSound: (on) => (sounds.enabled = on),
    setDebug: (on) => (view!.debugVisible = on),
    setPixelPerfect: (on) => {
      frame.pixelPerfect = on;
      frame.fit();
    },
  },
  bundle
    ? `Cache assets loaded (built ${bundle.manifest.builtAt.slice(0, 10)}). All RuneScape assets are property of Jagex.`
    : 'No cache assets found: showing placeholders. Run "npm run assets" and reload.',
);

clock.start();

// Handy from the browser console, and used by the screenshot script.
Object.assign(window, { brutus: { session, clock, view, bundle, sounds, frame, refresh } });
