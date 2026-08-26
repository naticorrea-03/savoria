# Task 6 Report: Runtime Coordinator Split

## Status

Implementation complete from base commit `f3a627d`.

Fix round 1 is complete on top of extraction commit `d49f4f8a94b1fa579b3aa2cceb6954655d483e21`.

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

## Fix Round 1

### Reviewer findings resolved

- `stepPlayerMotion()` again auto-steps onto terrain lips above `-0.05` and at or below `0.55` while descending or grounded. These are the exact deleted-coordinator thresholds.
- Respawn now calls `InputState.clearTransient()`. It clears buffered jump intent while retaining physically held A, D, arrow, and Shift keys.
- Pause, resume, blur, and destruction still call `InputState.clear()`, which releases every held key and clears jump state.
- Checkpoint activation mutates the existing material color. It no longer allocates an unowned replacement material.
- Fix round 1 moved `updateBoss()` ahead of the bundled entity update. A scoped rereview found that this was not exact base parity because the bundle contained both pre-boss and post-boss work. Fix round 2 below resolves the exact order.

### Additional automated coverage

The terrain and held-input assertions were added before their production fixes.

Focused RED command:

```sh
node --test tests/unit/player-motion.test.js tests/unit/input-state.test.js
```

Result: 12 passed and 2 failed. The terrain test received `positionY: -0.008333333333333333` instead of `0.5`, and the input test reported that `clearTransient` did not exist.

Focused GREEN command:

```sh
node --test tests/unit/player-motion.test.js tests/unit/input-state.test.js
```

Result: 14 passed and 0 failed.

The final unit suite includes these new regressions:

- A moving grounded player crosses a half-unit rise, lands at `y = 0.5`, and retains horizontal velocity.
- Clearing transient input retains held D movement and removes the buffered jump.
- Checkpoint activation retains the exact material object, sets color `0xf2c14e`, and marks the checkpoint passed.
- Existing stale-preload progress coverage remains active.
- Existing fixed-step cap and render-count coverage remains active.

Final unit command:

```sh
npm run test:unit
```

Result: 31 passed and 0 failed.

### Fix-round browser evidence

A fresh real Chrome run used the local route at `http://127.0.0.1:8977/play/`.

- Level 1-1 walked from the `y = 0` platform onto the generated `y = 0.5` rise. Final state: `x = 19.395`, `y = 0.5`, grounded, with positive horizontal velocity.
- Level 1-2 walked from the `y = 0` platform onto its generated `y = 0.5` rise. Final state: `x = 18.1867`, `y = 0.5`, grounded, with positive horizontal velocity.
- D remained physically held during death. Immediately after respawn, input axis remained `1` and held keys still contained `KeyD`. Without another keydown, player X advanced from `2` to `4.975`.
- Level 1-2 checkpoint activation showed `Checkpoint! 🚩`. The material reference stayed identical and its color became `f2c14e`.
- Moving the player into the goal showed the visible `Course Clear!` overlay and set the session finished state.
- Replay created one canvas. Pause then restart retained one canvas. Pause then Level Select left zero canvases.
- `window.__game` and `window.__ui` remained absent. `window.__savoriaTest` exposed only `startLevel`, `showScreen`, `releasedLevels`, and `session`.
- Chrome warning and error logs after the run: `0`.

Temporary player positioning and keyboard-event dispatch were used inside this local browser session to isolate each gameplay scenario. These test setup changes were not written to source files.

### Fix-round self-review

- Compared the restored step-up branch to the deleted coordinator thresholds and order.
- Confirmed the pure motion regression fails without the branch.
- Confirmed full input clearing remains unchanged outside respawn.
- Confirmed checkpoint activation does not transfer or abandon material ownership.
- Confirmed the reviewer-requested boss-first call at that stage. A later exact base comparison invalidated that conclusion and led to fix round 2.
- Confirmed the browser restart and quit path destroys the prior canvas.
- Confirmed no dependency was installed and no external request was added.

### Fix-round concerns

No new blocking concern was found. Browser setup used the existing real Chrome control surface because local Playwright remains intentionally uninstalled until Task 9.

## Fix Round 2

### Exact runtime ordering

Base commit `f3a627d` runs these gameplay phases in order:

1. Coins, items, enemies, and projectiles.
2. Boss behavior.
3. Particles and decorative spins.

`updateEntities()` now accepts one `betweenPhases` callback. It runs the pre-boss entity and projectile work, invokes the callback, then runs particles and decor. `GameSession` supplies `updateBoss()` as that callback. Entity and boss modules remain independent from the DOM, and particle/projectile ownership remains in the entity module.

### Ordering regression evidence

The focused assertion was added before the phased callback.

RED command:

```sh
node --test tests/unit/entities.test.js
```

Result: 0 passed and 1 failed because the boss-phase observation was never invoked.

After the implementation, the test was mutation-checked against both incorrect placements:

- Callback before all entity work failed with projectile life `2` instead of `1.75`.
- Callback after particles failed with particle life `0.75` instead of `1`.

Restoring the callback between projectiles and particles produced 1 passed and 0 failed.

The final `npm run test:unit` run produced 32 passed and 0 failed. Syntax checks for the changed runtime and test files exited 0, and `git diff --check` reported no errors.

### Browser scope

No hidden-boss browser run was performed. Both released World 1 levels compile with `boss: null`, so no released browser path can exercise boss ordering. The deterministic unit test directly observes state at the phase boundary and was proven to fail for both wrong orders.
