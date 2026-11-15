import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { applyLight, floorHsl, jagexHslToRgb, packHsl } from '../scripts/assets/colour.ts';
import { ICON_HEIGHT, ICON_WIDTH, type IconItem, type IconModel, renderIcon } from '../scripts/assets/itemIcons.ts';
import { createPaletteCanvas, encodePng } from '../scripts/assets/png.ts';
import { BRUTUS_ASSETS, PRAYER_SPRITES } from '../src/assets.ts';
import { checkBundleOnDisk } from '../src/assetBundle/check.ts';
import { type AssetFile, type AssetManifest, MANIFEST_SCHEMA, checkBundle, spriteKey } from '../src/assetBundle/manifest.ts';
import { hashRequirements } from '../src/assetBundle/requirementsHash.ts';
import { BrutusIds } from '../src/content/brutus/BrutusConstants.ts';
import { workspacePath } from '../src/node/files.ts';
import { PRAYER_BOOK } from '../src/sdk/combat/PrayerBook.ts';

const file = (name: string): AssetFile => ({ file: name, bytes: 10, sha256: 'aa' });
const HASH = hashRequirements(BRUTUS_ASSETS);

/** A manifest that satisfies BRUTUS_ASSETS, with every file "on disk". */
function completeManifest(): AssetManifest {
  const clips = (ids: readonly number[]) => Object.fromEntries(ids.map((id) => [String(id), { frames: 1, seconds: 0.6 }]));
  return {
    schema: MANIFEST_SCHEMA,
    builtAt: '2026-11-15T00:00:00Z',
    requirementsHash: HASH,
    cache: { source: 'local', fingerprint: 'test' },
    reader: { repo: 'r', commit: 'c' },
    npcs: { [BrutusIds.NPC]: { ...file('models/npc.gltf'), name: 'Brutus', size: 3, widthScale: 128, heightScale: 128, idleSequence: 1, walkSequence: 2, clips: clips(Object.values(BRUTUS_ASSETS.npcs.brutus.animations)) } },
    player: { ...file('models/player.gltf'), clips: clips(Object.values(BRUTUS_ASSETS.player.animations)), worn: Object.fromEntries(Object.values(BRUTUS_ASSETS.player.worn).map((id) => [String(id), 'x'])) },
    terrain: { arena: file('terrain/arena.json') },
    textures: { 1: file('textures/1.png') },
    items: Object.fromEntries(Object.values(BRUTUS_ASSETS.items).map((id) => [String(id), { ...file(`item-icons/${id}.png`), name: 'x', hires: file(`item-icons/${id}@4x.png`) }])),
    sprites: Object.fromEntries(Object.values(BRUTUS_ASSETS.sprites).map((s) => [spriteKey(s), { ...file(`sprites/${spriteKey(s)}.png`), width: 1, height: 1 }])),
    sounds: Object.fromEntries(Object.values(BRUTUS_ASSETS.sounds).map((id) => [String(id), { ...file(`sounds/${id}.wav`), seconds: 1 }])),
  };
}
const onDisk = () => ({ bytes: 10, sha256: 'aa' });
const messages = (m: AssetManifest | null, stat: (f: string) => { bytes: number; sha256: string } | null = onDisk, hash = HASH): string[] =>
  checkBundle(BRUTUS_ASSETS, hash, m, stat).map((p) => p.message);

test('bundle check: a complete bundle passes; no bundle says how to make one', () => {
  assert.deepEqual(messages(completeManifest()), []);
  const none = checkBundle(BRUTUS_ASSETS, HASH, null, onDisk);
  assert.equal(none.length, 1);
  assert.match(none[0]!.message, /manifest\.json is missing/);
  assert.match(none[0]!.fix, /npm run assets/);
});

