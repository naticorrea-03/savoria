# Savoria Public World One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a polished desktop landing page and two-level World 1 while making Savoria safe and inviting for public contribution.

**Architecture:** Keep the deployed game as static HTML, CSS, JavaScript, and vendored Three.js. Extract pure level, save, input, motion, and timing logic first, then turn the existing `Game` class into a coordinator around focused modules. Keep released World 1 data separate from hidden experimental worlds.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js, Node.js built-in test runner, Playwright, Python static server, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-26-savoria-public-world-one-design.md`

## Global Constraints

- Runtime play requires no package install or compilation step.
- Desktop keyboard controls only. Small screens show a desktop-required message.
- Released controls are A/D or arrows, Shift to run, Space or Up to jump, and Escape to pause.
- Keep coyote time and jump buffering. Remove double jumping.
- Only World 1 appears in released progression.
- Worlds 2 through 6 remain in `js/experimental/`.
- Do not copy Nintendo artwork, audio, branding, characters, or level layouts.
- Do not make the GitHub repository public, enable Pages, or announce the game without Natalia's explicit final approval.
- Preserve the vendored Three.js license notice.
- Every task ends with tests and a focused commit.

## Target file map

### Site and shell

- `index.html`: public landing markup only.
- `play/index.html`: fullscreen game shell and overlays.
- `styles/tokens.css`: shared colors, spacing, type, and focus variables.
- `styles/landing.css`: landing layout and responsive desktop rules.
- `styles/game.css`: game menus, map, HUD, overlays, and small-screen block.
- `js/site.js`: landing interactions and reduced-motion behavior.
- `js/ui/main.js`: game screen routing and lifecycle.
- `js/ui/save-store.js`: save parsing, migration, and persistence.

### Game runtime

- `js/core/aabb.js`: collision box primitive.
- `js/core/fixed-step-loop.js`: fixed simulation and variable rendering.
- `js/core/texture-store.js`: preload, cache, tiled clones, and disposal.
- `js/core/world-builder.js`: scene construction from neutral level data.
- `js/core/chef-rig.js`: procedural chef model creation and animation handles.
- `js/core/game-session.js`: runtime coordinator and public session API.
- `js/audio/sfx.js`: synthesized sound effects.
- `js/gameplay/input-state.js`: keyboard state and command buffering.
- `js/gameplay/player-motion.js`: acceleration, running, jumping, and collision resolution.
- `js/gameplay/entities.js`: coins, items, enemies, hazards, projectiles, and particles.
- `js/gameplay/boss.js`: hidden experimental boss behavior.

### Levels

- `js/levels/themes.js`: released theme data.
- `js/levels/compiler.js`: segment DSL compiler.
- `js/levels/validate.js`: static level validation.
- `js/levels/world-one.js`: released World 1 metadata and two levels.
- `js/levels/index.js`: released registry exports.
- `js/experimental/worlds-2-6.js`: hidden level and theme definitions.

### Quality and community

- `package.json`, `package-lock.json`: development-only scripts and Playwright version.
- `tests/unit/*.test.js`: pure module tests.
- `tests/browser/savoria.spec.js`: desktop release flow.
- `playwright.config.js`: local browser test configuration.
- `.github/workflows/ci.yml`: unit and browser checks.
- `.github/workflows/pages.yml`: manual Pages artifact workflow only.
- `.github/pull_request_template.md`: contributor checklist.
- `README.md`: repository front page.
- `CONTRIBUTING.md`: Claude-ready level workflow.
- `LICENSE`: MIT code license.
- `ASSET-LICENSE.md`: CC BY-NC 4.0 asset notice and trademark reservation.
- `CREDITS.md`: original work and Three.js notice.

---

### Task 1: Add the test harness and modular level registry

**Files:**
- Create: `package.json`
- Create: `tests/unit/levels.test.js`
- Create: `js/levels/themes.js`
- Create: `js/levels/compiler.js`
- Create: `js/levels/validate.js`
- Create: `js/levels/world-one.js`
- Create: `js/levels/index.js`
- Create: `js/experimental/worlds-2-6.js`
- Modify: `js/levels.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `compileLevel(definition, theme) -> LevelData`
- Produces: `validateLevelDefinition(definition) -> string[]`
- Produces: `assertValidReleasedLevels(levels) -> void`
- Produces: `RELEASED_WORLDS`, `RELEASED_LEVELS`, `buildReleasedLevel(definition)`

- [ ] **Step 1: Add the development-only test scripts**

```json
{
  "name": "savoria",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit": "node --test tests/unit",
    "test:browser": "playwright test",
    "test": "npm run test:unit"
  },
  "devDependencies": {
    "@playwright/test": "1.55.0"
  }
}
```

Add `node_modules/`, `test-results/`, and `playwright-report/` to `.gitignore`.

- [ ] **Step 2: Write failing level registry tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASED_LEVELS, RELEASED_WORLDS, buildReleasedLevel } from '../../js/levels/index.js';
import { validateLevelDefinition } from '../../js/levels/validate.js';

test('release exposes only two World 1 levels', () => {
  assert.deepEqual(RELEASED_WORLDS.map((world) => world.n), [1]);
  assert.deepEqual(RELEASED_LEVELS.map((level) => level.id), ['1-1', '1-2']);
});

test('every released level validates and compiles to a goal', () => {
  for (const definition of RELEASED_LEVELS) {
    assert.deepEqual(validateLevelDefinition(definition), []);
    const level = buildReleasedLevel(definition);
    assert.ok(level.length > 40);
    assert.ok(level.goal);
    assert.ok(level.spawn);
  }
});
```

- [ ] **Step 3: Run the tests and confirm the missing-module failure**

Run: `npm run test:unit`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/levels/index.js`.

- [ ] **Step 4: Extract themes, the compiler, validation, and registries**

Move the current `THEMES` object into `themes.js`. Move `build()` and `buildLevel()` into `compiler.js`, renaming `build()` to `compileSegments()` and exporting this stable entry point:

```js
export function compileLevel(definition, theme) {
  const built = compileSegments({ ...definition, themeDeco0: theme.deco[0] });
  return {
    ...built,
    id: definition.id,
    world: definition.world,
    index: definition.idx,
    title: definition.name,
    displayName: `${definition.world}-${definition.idx} ${definition.name}`,
    theme,
  };
}
```

Implement strict released validation:

```js
const SEGMENTS = new Set(['run', 'gap', 'rise', 'steps', 'river', 'plats', 'roll', 'blocks', 'tier', 'pillars', 'bonus', 'checkpoint', 'goal', 'boss']);

export function validateLevelDefinition(definition) {
  const errors = [];
  if (!/^\d+-\d+$/.test(definition?.id ?? '')) errors.push('id must use world-level format');
  if (!Number.isInteger(definition?.world) || definition.world < 1) errors.push('world must be a positive integer');
  if (!Number.isInteger(definition?.idx) || definition.idx < 1) errors.push('idx must be a positive integer');
  if (!definition?.name?.trim()) errors.push('name is required');
  if (!definition?.theme) errors.push('theme is required');
  if (!Array.isArray(definition?.segs) || definition.segs.length === 0) errors.push('segs must be a non-empty array');
  for (const [index, segment] of (definition?.segs ?? []).entries()) {
    if (!Array.isArray(segment) || !SEGMENTS.has(segment[0])) errors.push(`segment ${index} has an unknown primitive`);
    if (typeof segment?.[1] !== 'number' || !Number.isFinite(segment[1])) errors.push(`segment ${index} needs a finite numeric size`);
  }
  if (!(definition?.segs ?? []).some(([kind]) => kind === 'goal' || kind === 'boss')) errors.push('level needs a goal or boss');
  return errors;
}

export function assertValidReleasedLevels(levels) {
  const ids = new Set();
  for (const level of levels) {
    const errors = validateLevelDefinition(level);
    if (ids.has(level.id)) errors.push(`duplicate id ${level.id}`);
    ids.add(level.id);
    if (errors.length) throw new Error(`${level.id || 'unknown'}: ${errors.join('; ')}`);
  }
}
```

Put only Pasta Plains and levels 1-1 and 1-2 in `world-one.js`. Put the remaining definitions in `experimental/worlds-2-6.js`. Make `js/levels.js` a temporary compatibility re-export so the current game remains runnable:

```js
export { RELEASED_LEVELS as LEVELS, RELEASED_WORLDS as WORLDS, buildReleasedLevel as buildLevel } from './levels/index.js';
```

- [ ] **Step 5: Run unit tests and launch the current game**

Run: `npm run test:unit`

Expected: PASS with two tests.

Run: `python3 serve.py`

Expected: title, chef selection, World 1 map, and level 1-1 still load at `http://127.0.0.1:8977/`.

- [ ] **Step 6: Commit the level boundary**

```bash
git add package.json .gitignore js/levels.js js/levels js/experimental tests/unit/levels.test.js
git commit -m "refactor: separate released level data"
```

### Task 2: Add versioned save parsing and progression tests

**Files:**
- Create: `js/ui/save-store.js`
- Create: `tests/unit/save-store.test.js`
- Modify: `js/main.js`

**Interfaces:**
- Produces: `createFreshSave() -> SaveData`
- Produces: `parseSave(raw) -> { save: SaveData, recovered: boolean }`
- Produces: `loadSave(storage) -> { save: SaveData, recovered: boolean }`
- Produces: `writeSave(storage, save) -> void`
- Produces: `recordCompletion(save, levelId, stars, nextUnlocked) -> SaveData`

- [ ] **Step 1: Write failing save tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshSave, parseSave, recordCompletion } from '../../js/ui/save-store.js';

test('invalid JSON becomes a recoverable fresh save', () => {
  const result = parseSave('{bad');
  assert.equal(result.recovered, true);
  assert.deepEqual(result.save, createFreshSave());
});

test('v2 progress migrates into the current schema', () => {
  const result = parseSave(JSON.stringify({ unlocked: 2, best: { '1-1': 3 } }));
  assert.equal(result.recovered, false);
  assert.equal(result.save.version, 3);
  assert.equal(result.save.unlocked, 2);
  assert.equal(result.save.best['1-1'], 3);
});

test('completion updates a copy and never unlocks past World 1', () => {
  const original = createFreshSave();
  const updated = recordCompletion(original, '1-1', 2, 2);
  assert.equal(updated.best['1-1'], 2);
  assert.equal(updated.unlocked, 2);
  assert.deepEqual(original, createFreshSave());
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `node --test tests/unit/save-store.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the save store**

```js
export const SAVE_KEY = 'savoria3d-save-v3';
const LEGACY_KEY = 'savoria3d-save-v2';
const MAX_RELEASED_LEVELS = 2;

export const createFreshSave = () => ({ version: 3, unlocked: 1, best: {}, chef: 'fatsio', sound: true });

export function parseSave(raw) {
  if (!raw) return { save: createFreshSave(), recovered: false };
  try {
    const value = JSON.parse(raw);
    const save = createFreshSave();
    save.unlocked = Math.min(MAX_RELEASED_LEVELS, Math.max(1, Number(value.unlocked) || 1));
    save.best = Object.fromEntries(Object.entries(value.best ?? {}).filter(([id, stars]) => /^1-[12]$/.test(id) && Number.isInteger(stars) && stars >= 0 && stars <= 3));
    save.chef = ['fatsio', 'dinnerette', 'chefno'].includes(value.chef) ? value.chef : save.chef;
    save.sound = value.sound !== false;
    return { save, recovered: false };
  } catch {
    return { save: createFreshSave(), recovered: true };
  }
}

export function loadSave(storage) {
  const current = storage.getItem(SAVE_KEY);
  if (current) return parseSave(current);
  return parseSave(storage.getItem(LEGACY_KEY));
}

export function writeSave(storage, save) {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function recordCompletion(save, levelId, stars, nextUnlocked) {
  return {
    ...save,
    unlocked: Math.min(MAX_RELEASED_LEVELS, Math.max(save.unlocked, nextUnlocked)),
    best: { ...save.best, [levelId]: Math.max(save.best[levelId] ?? 0, stars) },
  };
}
```

- [ ] **Step 4: Replace direct local storage access in `js/main.js`**

Import the new functions, show a one-time `Save repaired` HUD message when `recovered` is true, persist chef choice, and route completion through `recordCompletion()`.

```js
import { loadSave, writeSave, recordCompletion } from './ui/save-store.js';

const loaded = loadSave(localStorage);
let save = loaded.save;
// After HUD creation: if (loaded.recovered) hudMsg('Save repaired');
```

- [ ] **Step 5: Run tests and verify migration in the browser**

Run: `npm run test:unit`

Expected: PASS.

Browser check: seed `savoria3d-save-v2`, reload, and confirm level 1-2 remains unlocked.

- [ ] **Step 6: Commit the save boundary**

```bash
git add js/ui/save-store.js js/main.js tests/unit/save-store.test.js
git commit -m "refactor: version Savoria save data"
```

### Task 3: Lock the approved movement model with pure tests

**Files:**
- Create: `js/gameplay/input-state.js`
- Create: `js/gameplay/player-motion.js`
- Create: `js/core/aabb.js`
- Create: `js/core/fixed-step-loop.js`
- Create: `tests/unit/input-state.test.js`
- Create: `tests/unit/player-motion.test.js`
- Create: `tests/unit/fixed-step-loop.test.js`

**Interfaces:**
- Produces: `InputState.press(code)`, `release(code)`, `consumeJump()`, `axis`, `running`, `clear()`
- Produces: `createPlayerMotion(overrides) -> PlayerMotionState`
- Produces: `stepPlayerMotion(state, input, world, dt, config) -> PlayerMotionState`
- Produces: `FixedStepLoop.advance(frameSeconds, simulate, render) -> number`

- [ ] **Step 1: Write failing input and motion tests**

```js
const EMPTY_WORLD = { solids: [] };

test('jump input stays buffered for 130 milliseconds', () => {
  const input = new InputState();
  input.press('Space');
  input.tick(0.12);
  assert.equal(input.consumeJump(), true);
});

test('airborne players cannot jump twice', () => {
  const state = createPlayerMotion({ grounded: false, coyote: 0, velocityY: -2 });
  const next = stepPlayerMotion(state, { axis: 0, running: false, jumpPressed: true, jumpHeld: true }, EMPTY_WORLD, 1 / 60);
  assert.ok(next.velocityY <= 0);
});

test('Shift raises target speed without changing walk acceleration', () => {
  const walk = stepPlayerMotion(createPlayerMotion(), { axis: 1, running: false }, EMPTY_WORLD, 1 / 60);
  const run = stepPlayerMotion(createPlayerMotion(), { axis: 1, running: true }, EMPTY_WORLD, 1 / 60);
  assert.ok(run.targetSpeed > walk.targetSpeed);
  assert.equal(run.acceleration, walk.acceleration);
});
```

- [ ] **Step 2: Write the failing fixed-step test**

```js
test('a slow frame runs capped fixed simulations', () => {
  const loop = new FixedStepLoop({ step: 1 / 60, maxSteps: 5 });
  let simulations = 0;
  loop.advance(0.2, () => simulations++, () => {});
  assert.equal(simulations, 5);
});
```

- [ ] **Step 3: Run targeted tests and confirm failures**

Run: `node --test tests/unit/input-state.test.js tests/unit/player-motion.test.js tests/unit/fixed-step-loop.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement approved constants and single-jump logic**

```js
export const DEFAULT_MOTION = Object.freeze({
  walkSpeed: 7.2,
  runSpeed: 10.6,
  acceleration: 46,
  deceleration: 58,
  gravity: 30,
  jumpSpeed: 12.5,
  jumpCutSpeed: 6.5,
  coyoteSeconds: 0.12,
  jumpBufferSeconds: 0.13,
  maxFallSpeed: 26,
});
```

`stepPlayerMotion()` may consume a jump only when grounded or within coyote time. Releasing jump caps upward velocity at `jumpCutSpeed`. It must never track or grant an air jump.

Implement `FixedStepLoop` with a `1 / 60` second step, `5` maximum simulations per rendered frame, and discarded excess accumulator time after the cap.

- [ ] **Step 5: Run unit tests**

Run: `npm run test:unit`

Expected: PASS.

- [ ] **Step 6: Commit the movement contract**

```bash
git add js/core/aabb.js js/core/fixed-step-loop.js js/gameplay/input-state.js js/gameplay/player-motion.js tests/unit
git commit -m "test: define Savoria movement contract"
```

### Task 4: Replace unsafe texture cloning with explicit preloading

**Files:**
- Create: `js/core/texture-store.js`
- Create: `tests/unit/texture-store.test.js`
- Modify: `js/game.js`

**Interfaces:**
- Produces: `createTextureStore({ THREE, loader, baseUrl })`
- Produces: `preload(paths, onProgress) -> Promise<void>`
- Produces: `texture(path) -> THREE.Texture`
- Produces: `tiled(path, repeatX, repeatY, offsetX, offsetY) -> THREE.Texture`
- Produces: `dispose() -> void`

- [ ] **Step 1: Write a failing loader-order test with fake textures**

```js
const fakeThree = { SRGBColorSpace: 'srgb', RepeatWrapping: 'repeat' };

function fakeTexture() {
  return {
    needsUpdate: false,
    repeat: { set(x, y) { this.value = [x, y]; } },
    offset: { set(x, y) { this.value = [x, y]; } },
    clone() { return fakeTexture(); },
    dispose() {},
  };
}

function createDeferredLoader() {
  let finish;
  return {
    loader: { loadAsync: () => new Promise((resolve) => { finish = resolve; }) },
    resolve: () => finish(fakeTexture()),
  };
}

test('tiled clones are unavailable before preload completes', async () => {
  const deferred = createDeferredLoader();
  const store = createTextureStore({ THREE: fakeThree, loader: deferred.loader, baseUrl: '/assets/' });
  assert.throws(() => store.tiled('tile.png', 2, 1, 0, 0), /not preloaded/);
  const loading = store.preload(['tile.png']);
  deferred.resolve();
  await loading;
  assert.equal(store.tiled('tile.png', 2, 1, 0, 0).needsUpdate, true);
});
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `node --test tests/unit/texture-store.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement preload-first texture ownership**

```js
export function createTextureStore({ THREE, loader, baseUrl }) {
  const originals = new Map();
  const clones = new Set();

  async function preload(paths, onProgress = () => {}) {
    let loaded = 0;
    await Promise.all([...new Set(paths)].map(async (path) => {
      const texture = await loader.loadAsync(new URL(path, baseUrl).href);
      texture.colorSpace = THREE.SRGBColorSpace;
      originals.set(path, texture);
      onProgress(++loaded, paths.length);
    }));
  }

  function texture(path) {
    const value = originals.get(path);
    if (!value) throw new Error(`Texture not preloaded: ${path}`);
    return value;
  }

  function tiled(path, repeatX, repeatY, offsetX = 0, offsetY = 0) {
    const clone = texture(path).clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(Math.max(0.5, repeatX), Math.max(0.5, repeatY));
    clone.offset.set(offsetX % 1, offsetY % 1);
    clone.needsUpdate = true;
    clones.add(clone);
    return clone;
  }

  function dispose() {
    for (const value of clones) value.dispose();
    for (const value of originals.values()) value.dispose();
    clones.clear();
    originals.clear();
  }

  return { preload, texture, tiled, dispose };
}
```

- [ ] **Step 4: Integrate preloading before `Game` constructs scene materials**

Change level startup to await a manifest containing every released sprite and terrain texture. Remove `pendingClones`, `tiledTex()`, and direct `TextureLoader.load()` calls from `js/game.js`. Pass the loaded store into the session constructor.

```js
const textures = createTextureStore({ THREE, loader: new THREE.TextureLoader(), baseUrl: document.baseURI });
await textures.preload(WORLD_ONE_ASSETS, (loaded, total) => showLoadProgress(loaded / total));
game = new Game(app, level, { textures, charId: currentChar.id, hearts: 3, onEvent: onGameEvent });
```

- [ ] **Step 5: Verify tests and browser console**

Run: `npm run test:unit`

Expected: PASS.

Browser check: enter level 1-1 and confirm zero `Texture marked for update but no image data found` warnings.

- [ ] **Step 6: Commit the texture fix**

```bash
git add js/core/texture-store.js js/game.js js/main.js tests/unit/texture-store.test.js
git commit -m "fix: preload game textures before scene creation"
```

### Task 5: Build the public landing page and move the game shell

**Files:**
- Create: `styles/tokens.css`
- Create: `styles/landing.css`
- Create: `styles/game.css`
- Create: `js/site.js`
- Create: `play/index.html`
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `Play Savoria 3D.command`

**Interfaces:**
- Landing `a[data-play]` navigates to `play/`.
- Game shell retains stable IDs consumed by UI modules.
- Asset URLs resolve under both local root hosting and GitHub project Pages.

- [ ] **Step 1: Write the browser-test skeleton for the landing contract**

```js
test('landing page launches the game shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Savoria/i })).toBeVisible();
  await page.getByRole('link', { name: /Play Savoria/i }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await expect(page.getByRole('button', { name: /Start Adventure/i })).toBeVisible();
});
```

- [ ] **Step 2: Replace root `index.html` with semantic landing markup**

Use `header`, `main`, and `footer`. Required sections and anchors are `#hero`, `#world-one`, `#controls`, and `#contribute`. The main CTA is an anchor, so it works without JavaScript:

```html
<a class="button button-primary" data-play href="play/">Play Savoria</a>
```

Use the unchanged licensed logo file inside a polished dark framed plaque, plus the existing World 1 thumbnail. Do not add external fonts, analytics, CDNs, or requests.

- [ ] **Step 3: Move existing game markup into `play/index.html`**

Set `<base href="../">` so current asset and module paths remain stable. Rename the first game button to `Start Adventure`. Link `../styles/tokens.css` and `../styles/game.css`. Import `../js/ui/main.js` after Task 6, using the compatibility `../js/main.js` until then.

- [ ] **Step 4: Add desktop layout and small-screen blocking**

```css
@media (max-width: 899px), (max-height: 620px) {
  #app { display: none; }
  #desktop-required { display: grid; }
}

@media (min-width: 900px) and (min-height: 620px) {
  #desktop-required { display: none; }
}
```

Make the World 1 map fit a 1280 by 720 viewport without vertical scrolling. Keep visible focus rings and support `prefers-reduced-motion`.

- [x] **Step 5: Preserve and frame the logo asset**

Design amendment: three generated extraction attempts redrew the artwork. Keep `assets/sprites/savoria_logo.png` unchanged. Present the opaque licensed source inside an intentional dark framed plaque on landing, title, and desktop-blocker surfaces. Do not claim a transparent derivative was created.

- [ ] **Step 6: Update the launcher and verify both routes**

Keep the local server at port 8977 and open `http://localhost:8977/`. Verify the landing CTA reaches `/play/`.

- [ ] **Step 7: Commit the site shell**

```bash
git add index.html play/index.html styles js/site.js 'Play Savoria 3D.command' assets/sprites/savoria_logo.png tests/browser/savoria.spec.js
git commit -m "feat: add Savoria landing page"
```

### Task 6: Split the runtime coordinator without changing World 1 behavior

**Files:**
- Create: `js/audio/sfx.js`
- Create: `js/core/chef-rig.js`
- Create: `js/core/world-builder.js`
- Create: `js/gameplay/entities.js`
- Create: `js/gameplay/boss.js`
- Create: `js/core/game-session.js`
- Create: `js/ui/main.js`
- Modify: `play/index.html`
- Delete: `js/game.js`
- Delete: `js/main.js`

**Interfaces:**
- Consumes: level data from `buildReleasedLevel()`, `TextureStore`, `InputState`, `stepPlayerMotion()`, `FixedStepLoop`.
- Produces: `GameSession.start()`, `pause()`, `resume()`, `destroy()`.
- Produces: UI event callback `(type: string, data?: unknown) -> void`.

- [ ] **Step 1: Capture a behavior baseline**

Record current values in a test fixture: spawn position, initial hearts, initial timer, World 1 coin counts, level lengths, checkpoint positions, and goal positions. Add assertions to `tests/unit/levels.test.js` so extraction cannot silently change generated data.

```js
assert.deepEqual(snapshotLevel(RELEASED_LEVELS[0]), {
  id: '1-1',
  spawn: [2, 4, 0],
  checkpoint: [72.6, 0.7, 0],
  goal: [121.6, 1, 0],
  length: 126.6,
  coins: 39,
});

assert.deepEqual(snapshotLevel(RELEASED_LEVELS[1]), {
  id: '1-2',
  spawn: [2, 4, 0],
  checkpoint: [62, 3.5, 0],
  goal: [142.8, 3, 0],
  length: 147.8,
  coins: 29,
});
```

- [ ] **Step 2: Extract audio and chef rig code with named exports**

Move `Sfx` from current `js/game.js:16` into `js/audio/sfx.js`, export the class, and export one `sfx` instance. Move `CHEF_CONFIGS`, `limb()`, and `buildChef()` from current `js/game.js:286` into `js/core/chef-rig.js`. Move the chef animation block from `Game.update()` into `animateChefRig(rig, player, elapsed, dt, baseSpeed)`. Keep sound waveforms, character geometry, and animation constants unchanged during extraction.

- [ ] **Step 3: Extract world construction**

`buildWorldScene()` receives dependencies instead of reading globals:

```js
export function buildWorldScene({ THREE, scene, level, textures }) {
  return {
    solids,
    hazards,
    coins,
    items,
    enemies,
    doors,
    decoSpins,
    checkpointFlag,
    goalObject,
    bossState,
    dispose,
  };
}
```

Move decoration, terrain material, sprite, goal, and parallax builders into `world-builder.js`. `dispose()` must release geometries and materials created by this world.

- [ ] **Step 4: Extract entity and boss systems**

```js
export function updateEntities(context, dt) {
  updateCoins(context, dt);
  updateItems(context, dt);
  updateEnemies(context, dt);
  updateProjectiles(context, dt);
  updateParticles(context, dt);
}

export function updateBoss(context, dt) {
  if (!context.bossState) return;
  // Preserve current hidden experimental behavior.
}
```

Remove the duplicate projectile removal statements during extraction. Entity helpers may emit events through `context.emit` but may not read DOM elements.

- [ ] **Step 5: Create `GameSession` as the only runtime coordinator**

```js
export class GameSession {
  constructor({ container, level, characterId, textures, emit }) {
    this.container = container;
    this.level = level;
    this.emit = emit;
    this.textures = textures;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    container.appendChild(this.renderer.domElement);
    this.sceneState = buildWorldScene({ THREE, scene: this.scene, level, textures });
    this.input = new InputState();
    this.loop = new FixedStepLoop({ step: 1 / 60, maxSteps: 5 });
    this.running = false;
    this.destroyed = false;
    this.characterId = characterId;
    this.previousFrame = 0;
    this.raf = 0;
  }
  start() {
    this.running = true;
    this.previousFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  frame = (now) => {
    if (this.destroyed) return;
    const seconds = Math.min(0.1, (now - this.previousFrame) / 1000);
    this.previousFrame = now;
    this.loop.advance(seconds, (dt) => { if (this.running) this.simulate(dt); }, () => this.renderer.render(this.scene, this.camera));
    this.raf = requestAnimationFrame(this.frame);
  };
  pause() { this.running = false; this.input.clear(); }
  resume() { this.running = true; this.input.clear(); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pause();
    cancelAnimationFrame(this.raf);
    this.detachInput();
    this.sceneState.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    this.container.querySelector('canvas')?.remove();
    this.emit = () => {};
  }
}
```

The fixed-step simulation calls motion, hazards, entities, goals, and camera updates. The render callback draws the current scene once per animation frame.

- [ ] **Step 6: Move DOM routing into `js/ui/main.js`**

Update imports to `GameSession`, released levels, save store, texture store, and SFX. Expose only this test surface:

```js
window.__savoriaTest = {
  startLevel,
  showScreen,
  releasedLevels: RELEASED_LEVELS,
  get session() { return session; },
};
```

Remove `window.__game` and `window.__ui`.

- [ ] **Step 7: Run all unit tests and manual lifecycle loops**

Run: `npm run test:unit`

Expected: PASS.

Browser check: start, pause, resume, restart, quit, and start again ten times. Confirm one canvas remains and no WebGL context warnings appear.

- [ ] **Step 8: Commit the runtime split**

```bash
git add js play/index.html tests/unit
git commit -m "refactor: split Savoria runtime modules"
```

### Task 7: Rebuild World 1 around the approved movement

**Files:**
- Modify: `js/levels/world-one.js`
- Modify: `js/levels/compiler.js`
- Modify: `js/gameplay/player-motion.js`
- Modify: `js/core/game-session.js`
- Create: `tests/helpers/motion-simulation.js`
- Create: `tests/unit/world-one-simulation.test.js`

**Interfaces:**
- Consumes: fixed-step motion and compiled neutral level data.
- Produces: `measureJumpCapabilities(motion) -> { walk: number, run: number }`.
- Produces: `analyzeRequiredJumps(level, capabilities) -> { unreachable: RequiredJump[] }`.

- [ ] **Step 1: Write failing reachability and teaching-order tests**

```js
test('every World 1 required jump has a half-unit landing margin', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    const report = analyzeRequiredJumps(level, capabilities);
    assert.deepEqual(report.unreachable, []);
  }
});

test('Penne Ridge requires running only after the run tutorial marker', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const runTutorialX = level.tutorials.find((tutorial) => tutorial.id === 'run').x;
  const requiredRunJumps = level.requiredJumps.filter((jump) => jump.requiresRun);
  assert.ok(requiredRunJumps.length > 0);
  assert.ok(requiredRunJumps.every((jump) => jump.takeoffX > runTutorialX));
});
```

- [ ] **Step 2: Run tests and confirm the current recipes fail the new movement model**

Run: `node --test tests/unit/world-one-simulation.test.js`

Expected: FAIL because the current compiler does not emit `tutorials` or `requiredJumps`.

Implement `measureJumpCapabilities()` by stepping `stepPlayerMotion()` at 60 Hz on flat ground. Measure horizontal travel from takeoff until landing for walking and running. `analyzeRequiredJumps()` compares each authored jump distance against the matching capability minus a 0.5-unit safety margin.

- [ ] **Step 3: Rewrite level 1-1 as a teaching sequence**

Use safe ground before each new mechanic. Keep one enemy with a flat approach, gaps no wider than the tested walking jump, a checkpoint after the first combined sequence, and one final run-assisted jump only after an in-world run prompt.

The definition stays compact:

```js
level(1, 1, 'Farfalle Fields', 'pasta', 240, [
  ['run', 18, { coins: 5, tutorial: 'move' }],
  ['run', 14, { enemy: 'meatball', tutorial: 'stomp' }],
  ['gap', 3.5, { arc: 5 }],
  ['blocks', 3],
  ['checkpoint'],
  ['river', 9],
  ['run', 16, { tutorial: 'run', coins: 4 }],
  ['gap', 5, { arc: 5, requiresRun: true }],
  ['goal'],
]);
```

- [ ] **Step 4: Rewrite level 1-2 as the World 1 test**

Introduce moving platforms over safe ground before using them over sauce. Demonstrate tall terrain before the first timed run. Place the checkpoint before the longest combined sequence.

- [ ] **Step 5: Add in-world tutorial prompts**

Compile optional `tutorial` segment metadata into trigger positions. The session emits each tutorial once per course. Prompts use `Move`, `Jump`, `Hold Shift to run`, and `Stomp from above`.

- [ ] **Step 6: Run simulations and browser playtests**

Run: `npm run test:unit`

Expected: PASS.

Play both courses with walking, running, short jumps, long jumps, missed stomps, death, checkpoint respawn, and completion. Record any required jump that needs edge-perfect input and widen its margin.

- [ ] **Step 7: Commit World 1**

```bash
git add js/levels/world-one.js js/levels/compiler.js js/gameplay/player-motion.js js/core/game-session.js tests/helpers/motion-simulation.js tests/unit/world-one-simulation.test.js
git commit -m "feat: polish Pasta Plains progression"
```

### Task 8: Finish menus, HUD, accessibility, and recovery states

**Files:**
- Modify: `play/index.html`
- Modify: `styles/game.css`
- Modify: `js/ui/main.js`
- Modify: `js/core/texture-store.js`
- Create: `tests/unit/ui-state.test.js`

**Interfaces:**
- Produces: screen state values `title`, `characters`, `world`, `loading`, `playing`, `paused`, `complete`, `error`.
- Produces: one visible screen and one focused primary action after each transition.

- [ ] **Step 1: Write failing UI state tests**

```js
test('course completion unlocks 1-2 and returns to the World 1 map', () => {
  const next = reduceUiState(initialUiState(), { type: 'COURSE_COMPLETE', levelId: '1-1', stars: 2 });
  assert.equal(next.screen, 'complete');
  assert.equal(next.save.unlocked, 2);
});

test('asset failure enters a retryable error state', () => {
  const next = reduceUiState(initialUiState(), { type: 'LOAD_FAILED', asset: 'tile_top.png' });
  assert.deepEqual(next.error, { asset: 'tile_top.png', retryable: true });
});
```

- [ ] **Step 2: Implement pure UI state reduction and DOM rendering**

Keep state transitions in `reduceUiState(state, event)`. Keep DOM updates in `renderUi(state)`. Buttons dispatch events and never mutate progression directly.

- [ ] **Step 3: Simplify the HUD**

Keep World and course at top left, hearts and tomatoes together at top center, and timer at top right. Hide control help after the first movement input. Ensure HUD content does not overlap at 1280 by 720.

- [ ] **Step 4: Add loading, WebGL, asset failure, and save recovery states**

The loading panel shows `Loading World 1` plus percentage. Failed assets show the filename and Retry. WebGL failure shows supported desktop browser guidance. Save recovery shows once and does not block play.

- [ ] **Step 5: Add keyboard and reduced-motion accessibility**

Use real buttons and links. Add visible `:focus-visible` styles. Restore focus to the primary action after every screen change. Use `aria-live="polite"` for HUD messages. Disable nonessential CSS animation when `prefers-reduced-motion: reduce` matches.

- [ ] **Step 6: Verify supported layouts**

Check 1280 by 720, 1440 by 900, and 1920 by 1080. Check 390 by 844 displays only the desktop-required message.

- [ ] **Step 7: Commit the release UI**

```bash
git add play/index.html styles/game.css js/ui/main.js js/core/texture-store.js tests/unit/ui-state.test.js
git commit -m "feat: finish World 1 game interface"
```

### Task 9: Add browser automation and continuous integration

**Files:**
- Create: `playwright.config.js`
- Complete: `tests/browser/savoria.spec.js`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create: `package-lock.json`

**Interfaces:**
- Browser tests use only public UI, except deterministic level setup through `window.__savoriaTest`.
- CI runs unit tests before browser tests.

- [ ] **Step 1: Configure Playwright against the local server**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  use: { baseURL: 'http://127.0.0.1:8977', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'python3 serve.py', port: 8977, reuseExistingServer: !process.env.CI },
  reporter: process.env.CI ? 'github' : 'list',
});
```

- [ ] **Step 2: Write release-flow browser tests**

Cover landing, play launch, chef selection, only World 1 visible, 1-1 startup, pause, restart, save reload, small-screen block, and console cleanliness.

```js
const unexpected = [];
page.on('console', (message) => {
  if (['warning', 'error'].includes(message.type())) unexpected.push(message.text());
});
// At the end of each gameplay test:
expect(unexpected).toEqual([]);
```

- [ ] **Step 3: Install the pinned browser tool and run tests**

Run: `npm install`

Run: `npx playwright install chromium`

Run: `npm test && npm run test:browser`

Expected: all unit and browser tests PASS.

- [ ] **Step 4: Add CI**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - run: npm run test:browser
```

- [ ] **Step 5: Commit browser quality gates**

```bash
git add package.json package-lock.json playwright.config.js tests/browser .github/workflows/ci.yml
git commit -m "test: add Savoria browser quality gates"
```

### Task 10: Prepare the public repository and manual Pages workflow

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `LICENSE`
- Create: `ASSET-LICENSE.md`
- Create: `CREDITS.md`
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- README links to `/play/`, contribution guide, licenses, and credits.
- CONTRIBUTING points to `js/levels/world-one.js` and exact test commands.
- Pages workflow uses manual dispatch until final approval.

- [ ] **Step 1: Replace the player manual README with the repository story**

Use this order: game pitch, Play, why browser, how levels work, local setup, architecture, contribute, project status, licensing, credits. State that a level is data and include one short valid recipe.

- [ ] **Step 2: Write the Claude-ready contribution prompt**

Include a copyable prompt that tells Claude Code to read the DSL validator, edit one level definition, run unit tests, start the local server, and stop before committing if reachability tests fail. Include local commands:

```bash
python3 serve.py
npm install
npm test
npm run test:browser
```

- [ ] **Step 3: Add licenses and credits**

Use the exact OSI MIT text in `LICENSE` with `2026 Natalia Correa`. In `ASSET-LICENSE.md`, apply CC BY-NC 4.0 to original images and synthesized audio, link the legal deed, and state that Savoria naming and logo use is not granted. Preserve the vendored Three.js MIT notice in `CREDITS.md`.

- [ ] **Step 4: Add contribution templates**

The pull request checklist requires one scope sentence, test output, browser screenshot, DSL validation, and confirmation that no Nintendo content was copied.

- [ ] **Step 5: Add a manual-only Pages workflow**

```yaml
name: Prepare Pages artifact
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
```

Do not add a deploy job. Do not enable Pages. This workflow only proves that the static artifact packages successfully when manually requested.

- [ ] **Step 6: Verify documentation commands and links**

Run every documented local command. Click every local README and landing link. Confirm no instructions reference hidden worlds as released content.

- [ ] **Step 7: Commit public repository materials**

```bash
git add README.md CONTRIBUTING.md LICENSE ASSET-LICENSE.md CREDITS.md .github
git commit -m "docs: prepare Savoria for contributors"
```

### Task 11: Run final release verification

**Files:**
- Modify only files required by verified failures.
- Create: `docs/verification/2026-08-26-world-one.md`

**Interfaces:**
- Produces a dated verification record with commands, results, viewports, screenshots, and remaining release gates.

- [ ] **Step 1: Run static and automated checks**

Run:

```bash
git diff --check
npm test
npm run test:browser
```

Expected: all commands exit 0.

- [ ] **Step 2: Run manual gameplay coverage**

Complete both levels with each chef. Exercise walking, running, short jumping, full jumping, stomping, damage, death, checkpoint respawn, pause, restart, quit, unlock, replay, and save reload.

- [ ] **Step 3: Inspect visual output**

Capture and inspect screenshots for landing, title, character selection, World 1 map, level 1-1, level 1-2, pause, course complete, 1280 by 720, 1440 by 900, 1920 by 1080, and the 390 by 844 desktop-required state.

- [ ] **Step 4: Inspect runtime health**

Confirm no unexpected console warnings or errors, no failed network requests, one canvas after repeated restarts, stable frame pacing, and no input retained after focus loss.

- [ ] **Step 5: Write the verification record**

Record exact command output summaries, browser versions, tested viewport sizes, screenshot paths, known limitations, and these remaining approval gates:

- Repository visibility change.
- GitHub Pages enablement or deployment.
- Public announcement.

- [ ] **Step 6: Commit verified release state**

```bash
git add .
git commit -m "chore: verify Savoria World 1 release"
```

- [ ] **Step 7: Stop before public changes**

Show Natalia the local site, verification record, Git log, and clean status. Ask for explicit approval before changing repository visibility, enabling Pages, pushing, or announcing.
