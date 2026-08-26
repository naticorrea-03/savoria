# Savoria Public World One Design

Date: 2026-08-26
Status: Approved in conversation

## Objective

Turn the current Savoria browser prototype into a polished, desktop-first community game. The first public release will include a project landing page, a complete two-level World 1, a maintainable vanilla JavaScript architecture, automated checks, and contribution documentation.

The release will preserve Savoria's identity and compact level DSL. It will use familiar platformer conventions without copying Nintendo artwork, audio, branding, characters, or level layouts.

## Release scope

The first public release includes:

- A public-facing landing page at `/`.
- A fullscreen game experience at `/play/`.
- Three selectable chefs.
- World 1, Pasta Plains.
- Level 1-1, Farfalle Fields.
- Level 1-2, Penne Ridge.
- Local progress saving.
- Desktop keyboard controls.
- A contributor workflow centered on the level DSL.
- Static hosting through GitHub Pages.

Worlds 2 through 6 remain in the repository as experimental data. They will not appear in the released game until each world meets the World 1 quality bar.

Mobile gameplay is outside this release. Small screens will receive a clear desktop-required message instead of touch controls.

## Experience design

### Landing page

The landing page introduces the game before launching it. It includes:

- The licensed Savoria source logo, unchanged, inside a polished dark framed plaque.
- A concise game description.
- A prominent Play button.
- A short World 1 preview.
- Keyboard controls.
- A contribution section focused on adding levels through the DSL.
- Links to GitHub, credits, licensing, and local setup.

The page will use the existing Savoria visual language. It must load quickly, work without a framework, and remain legible across supported desktop sizes.

### Game flow

The released flow is:

1. Launch the game from the landing page.
2. Start or continue a saved game.
3. Choose Fatsio, Dinnerette, or Chefno.
4. Enter the Pasta Plains map.
5. Play Farfalle Fields.
6. Unlock and play Penne Ridge.
7. Return to the World 1 map after completion.

Hidden worlds will not appear as locked rows. The released map communicates a complete World 1 experience without advertising unfinished content.

### Controls and movement

Desktop controls are:

- Left Arrow or A: move left.
- Right Arrow or D: move right.
- Shift: run.
- Space or Up Arrow: jump.
- Escape: pause.

Movement will use acceleration, deceleration, and a distinct running speed. Jump height depends on button hold duration. Coyote time and jump buffering remain. Double jumping is removed.

Enemy stomps produce a reliable rebound. Camera movement uses gentle lookahead and avoids sudden vertical movement. Input, physics, and camera behavior must remain stable under slower frame rates.

### Level pacing

Farfalle Fields teaches one idea at a time:

- Walking and running.
- Variable-height jumps.
- Tomato collection.
- A safe enemy stomp.
- Short gaps.
- A checkpoint.
- A final combined sequence.

Penne Ridge tests those mechanics with denser combinations. It introduces moving platforms, taller terrain, and longer hazard sequences after safe demonstrations.

Every required jump must be reachable through normal movement. Blind jumps and unavoidable damage are not allowed.

## Technical architecture

The game remains static vanilla JavaScript with vendored Three.js. Runtime play requires no package install or compilation step.

Development tools may use a `package.json` for tests and checks. The production site remains plain HTML, CSS, JavaScript, and assets.

### File boundaries

- `index.html`: landing page markup.
- `styles/`: landing, game shell, HUD, and responsive styles.
- `play/index.html`: fullscreen game shell.
- `js/core/`: loop, renderer, asset loading, input, camera, and shared utilities.
- `js/gameplay/`: player, collisions, enemies, items, checkpoints, and goals.
- `js/audio/`: synthesized sound effects and audio preferences.
- `js/levels/`: DSL compiler, themes, World 1 definitions, and validation.
- `js/experimental/`: hidden Worlds 2 through 6.
- `js/ui/`: menus, HUD, saves, progression, and screen routing.
- `tests/`: unit, simulation, and browser tests.

Each module will expose a small documented interface. Rendering code will not own progression state. UI code will not implement physics. Level data will not create Three.js objects directly.

### Level data flow

Level definitions pass through this sequence:

1. A contributor writes a compact segment recipe.
2. The validator checks identifiers, segment names, option shapes, progression rules, and basic geometry constraints.
3. The compiler converts segments into neutral level data.
4. The game runtime converts neutral data into rendered objects and collision bodies.
5. Automated simulations check required jump paths and completion reachability.

