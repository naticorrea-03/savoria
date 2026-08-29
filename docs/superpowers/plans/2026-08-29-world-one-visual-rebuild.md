# Savoria World 1 Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Savoria World 1 with purpose-made pasta visuals, readable side-view terrain, layered backgrounds, and one coherent interface while preserving gameplay behavior.

**Architecture:** A pure visual manifest owns local asset paths and presentation metadata. The existing renderer consumes that manifest without changing the level DSL or collision coordinates. Existing UI state and action IDs remain stable while CSS and contained markup adopt the approved system.

**Tech Stack:** Vanilla JavaScript, Three.js, HTML, CSS, Node test runner, Playwright

**Spec:** `docs/superpowers/specs/2026-08-29-world-one-visual-rebuild-design.md`

## Global Constraints

- Desktop browser only.
- Preserve the current level DSL and all collision coordinates.
- Keep static selection portraits and animated gameplay run sheets.
- Keep all assets local and make no production network requests.
- Do not use Nintendo artwork, characters, or logos.
- Remove World 1 windmills, villas, algorithmic trees, and random mushrooms.
- Do not add character-specific abilities.
- Stop for visual approval after the first playable course.

---

### Task 1: World 1 Visual Manifest

**Files:**
- Create: `js/visuals/world-one-manifest.js`
- Create: `tests/unit/world-one-visuals.test.js`
- Modify: `js/levels/themes.js`

**Interfaces:**
- Produces: `WORLD_ONE_VISUALS`, a frozen manifest object.
- Produces: `collectWorldOneAssets(manifest): string[]`.
- Produces: `terrainVisualFor(kind, manifest): object`.
- Produces: `decorationSlotsFor(box, manifest): object[]`.

- [ ] **Step 1: Write the failing manifest tests**

```js
test('World 1 manifest exposes three ordered depth layers', () => {
  assert.deepEqual(WORLD_ONE_VISUALS.backgrounds.map(({ id }) => id), ['far', 'middle', 'near']);
});

test('terrain kinds resolve without atlas paths', () => {
  for (const kind of ['ground', 'ground2', 'plat', 'brick', 'pillar']) {
    const visual = terrainVisualFor(kind);
    assert.ok(visual.cap || visual.face);
    assert.equal(Object.values(visual).some((value) => String(value).includes('tile_')), false);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/unit/world-one-visuals.test.js`

Expected: failure because `world-one-manifest.js` does not exist.

- [ ] **Step 3: Implement the frozen manifest and pure helpers**

```js
export const WORLD_ONE_VISUALS = Object.freeze({
  id: 'pasta-plains',
  backgrounds: [
    { id: 'far', path: 'assets/world1/background-far.png', z: -56, height: 30, parallax: 0.08 },
    { id: 'middle', path: 'assets/world1/background-middle.png', z: -34, height: 24, parallax: 0.16 },
    { id: 'near', path: 'assets/world1/background-near.png', z: -18, height: 18, parallax: 0.28 },
  ],
  terrain: {
    ground: { cap: 'assets/world1/ground-cap.png', face: 'assets/world1/ground-face.png' },
    ground2: { cap: 'assets/world1/ground-cap.png', face: 'assets/world1/ground-face.png', tint: 0xe4b64f },
    plat: { cap: 'assets/world1/ravioli-platform.png', face: 'assets/world1/ravioli-platform.png' },
    brick: { cap: 'assets/world1/ravioli-platform.png', face: 'assets/world1/ravioli-platform.png' },
    pillar: { face: 'assets/world1/penne-pillar.png' },
  },
  hazard: { surface: 'assets/world1/marinara-surface.png' },
  props: [{ id: 'basil', path: 'assets/world1/basil-prop.png', width: 1.2, height: 1.2 }],
});
```

- [ ] **Step 4: Extend the pasta theme with `visuals: WORLD_ONE_VISUALS`**

Import the manifest into `js/levels/themes.js`. Remove `deco` and `skyline` from the pasta theme. Keep other themes unchanged.

