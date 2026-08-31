# Home hub visual checkpoint

Date: 2026-08-29
Last updated: 2026-08-30

## Scope

- Rebuilt the playable title screen as a Savoria adventure lobby.
- Kept Chefno, Fatsio, and Dinnerette on their original static artwork.
- Added one clear Continue adventure action.
- Added real star, course, world, and next-course progress from the saved game.
- Shows all six planned worlds in the destination list.
- Keeps Worlds 3 through 6 greyed out and locked.
- Added a generated kingdom panorama connecting Pasta Plains and Sushi Shores.

## Visual review

The final captures were opened and inspected at all three desktop targets. The lobby stays inside the viewport. The main action remains visible. The chef party, current course, progress chips, kitchen kit, and destination board do not overlap.

- `docs/verification/screenshots/home-hub/home-1280x720.png`
- `docs/verification/screenshots/home-hub/home-1440x900.png`
- `docs/verification/screenshots/home-hub/home-1920x1080.png`

## Verification

- `npm test`: 98 passed.
- `npm run test:browser`: 8 passed.
- Browser coverage checks the lobby, keyboard flow, double jump, basil collection, course progression, Sushi Shores, pause, resume, persistence, the desktop blocker, and clean page diagnostics.
- `git diff --check`: passed.

## Generated asset

The built-in image generator created `assets/home/savoria-kingdom-hub.png`. The prompt requested a local 16:9 Savoria panorama. Pasta Plains flows into Sushi Shores around one central castle road. It excluded characters, text, logos, interface elements, and Nintendo artwork.

An attempted transparent logo cleanup was rejected because its output baked in a checkerboard. The shipped lobby keeps the original Savoria logo unchanged inside a gold frame.
