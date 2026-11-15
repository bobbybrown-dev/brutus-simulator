import region12850 from '../../region_12850_collision.json';
import region12851 from '../../region_12851_collision.json';
import region13106 from '../../region_13106_collision.json';
import region13107 from '../../region_13107_collision.json';
import type { RegionCollisionJson } from '../sdk/Collision.ts';
import { TickClock } from '../sdk/TickClock.ts';
import { GameSession } from './GameSession.ts';
import { Hud } from './hud/Hud.ts';
import './style.css';
import { BrutusView } from './view/BrutusView.ts';
import { PlaceholderModelProvider } from './view/models.ts';

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const session = new GameSession({
  regionDumps: [region12851, region13107, region12850, region13106] as RegionCollisionJson[],
  seed: newSeed(),
});

// To use real models, swap in a GltfModelProvider with a manifest of exported files:
//   new GltfModelProvider({ npcs: { 15626: { url: 'models/brutus.glb', clips: { 13783: 'attack', … } } } })
const models = new PlaceholderModelProvider();

const clock = new TickClock(() => {
  const events = session.tick();
  view.onTick(events);
  hud.refresh();
});

const view = new BrutusView(document.getElementById('view')!, session, clock, models);
const hud = new Hud(document.getElementById('hud')!, session, {
  start: () => {
    session.start();
    hud.refresh();
  },
  reset: () => {
    session.reset(newSeed());
    view.reset();
    hud.refresh();
  },
  setProtectFromMelee: (on) => session.setProtectFromMelee(on),
  setAutoRetaliate: (on) => (session.autoRetaliate = on),
  setClickToMove: (on) => (view.clickToMove = on),
  setRun: (on) => (session.player.running = on),
  setDebug: (on) => (view.debugVisible = on),
});

clock.start();

// Handy from the browser console, and used by the screenshot script.
Object.assign(window, { brutus: { session, clock, view } });
