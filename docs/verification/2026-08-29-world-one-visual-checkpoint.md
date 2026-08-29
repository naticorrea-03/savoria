# World 1 visual verification

Date: 2026-08-29

## Verified layer

This document records the local `feat/savoria-world-one` implementation verified before its approval commit.

## Journey checks

- Title opens the player-first home screen.
- Play reaches three keyboard-selectable chef cards.
- Chef cards use static portrait files.
- Gameplay uses the existing animated run sheets.
- World 1 shows a readable two-course path and locked state.
- 1-1 loads, pauses, resumes, restarts, completes, and unlocks 1-2.
- Saved chef and course progress survive reload.
- 1-2 loads, pauses, resumes, restarts, completes, and shows `World 1 complete!`.
- Completed 1-2 stars and the map artwork survive reload.
- The mobile viewport shows only the desktop requirement.
- Production requests stay local.

## Automated evidence

- `npm test`: 86 passed, 0 failed.
- `npm run test:browser`: 5 passed, 0 failed.
- `git diff --check`: passed.
- Screenshot capture at all three desktop sizes: no page errors, failed requests, or document overflow.

## Visual checks

- Three depth layers render behind the unchanged collision geometry.
- At 1440×900, the projected terrain top is within 0.8 pixels of its collision top.
- Legacy atlas terrain and authored low-poly World 1 decorations are not rendered.
- Baked light backgrounds are masked from middle, near, platform, and hazard plates.
- Adjacent ground boxes share continuous visual strips, so collision joins do not reset the texture.
- Background depth layers extend beyond the viewport without a horizontal cutoff.
- Runtime edge cleanup removes pale checkerboard fringes from masked art.
- No atlas labels, color swatches, or checkerboards are visible in the captured frames.
- Tomatoes, enemies, players, and the marinara surface remain visually distinct.
- The HUD stays in the corners and leaves the playfield open.

## Captures

- `docs/verification/screenshots/world-one/title-1440x900.png`
- `docs/verification/screenshots/world-one/chef-select-1440x900.png`
- `docs/verification/screenshots/world-one/world-map-1440x900.png`
- `docs/verification/screenshots/world-one/gameplay-1280x720.png`
- `docs/verification/screenshots/world-one/gameplay-1440x900.png`
- `docs/verification/screenshots/world-one/gameplay-1920x1080.png`
- `docs/verification/screenshots/world-one/gameplay-representative-1440x900.png`
- `docs/verification/screenshots/world-one/gameplay-1-2-1280x720.png`
- `docs/verification/screenshots/world-one/gameplay-1-2-1440x900.png`
- `docs/verification/screenshots/world-one/gameplay-1-2-1920x1080.png`
- `docs/verification/screenshots/world-one/pause-1-2-1440x900.png`
- `docs/verification/screenshots/world-one/world-one-complete-1440x900.png`
- `docs/verification/screenshots/world-one/world-map-resumed-1440x900.png`

The representative screenshot uses the existing test-only session getter to move the camera to the mid-course platform and hazard section. It does not bypass the production renderer.

## Approval record

The first playable checkpoint was approved on 2026-08-29. The remaining World 1 completion, pause, save, resume, and final-course visual checks are included above.
