# Task 6 Report: Runtime Coordinator Split

## Status

Implementation complete from base commit `f3a627d`.

Planned commit message:

```text
refactor: split Savoria runtime modules
```

## Files

Created:

- `js/audio/sfx.js`
- `js/core/chef-rig.js`
- `js/core/world-builder.js`
- `js/gameplay/entities.js`
- `js/gameplay/boss.js`
- `js/core/game-session.js`
- `js/ui/main.js`

Modified:

- `play/index.html`
- `tests/unit/levels.test.js`

Deleted:

- `js/game.js`
- `js/main.js`

No unrelated files were changed.

## Behavior Preservation

### Released scope

The UI now imports only `RELEASED_LEVELS`, `RELEASED_WORLDS`, and `buildReleasedLevel()` from the released registry.

The generated World 1 baseline is locked in `tests/unit/levels.test.js`:

- Level 1-1 spawn: `[2, 4, 0]`
- Level 1-1 checkpoint: `[72.6, 0.7, 0]`
- Level 1-1 goal: `[121.6, 1, 0]`
- Level 1-1 length: `126.6`
- Level 1-1 coins: `39`
- Level 1-1 initial timer: `260`
- Level 1-2 spawn: `[2, 4, 0]`
- Level 1-2 checkpoint: `[62, 3.5, 0]`
- Level 1-2 goal: `[142.8, 3, 0]`
- Level 1-2 length: `147.8`
- Level 1-2 coins: `29`
- Level 1-2 initial timer: `280`
- Initial hearts: `3`

The release still exposes exactly World 1 levels 1-1 and 1-2.

### Audio, geometry, and animation

- `Sfx` moved unchanged into `js/audio/sfx.js`.
- Every oscillator waveform, frequency, duration, volume, slide, and delay remains unchanged.
- Chef configuration values and geometry constructor arguments remain unchanged.
- The chef pose and animation constants moved into `animateChefRig()` unchanged.
- Terrain, decoration, parallax, sprite, checkpoint, goal, hazard, door, mover, and hidden boss construction values were retained during extraction.
- The duplicate projectile cleanup path was consolidated so each projectile is removed and disposed once.

### Fixed-step and input behavior

- `GameSession` owns one `FixedStepLoop`.
- Simulation runs at the approved `1 / 60` step with a five-step cap.
- Rendering runs once per animation frame.
- The coordinator uses `InputState` for held keys, jump buffering, Shift state, pause clears, and blur clears.
- Player simulation calls `stepPlayerMotion()` with the approved single-jump motion contract.
- Hazards, doors, checkpoints, goals, entities, boss behavior, chef animation, shadow placement, and camera updates run from the fixed simulation.

### Save and UI flow

- Save loading, repair messaging, chef persistence, completion scoring, unlocking, and save writes retained the existing save-store calls.
- Async texture preloads keep the active-start guard.
- Quitting invalidates any pending restart preload.
- DOM routing moved to `js/ui/main.js`.
- `play/index.html` loads `js/ui/main.js`.
- `window.__game` and `window.__ui` were removed.
- The only runtime test hook is `window.__savoriaTest` with `startLevel`, `showScreen`, `releasedLevels`, and the `session` getter.

### Texture and GPU ownership

- The UI creates one texture store per level start.
- `GameSession.destroy()` is idempotent.
- Destroy cancels animation, clears input, detaches listeners, disposes world geometry and materials, disposes remaining runtime objects, disposes the texture store, disposes the renderer, forces WebGL context loss, removes the owned canvas, and disables later event emission.
- World disposal includes its locally created background texture.
- Expired projectiles and particles dispose their geometry and material when removed.

## TDD Evidence

The World 1 baseline assertion was added before the approved coin value was restored.

Focused RED command:

```sh
node --test tests/unit/levels.test.js
```

Result: 2 passed and 1 failed. The failure showed actual `coins: 39` against the temporary expected `coins: 38`.

Focused GREEN command:

```sh
node --test tests/unit/levels.test.js
```

Result: 3 passed and 0 failed after restoring the approved 39-coin fixture.

The final baseline also imports `INITIAL_HEARTS` from `GameSession`, so a runtime heart-default change fails the same baseline test.

## Commands and Results

Baseline unit suite before extraction:

```sh
npm run test:unit
```

Result: 27 passed and 0 failed.

Generated data capture:

```sh
node --input-type=module -e "import {RELEASED_LEVELS,buildReleasedLevel} from './js/levels/index.js'; ..."
```

Result: confirmed the exact two-level values recorded above.

Module syntax checks:

```sh
node --check js/audio/sfx.js
node --check js/core/chef-rig.js
node --check js/core/world-builder.js
node --check js/gameplay/entities.js
node --check js/gameplay/boss.js
node --check js/core/game-session.js
node --check js/ui/main.js
```

Result: all exited 0.

Full unit suite after extraction:

```sh
npm run test:unit
```

Result: 28 passed and 0 failed.

Diff hygiene:

```sh
git diff --check
```

Result: exit code 0 with no whitespace errors.

## Browser Lifecycle Evidence

The app was served locally with:

```sh
python3 serve.py
```

The served route returned HTTP 200 at `http://127.0.0.1:8977/play/`.

A real Chrome session exercised the visible UI. No test-only DOM mutation was used.

Each of ten final loops performed:

1. Start level 1-1.
2. Pause with Escape.
3. Resume with the Resume button.
4. Pause again.
5. Restart with Restart Level.
6. Pause again.
7. Quit with Level Select.
8. Start level 1-1 again.

Canvas counts in all ten loops:

- Paused: `1`
- Resumed: `1`
- Restarted: `1`
- Quit: `0`
- Started again: `1`

Chrome warning and error logs after the final ten-loop pass: `0`.

No WebGL context warning appeared.

## Self-Review

- Confirmed every Task 6 runtime module has a single responsibility.
- Confirmed entity and boss systems do not read DOM elements.
- Confirmed `buildWorldScene()` receives `THREE`, `scene`, `level`, and `textures`.
- Confirmed `GameSession` is the only frame and simulation coordinator.
- Confirmed the fixed-step render callback renders once.
- Confirmed each destroy path is safe to call more than once.
- Confirmed rapid level starts retain the active-start guard.
- Confirmed quit invalidates a pending restart.
- Confirmed only the requested test hook remains.
- Confirmed no external URLs, dependencies, analytics, CDNs, or network requests were added.
- Confirmed no unrelated dirty worktree changes were overwritten.

## Concerns

There is no installed local Playwright package at this task boundary. That dependency belongs to Task 9. The attempted local import failed with `ERR_MODULE_NOT_FOUND`, so browser lifecycle verification used the available real Chrome browser against the local server instead. No dependency was installed.

No blocking implementation concerns remain.
