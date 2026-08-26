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
