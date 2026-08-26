# Task 8 report: World 1 interface and recovery states

Date: 2026-08-26
Status: Implemented with documented browser verification gaps

## Outcome

- Added a pure UI reducer for `title`, `characters`, `world`, `loading`, `playing`, `paused`, `complete`, and `error`.
- Kept runtime effects in the browser coordinator and progression in the reducer.
- Replaced clickable character cards with real buttons.
- Reduced the HUD to the approved three top zones.
- Added visible loading progress, retryable asset errors, WebGL guidance, and save recovery.
- Added focus restoration, live regions, keyboard help dismissal, and reduced-motion handling.
- Preserved the exact desktop blocker boundary and copy.
- Preserved the two-level World 1 release, save schema, tutorial prompts, texture progress race guard, and session disposal calls.

## Files

Modified:

- `play/index.html`
- `styles/game.css`
- `js/ui/main.js`
- `js/core/texture-store.js`

Created:

- `js/ui/ui-state.js`
- `tests/unit/ui-state.test.js`

## RED evidence

The first focused run failed because the reducer module did not exist:

```text
node --test tests/unit/ui-state.test.js
ERR_MODULE_NOT_FOUND: Cannot find module js/ui/ui-state.js
1 failed
```

After adding reducer coverage for texture failures, the next run failed because the raw loader error did not identify its asset:

```text
texture failures identify the failed filename for recovery UI
Expected validation function to return true. Received false.
Caught error: Error: 404
7 passed, 1 failed
```

## GREEN evidence

Final focused tests:

```text
node --test tests/unit/ui-state.test.js
8 passed, 0 failed
```

Final full unit suite:

```text
npm test
56 passed, 0 failed
```

Final static checks:

```text
node --check js/ui/ui-state.js
node --check js/ui/main.js
node --check js/core/texture-store.js
git diff --check
```

All four commands passed with no output.

## State transitions

| Event | From | To | Owned result |
| --- | --- | --- | --- |
| `START` | title | characters | Chef buttons rendered |
| `CHOOSE_CHARACTER` | characters | world | Chef saved through reducer |
| `SELECT_LEVEL` | world | loading | Course validated against unlock state |
| `LOAD_PROGRESS` | loading | loading | Percentage clamped and rounded |
| `LOAD_READY` | loading | playing | HUD and game stage shown |
| `PAUSE` | playing | paused | Session paused by coordinator effect |
| `RESUME` | paused | playing | Session resumed by coordinator effect |
| `COURSE_COMPLETE` | playing | complete | Stars recorded and 1-2 unlocked |
| `CONTINUE` | complete | world | Session disposed and map rebuilt |
| `LOAD_FAILED` | loading | error | Failed filename and Retry shown |
| `WEBGL_FAILED` | loading | error | Desktop browser guidance shown |
| `RETRY` | error | loading | Same selected course retried |

Buttons use `data-action` and dispatch these events. They do not mutate saved progression directly.

## Loading and recovery

- Loading begins at 0 percent and reports each unique required asset.
- `AssetLoadError` carries both the authored path and filename.
- Preload waits for every parallel request to settle before returning a failure. This prevents late requests from repopulating a disposed texture store.
- Stale progress remains blocked by the Task 6 loading reporter token.
- WebGL is checked before texture preload and is also caught at session construction.
- A damaged save is immediately replaced with a fresh valid save.
- Its notice is polite, dismissible, shown once, and does not block controls.

## HUD and accessibility

- Top left: World and course.
- Top center: hearts and tomatoes in one plate.
- Top right: timer.
- Conditional power, boss, tutorial, and announcement elements remain outside those three persistent zones.
- HUD announcements use `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`.
- Title, chef, map, loading, playing, pause, complete, and error states each define a primary focus target.
- Focus moves only when the screen state changes. HUD updates do not steal focus.
- The controls hint disappears after the first arrow, A/D, Shift, Space, or Up input.
- Existing `prefers-reduced-motion` rules remain. Game-specific transitions are also disabled.
- Character choices and level nodes are real buttons. Navigation exits are real links.

## Browser evidence completed

Verified in the connected Chrome browser against `http://localhost:8977/play/`.

At an exact page viewport of 1280 by 720:

- Title showed only the `title` UI state.
- Start Adventure held focus.
- Start Adventure opened three chef buttons.
- Fatsio held focus on the character screen.
- Choosing Dinnerette opened the World 1 map.
- The saved current course held focus on the map.
- Map client height and scroll height were both 720 pixels.
- Document width and height were exactly 1280 by 720.
- Starting 1-1 passed through loading and reached playing.
- The game stage held focus while playing.
- HUD bounds did not overlap:
  - Course panel: x 16 to 270.
  - Hearts and tomatoes: x 557.20 to 722.80.
  - Timer: x 1151.35 to 1264.
- ArrowRight hid the controls hint.
- Escape opened pause.
- Resume held focus in the pause dialog.
- The accessibility snapshot exposed the World 1 region, course labels, HUD labels, live status, and pause dialog.

## Browser verification not completed

The browser connection stalled during the live course-completion probe and was stopped. No completion result was returned from that call.

The following required live checks remain unverified:

- Complete overlay visuals and focus.
- Retry and asset-failure visuals.
- WebGL-failure visuals.
- Save-recovery notice visuals.
- Reduced-motion computed styles.
- 1440 by 900 layout.
- 1920 by 1080 layout.
- 390 by 844 desktop blocker.
- Final browser console and network sweep.