Released and experimental level registries remain separate. Only released levels enter progression and the public map.

### Runtime lifecycle

The game shell owns screen routing and creates one game session at a time. A game session owns its renderer, animation loop, input subscriptions, and scene resources. Destroying a session removes listeners, cancels animation, disposes resources, and prevents delayed callbacks from updating the UI.

Physics will use a fixed simulation step with a capped catch-up budget. Rendering may remain variable-rate. This makes movement and automated simulations deterministic enough for regression testing.

### Saves

Save data receives an explicit schema version. Loading will validate and normalize every field. Invalid data falls back to a fresh save without crashing. Existing `savoria3d-save-v2` progress will be migrated when possible.

The save contains only player preferences and progression. Level definitions and runtime objects never enter local storage.

## Error handling

The game preloads all required World 1 assets before play begins. The loading screen reports progress.

Failures receive visible recovery paths:

- Missing WebGL support shows a compatibility message.
- Failed required assets show the failed filename and a Retry button.
- Invalid released level data blocks launch with a readable validation error.
- Corrupted saves reset safely and show a short notice.
- Lost browser focus clears held input and pauses active play.

Browser console warnings from Savoria code or assets count as test failures. Known browser-tool or extension messages may be filtered only by exact documented signatures.

## Testing and verification

### Unit tests

Unit tests cover:

- DSL segment validation.
- Level compilation.
- Save parsing and migration.
- Input state transitions.
- Movement acceleration and deceleration.
- Variable-height jumping.
- Coyote time and jump buffering.
- Collision and stomp classification.
- World 1 unlock progression.

### Simulation tests

Deterministic simulation tests cover representative World 1 jumps, moving-platform landings, checkpoint respawns, hazards, and both course goals.

### Browser tests

Desktop browser tests cover:

- Landing page rendering.
- Play launch.
- Chef selection.
- World 1 map rendering.
- Level 1-1 startup.
- Pause, restart, and quit.
- Save persistence across reloads.
- No unexpected console errors or warnings.
- Supported desktop viewport layouts.
- Desktop-required messaging on small screens.

Final visual verification requires screenshots of the landing page, game menus, both World 1 levels, pause state, and course completion.

## Contribution experience

The repository front page explains why the Godot attempt stalled and why the browser DSL unlocked contribution.

`CONTRIBUTING.md` will include:

- A copyable Claude Code prompt.
- The exact file a contributor should edit.
- Supported DSL primitives and examples.
- Local play commands.
- Test commands.
- A level quality checklist.
- Pull request expectations.

The contribution flow will not require contributors to understand Three.js internals. Adding a normal level should involve level data, playtesting, and tests.

GitHub will include a pull request template and automated checks. A failed check must explain the contributor's next action.

## Licensing

- Original source code uses the MIT License.
- Original artwork and audio use Creative Commons Attribution-NonCommercial 4.0 International.
- The Savoria name and logo remain reserved. The asset license grants no trademark rights.
- Vendored Three.js retains its existing MIT notice.
- Third-party contributions are accepted under the license covering their contribution type.

This licensing structure is a practical project decision, not legal advice.

## Hosting and release gates

GitHub Pages will host the static landing page and game. A deployment workflow may be added while the repository remains private.

The following actions require Natalia's explicit final approval:

- Changing the GitHub repository from private to public.
- Enabling or publishing the GitHub Pages site.
- Posting or announcing the game.

Local implementation, tests, documentation, commits, and a release-ready Git state are authorized by the approved design.

## Completion criteria

The implementation is ready for final release review when:

- The landing page and `/play/` flow work at supported desktop sizes.
- Only World 1 appears in the released game.
- Both World 1 levels are completable through normal play.
- Movement matches the approved single-jump and hold-to-run design.
- The repeated texture warnings and map overflow are fixed. The opaque licensed logo is intentionally contained inside a dark framed plaque.
- Automated tests pass.
- Browser verification produces no unexpected warnings or errors.
- README, CONTRIBUTING, licenses, credits, and GitHub templates are present.
- A GitHub Pages deployment is configured but remains unpublished.
- The repository remains private pending final approval.

### Logo design amendment

The original transparency requirement is withdrawn. Three generated extraction attempts redrew the licensed artwork instead of preserving its pixels. The source file at `assets/sprites/savoria_logo.png` therefore remains unchanged. Landing and game surfaces present it inside an intentional dark framed plaque. A transparent derivative is not part of this release.