test('bundle check: each kind of missing asset is reported with its cache ID', () => {
  const noClip = completeManifest();
  delete noClip.npcs[BrutusIds.NPC]!.clips[BrutusIds.SEQ_CHARGE];
  assert.deepEqual(messages(noClip), [`Animation sequence ${BrutusIds.SEQ_CHARGE} (brutus.charge) is required but not in the bundle.`]);

  const noNpc = completeManifest();
  noNpc.npcs = {};
  assert.match(messages(noNpc)[0]!, /NPC model 15626 \(brutus\)/);

  const noSound = completeManifest();
  delete noSound.sounds[BrutusIds.SOUND_GROWL];
  assert.match(messages(noSound)[0]!, /Sound effect 11210 \(growl\)/);

  const noIcon = completeManifest();
  delete noIcon.items['385'];
  assert.match(messages(noIcon)[0]!, /Item icon 385 \(shark\)/);

  const noPlayer = completeManifest();
  noPlayer.player = null;
  assert.match(messages(noPlayer)[0]!, /Player model/);
});

test('bundle check: missing or altered files, an old schema and stale requirements all fail', () => {
  const m = completeManifest();
  assert.match(messages(m, (f) => (f === 'models/npc.gltf' ? null : onDisk()))[0]!, /models\/npc\.gltf is listed in the manifest but missing on disk/);
  assert.match(messages(m, (f) => (f === 'terrain/arena.json' ? { bytes: 9, sha256: 'aa' } : onDisk()))[0]!, /terrain\/arena\.json does not match the manifest/);
  assert.match(messages(m, (f) => (f === 'textures/1.png' ? null : onDisk()))[0]!, /Ground texture 1/);
  assert.match(messages({ ...m, schema: 0 })[0]!, /schema 0/);
  assert.deepEqual(messages(m, onDisk, 'different'), ['The asset requirements changed after the bundle was built.']);
});

test('requirements: every prayer in the book has icons, and the hash tracks the content', () => {
  for (const prayer of PRAYER_BOOK) assert.ok(prayer.name in PRAYER_SPRITES, `${prayer.name} has no sprite pair`);
  assert.equal(hashRequirements(BRUTUS_ASSETS), HASH);
  assert.notEqual(hashRequirements({ ...BRUTUS_ASSETS, sounds: {} }), HASH);
  assert.deepEqual(Object.values(BRUTUS_ASSETS.npcs.brutus.animations).sort(), [13778, 13783, 13784, 13785, 13790]);
});

test('png: files decode back to the pixels that were written', () => {
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 9, 8, 7, 6]);
  const png = encodePng(2, 2, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 2);
  const idat = png.subarray(png.indexOf('IDAT') + 4, png.indexOf('IEND') - 8);
  assert.deepEqual([...inflateSync(idat)], [0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
  assert.throws(() => encodePng(2, 2, new Uint8Array(3)));

  const canvas = createPaletteCanvas(8, 4);
  const ctx = canvas.getContext();
  ctx.fillStyle = 'rgba(10, 20, 30, 0.5)';
  ctx.fillRect(4, 0, 4, 4);
  assert.match(canvas.toDataURL(), /^data:image\/png;base64,/);
});

test('colour: Jagex HSL conversion and the floor-colour pipeline', () => {
  assert.equal(jagexHslToRgb(0), 1, 'black is nudged to 1 because 0 means transparent');
  const [r, g, b] = [16, 8, 0].map((shift) => (jagexHslToRgb((21 << 10) | (7 << 7) | 64, 1) >> shift) & 255);
  assert.ok(g! > r! && g! > b!, 'hue 21/64 is green');
  assert.equal(applyLight(100, 64) & 127, 50);
  assert.equal(applyLight(127, 127) & 127, 126, 'lightness is clamped to 126');

  const grass = floorHsl(0x35720a);
  assert.ok(grass.hueMultiplier > 1 && grass.hue <= grass.hueMultiplier);
  // Blending one colour with itself must give that colour's own hue back.
  assert.equal(Math.floor((grass.hue * 256) / grass.hueMultiplier) >> 2, grass.hue256 >> 2);
  assert.equal(packHsl(255, 255, 255) >> 7 & 7, 0, 'near-white is fully desaturated');
});