The reducer paths for completion, retry, asset failure, WebGL failure, and save recovery are unit tested. That does not replace the missing live visual checks.

## Self-review

- No external fonts, scripts, analytics, CDNs, or requests were added.
- The desktop blocker remains default-on and uses the exact 900 by 620 desktop opt-in query.
- User-facing copy contains no em dash.
- Dynamic asset filenames use `textContent`.
- Locked World 1 courses cannot enter loading through reducer events.
- Course completion cannot record experimental IDs.
- Texture clones and originals still dispose through the existing store interface.
- Replacement sessions destroy the prior session only after preload succeeds.
- Quit, continue, unload, and game-over paths destroy the active session.
- The existing `window.__savoriaTest.startLevel`, `showScreen`, released-level list, and session getter remain available.
- Only Task 8 implementation files and this report changed.

## Concerns

The implementation is unit-green and the core 1280 by 720 flow is live-verified. Final release review still needs the exact browser checks listed above. The stalled browser probe is a verification gap, not proof that those states are broken.

## Fix round 1

Date: 2026-08-26

### Findings addressed

1. Gameplay input now ignores keys from focused buttons, links, form controls, and editable content. Paused and finished sessions also ignore gameplay keys. Live Escape pause and gameplay movement remain captured on the game stage.
2. Space activation remains native for buttons. A focused link receives explicit Space activation because browsers normally reserve Space for scrolling.
3. Pause, complete, and recovery panels now use an opaque parmesan interior, espresso border, and dark text. The existing Savoria button and panel geometry remains.
4. Paused and complete states remove `data-ui-state="playing"` from the visual game stage. The stage and HUD receive both `inert` and `aria-hidden="true"`. Playing removes those attributes and restores its active state root.
5. WebGL capability probing is cached. The probe requests one context and calls `WEBGL_lose_context` when available.
6. The legacy `showScreen` hook is restored through the reducer.
7. The Task 6 test surface now exposes exactly `startLevel`, `showScreen`, `releasedLevels`, and `session`.

### Legacy hook mappings

| `showScreen` input | Task 8 state |
| --- | --- |
| `title-screen` | `title` |
| `char-screen` | `characters` |
| `map-screen` | `world` |
| `null` | `playing` |
| `gameover-screen` | `error` with game-over recovery |
| `win-screen` | `complete` with World 1 completion copy |

Unknown IDs leave state unchanged.

### Fix-round RED evidence

The focused suite failed before the new helpers existed:

```text
SyntaxError: js/ui/ui-state.js does not provide an export named applyGameBackgroundState
1 failed
```

### Fix-round GREEN evidence

Focused coverage passed after the fixes:

```text
node --test tests/unit/ui-state.test.js
12 passed, 0 failed
```

The added cases cover:

- Focused interactive controls are not captured as gameplay input.
- Paused and finished sessions do not capture Space.
- Live gameplay still captures Space and Escape.
- WebGL capability is probed once across repeated checks.
- The probe context is explicitly released once.
- Paused and complete backgrounds are inert and hidden from accessibility.
- Playing restores the background state and attributes.
- All six legacy screen targets map to Task 8 states.

The full suite passed before final reporting:

```text
npm test
60 passed, 0 failed
```

### Fix-round browser evidence completed

Verified in connected Chrome at an exact 1280 by 720 page viewport:

- World 1 created one owned game canvas.
- Escape moved playing to paused.
- Pause exposed only one visible `data-ui-state`: `paused`.
- The game stage had no active state value while paused.
- The game stage and HUD each reported `aria-hidden="true"`.
- Resume held primary focus.
- Pressing Space on Resume returned to playing.
- Playing restored focus to the game stage.
- No browser errors or warnings were present in the checked log window.

### Fix-round browser verification not completed

The browser connection stalled twice on main-world developer probes. Both calls were stopped. No returned result was treated as evidence.

The following live checks remain unverified in fix round 1:

- Space activation on Continue, Replay, Retry, and error links.
- Complete panel contrast and focus.
- Asset-error panel contrast, filename, Retry, and focus.
- WebGL-error panel contrast, guidance, and focus.
- Save-recovery notice.
- Actual browser WebGL probe context and release counts. These are deterministically unit tested only.
- 1440 by 900 layout.
- 1920 by 1080 layout.
- 390 by 844 desktop blocker.
- Reduced-motion computed styles.
- Final local-resource and console sweep across every state.

### Fix-round self-review

- `shouldCaptureGameplayInput` checks session lifecycle before input mutation or default prevention.
- Interactive focus is resolved from the event target, so descendants inside a button or link remain protected.
- Escape still emits pause only from a running, unfinished session.
- Keyup remains harmless after pause because pause clears held input.
- Modal background isolation uses attributes as well as the DOM `inert` property.
- Focus lookup sees only the modal state root during pause and completion.
- WebGL caching is closure-local and cannot leak capability state between page loads.
- Probe release failure cannot turn supported WebGL into an error.
- No error-simulation methods remain on the public test hook.
- No external request, dependency, runner, or browser package was added.

### Fix-round concern

The primary logic is test-backed, and Resume Space activation plus modal isolation are live-verified. The remaining browser matrix must be completed before release review. The browser-control stall is an evidence gap, not a passing result.