- [ ] **Step 5: Run focused and full unit tests**

Run: `node --test tests/unit/world-one-visuals.test.js && npm test`

Expected: all tests pass.

### Task 2: Modular World 1 Asset Kit

**Files:**
- Create: `assets/world1/background-far.png`
- Create: `assets/world1/background-middle.png`
- Create: `assets/world1/background-near.png`
- Create: `assets/world1/ground-cap.png`
- Create: `assets/world1/ground-face.png`
- Create: `assets/world1/ravioli-platform.png`
- Create: `assets/world1/penne-pillar.png`
- Create: `assets/world1/marinara-surface.png`
- Create: `assets/world1/basil-prop.png`
- Modify: `ASSET-LICENSE.md`

**Interfaces:**
- Consumes: exact paths from `WORLD_ONE_VISUALS`.
- Produces: local PNG assets with transparency where the manifest requires sprites.

- [ ] **Step 1: Generate each distinct asset with `world1_thumb.png` as the art reference**

Require a side-view orthographic composition, clean edges, no text, no labels, no swatches, no windmills, no villas, no random mushrooms, and no copyrighted game artwork.

- [ ] **Step 2: Inspect transparency and dimensions**

Run: `sips -g pixelWidth -g pixelHeight -g hasAlpha assets/world1/*.png`

Expected: every file exists, sprite assets report alpha, and background layers share one aspect ratio.

- [ ] **Step 3: Verify every manifest path loads locally**

Run a Node or Playwright request check against `http://127.0.0.1:8977/`.

Expected: every asset returns HTTP 200.

- [ ] **Step 4: Record generation and license provenance**

Add an `assets/world1/` entry to `ASSET-LICENSE.md` stating that the stills were generated for Savoria using `world1_thumb.png` as an internal art-direction reference.

### Task 3: Layered Background Renderer

**Files:**
- Modify: `js/core/world-builder.js`
- Modify: `js/core/game-session.js`
- Create: `tests/unit/world-one-rendering.test.js`

**Interfaces:**
- Consumes: `WORLD_ONE_VISUALS.backgrounds`.
- Produces: `sceneState.updateBackground(cameraX, cameraY): void`.

- [ ] **Step 1: Write failing pure placement tests**

```js
test('background layers follow camera with increasing parallax', () => {
  assert.deepEqual(backgroundLayerX(100, WORLD_ONE_VISUALS.backgrounds), [8, 16, 28]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/unit/world-one-rendering.test.js`

- [ ] **Step 3: Replace procedural World 1 scenery with three textured planes**

Create two copies per layer. Each copy spans the camera view and overlaps its neighbor by a small amount. Set `depthWrite: false`, keep the far layer least saturated, and reserve z positions from the manifest.

- [ ] **Step 4: Return and call the background updater**

Add `updateBackground` to `buildWorldScene()` output. Call it from `GameSession.updateCamera()` after camera position changes.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/unit/world-one-rendering.test.js && npm test`

### Task 4: Purpose-Made Terrain Rendering

**Files:**
- Modify: `js/core/world-builder.js`
- Modify: `tests/unit/world-one-rendering.test.js`

**Interfaces:**
- Consumes: `terrainVisualFor(kind)` and the unchanged compiled level boxes.
- Produces: one collision mesh plus presentation children for each authored box.

- [ ] **Step 1: Add failing tests for atlas removal and controlled decoration**

```js
test('World 1 production assets contain no legacy atlas terrain', () => {
  assert.equal(WORLD_ONE_ASSETS.some((path) => /tile_|ground_(top|fill)/.test(path)), false);
});