test('architecture: the client never imports the Node-side pipeline, and the frame only emits intents', () => {
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/from ['"][^'"]*(scripts\/|assetBundle\/check|requirementsHash|node:)/.test(readFileSync(path, 'utf8'))) offenders.push(path);
    }
  };
  walk(workspacePath('src/client'));
  assert.deepEqual(offenders, []);

  const frame = readFileSync(workspacePath('src/client/hud/GameFrame.ts'), 'utf8');
  const runtimeImports = [...frame.matchAll(/^import (?!type)[^;]*from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(runtimeImports, ['../../assets.ts'], 'the frame may import asset IDs, and types only from the engine and session');
});

test('bundle on disk: if public/osrs-assets exists it satisfies the requirements', { skip: !existsSync(workspacePath('public/osrs-assets/manifest.json')) }, () => {
  assert.deepEqual(checkBundleOnDisk(workspacePath('public/osrs-assets')), []);
});

const FRONT_ON: IconItem = { zoom2d: 512, xan2d: 0, yan2d: 0, zan2d: 0, xOffset2d: 0, yOffset2d: 0, ambient: 0, contrast: 0 };
/** Two flat squares facing the camera: `near` in front of `far`, each with its own colour and priority. */
function squares(priorities: [number, number] | null): IconModel {
  const quad = (z: number, half: number) => [[-half, -half, z], [half, -half, z], [half, half, z], [-half, half, z]];
  const v = [...quad(10, 6), ...quad(-10, 3)]; // far (bigger), then near (smaller); +z is away from the camera
  return {
    x: v.map((p) => p[0]!), y: v.map((p) => p[1]!), z: v.map((p) => p[2]!),
    a: [0, 0, 4, 4], b: [2, 3, 6, 7], c: [1, 2, 5, 6],
    colours: [960, 960, 22464, 22464],
    renderTypes: [1, 1, 1, 1],
    priorities: priorities ? [priorities[0], priorities[0], priorities[1], priorities[1]] : null,
  };
}
const pixel = (icon: { width: number; rgba: Uint8Array }, x: number, y: number): number => {
  const i = (y * icon.width + x) * 4;
  return icon.rgba[i + 3] === 0 ? 0 : (icon.rgba[i]! << 16) | (icon.rgba[i + 1]! << 8) | icon.rgba[i + 2]!;
};

test('item icons: nearer faces cover farther ones, with an outline and a shadow around the shape', () => {
  const icon = renderIcon(FRONT_ON, squares(null));
  assert.deepEqual([icon.width, icon.height], [ICON_WIDTH, ICON_HEIGHT]);
  const far = pixel(icon, 11, 16);
  const near = pixel(icon, 16, 16);
  assert.ok(far !== 0 && near !== 0 && far !== near, 'both squares are visible and the near one is on top in the middle');
  assert.equal(pixel(icon, 16, 22), far, 'the far square shows around the near one');
  const row = Array.from({ length: ICON_WIDTH }, (_, x) => pixel(icon, x, 16));
  const first = row.findIndex((p) => p !== 0);
  assert.equal(row[first], 1, 'the leftmost pixel of the shape is the outline colour');
  const below = Array.from({ length: ICON_HEIGHT }, (_, y) => pixel(icon, 20, y));
  assert.ok(below.includes(0x302020), 'a drop shadow falls to the lower right');
  assert.equal(pixel(icon, 0, 0), 0);
});

test('item icons: face priority overrides depth, as in the client', () => {
  // The far square is given the later priority, so it is drawn last and hides the near one.
  const icon = renderIcon(FRONT_ON, squares([5, 0]));
  assert.equal(pixel(icon, 16, 16), pixel(icon, 11, 16));
  const normal = renderIcon(FRONT_ON, squares([0, 5]));
  assert.notEqual(pixel(normal, 16, 16), pixel(normal, 11, 16));
});

test('item icons: the large render is the same picture with four times the detail', () => {
  const small = renderIcon(FRONT_ON, squares(null));
  const large = renderIcon(FRONT_ON, squares(null), 4);
  assert.deepEqual([large.width, large.height], [ICON_WIDTH * 4, ICON_HEIGHT * 4]);
  assert.equal(pixel(large, 64, 64), pixel(small, 16, 16));
  assert.equal(pixel(large, 46, 64), pixel(small, 11, 16));
  const opaque = (icon: { rgba: Uint8Array }): number => icon.rgba.filter((_, i) => i % 4 === 3 && icon.rgba[i] !== 0).length;
  const ratio = opaque(large) / opaque(small);
  // A little over 16×: whole-pixel rounding costs the small icon proportionally more of its edges.
  assert.ok(ratio > 14 && ratio < 22, `roughly 16× the pixels, got ${ratio.toFixed(1)}×`);
});
