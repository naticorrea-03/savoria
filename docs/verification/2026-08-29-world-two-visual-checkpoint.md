# World 2 visual checkpoint

Date: 2026-08-29

Branch: `feat/savoria-world-two`

## Included journey

- Two-world course map
- 2-1 Nori Narrows
- 2-2 Wasabi Falls
- Pause and resume
- Course completion
- World 2 completion
- Save migration, unlock, and reload

## Visual review

- Sushi Shores uses three local parallax layers.
- Ground uses rice and nori faces with salmon caps.
- Platforms and collision silhouettes remain side-view and readable.
- Soy sauce is visually separate from safe terrain.
- Wasabi Imp, Nori Ray, and Soy Squirt replace shared enemy art.
- Start, checkpoint, bonus portal, and goal use local Sushi Shores landmarks.
- The goal landmark is scaled below the first draft.
- Low-poly bonus gates are absent from World 2.
- Ground cliff edges do not stretch the sushi pillar texture.
- No World 1 terrain or enemy path is requested during World 2 entry.
- Character selection portraits remain static.
- Gameplay chef sprites remain animated.

## Desktop captures

The full capture set is in [`screenshots/world-two`](./screenshots/world-two/).

- 1280 by 720: map, 2-1 start, and 2-2 start
- 1440 by 900: map, 2-1 start, enemy, hazard, pause, 2-2 start, goal, and completion
- 1920 by 1080: map, 2-1 start, and 2-2 start

## Automated verification

```text
npm test
97 passed, 0 failed

npm run test:browser
8 passed, 0 failed

git diff --check
passed
```

The browser suite verifies double jump, basil collection, World 2 assets, pause, completion, unlocks, reload persistence, keyboard access, and clean diagnostics.

## Approval gate

World 2 stays on its review branch until both courses are played and approved.