test('narrow or hazardous surfaces receive no props', () => {
  assert.deepEqual(decorationSlotsFor({ kind: 'ground', width: 7, top: 2 }), []);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/unit/world-one-rendering.test.js`

- [ ] **Step 3: Remove legacy `TILES`, repeated atlas maps, and `dress()` drips**

Use a plain hidden collision mesh if needed. Add a front plane and cap plane that scale to the exact box width and height. Preserve each existing `AABB(x, y, z, w, h, d)`.

- [ ] **Step 4: Replace automatic decoration cycles with manifest slots**

Place no prop on boxes narrower than eight units. Keep props behind the playable plane and at least two units from a box edge.

- [ ] **Step 5: Use the new marinara surface and existing transparent gameplay sprites**

Keep hazard `AABB` values unchanged. Keep enemy, item, tomato, signpost, checkpoint, and goal behavior unchanged.

- [ ] **Step 6: Run all unit tests**

Run: `npm test`

### Task 5: Approved Interface System

**Files:**
- Modify: `play/index.html`
- Modify: `styles/game.css`
- Modify: `js/ui/ui-state.js`
- Modify: `tests/unit/ui-state.test.js`
- Modify: `tests/browser/savoria.spec.js`

**Interfaces:**
- Consumes: existing reducer state and `data-action` values.
- Produces: unchanged state transitions with approved visual composition.

- [ ] **Step 1: Add browser assertions for the new hierarchy**

Assert one primary Play button, three static character images, the shared-moves note, two World 1 nodes, corner-confined HUD, and visible focus on each interactive screen.

- [ ] **Step 2: Run the focused browser test and confirm it fails**

Run: `npm run test:browser -- --grep "landing reaches"`

- [ ] **Step 3: Update contained markup without changing action IDs**

Use the approved copy: `Play`, `Who is cooking?`, and `Every chef shares the same moves. Pick your favorite.` Keep screen roots and dialog roles stable.

- [ ] **Step 4: Replace `styles/game.css` presentation with approved tokens**

Match the three mockups. Keep focus outlines at least three pixels, preserve the desktop blocker, and respect reduced motion.

- [ ] **Step 5: Run unit and browser tests**

Run: `npm test && npm run test:browser`

### Task 6: First Playable Course Checkpoint

**Files:**
- Create: `docs/verification/2026-08-29-world-one-visual-checkpoint.md`
- Create: `docs/verification/screenshots/2026-08-29-1-1-1280x720.png`
- Create: `docs/verification/screenshots/2026-08-29-1-1-1440x900.png`
- Create: `docs/verification/screenshots/2026-08-29-1-1-1920x1080.png`

**Interfaces:**
- Consumes: production UI and course 1-1.
- Produces: the required second visual approval artifact.

- [ ] **Step 1: Run unit, browser, and whitespace checks**

Run: `npm test && npm run test:browser && git diff --check`

- [ ] **Step 2: Capture the full journey and three gameplay sizes**

Open title, selection, map, 1-1, pause, completion, and resumed save state. Capture 1-1 at all required viewports.

- [ ] **Step 3: Inspect diagnostics and visual constraints**

Record console errors, failed requests, external requests, overflow, seams, collision alignment, obstruction, static card images, and animated gameplay sprites.

- [ ] **Step 4: Complete 1-1 through production state**

Use the production session test hook only to reach the authored goal. Confirm completion unlocks 1-2 and persists after reload.

- [ ] **Step 5: Stop for visual approval**

Present the three screenshots and the exact verified layer. Do not finalize the remaining World 1 presentation before approval.

### Task 7: World 1 Completion After Approval

**Files:**
- Modify only files identified by checkpoint feedback.
- Update: `docs/verification/2026-08-29-world-one-visual-checkpoint.md`

**Interfaces:**
- Consumes: approved first-playable rendering system.
- Produces: the finished two-course World 1 journey.

- [ ] **Step 1: Apply checkpoint feedback without changing physics or the DSL**
- [ ] **Step 2: Verify 1-2, pause, completion, save, and resume**
- [ ] **Step 3: Run `npm test`, `npm run test:browser`, and `git diff --check`**
- [ ] **Step 4: Capture final 1280×720, 1440×900, and 1920×1080 evidence**
- [ ] **Step 5: Commit only the approved implementation files**
