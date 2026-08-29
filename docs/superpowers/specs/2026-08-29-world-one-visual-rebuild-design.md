# Savoria World 1 Visual Rebuild Design

## Goal

Rebuild the complete player journey with platforming clarity and Savoria artwork. Keep gameplay physics, level coordinates, saves, and approved character animation unchanged.

## Approved direction

The approved signature is a pasta diorama. Scenic depth belongs in soft background layers. Playable terrain stays flat, crisp, and easy to read.

Approved references:

- `design/mockups/title-approval.png`
- `design/mockups/selection-map-approval.png`
- `design/mockups/gameplay-approval.png`
- `assets/sprites/world1_thumb.png`

## Visual system

### Palette

- Sky: `#8BCAF1`
- Parmesan: `#F6D77D`
- Cream: `#FFF5D6`
- Marinara: `#C94723`
- Basil: `#2F692F`
- Espresso: `#3A1C0F`

### Type

- Display: Cooper Black or Rockwell Extra Bold
- Body: Avenir Next or Trebuchet MS
- Utility: system monospace

### Gameplay hierarchy

1. Player, enemies, hazards, and collectibles use the strongest contrast.
2. Collision surfaces use horizontal caps and flat silhouettes.
3. Middle scenery uses lower contrast and limited detail.
4. Far scenery uses the softest contrast and no collision-like edges.

### Character rules

- Selection cards use `assets/sprites/fatsio.png`, `dinnerette.png`, and `chefno.png`.
- Gameplay uses existing `assets/characters/*/run-sheet.png` animation.
- Every chef currently shares the same movement. Selection copy must not invent abilities.

## Rendering architecture

Add a pure World 1 visual manifest. It owns asset paths, layer order, terrain mappings, scale, anchors, and controlled prop placement. `world-builder.js` consumes the manifest while keeping the compiled level DSL and every collision box unchanged.

Replace repeated atlas crops with purpose-made local assets. Terrain meshes keep their current `BoxGeometry` and `AABB` values. Front, cap, and side materials may change without altering physics.

Three background sprites follow the camera at different parallax ratios. Their screen coverage is continuous across each level. Generated layers may not contain UI, labels, playable surfaces, or copyrighted artwork.

## Interface architecture

The existing UI state reducer remains authoritative. HTML IDs and actions remain stable unless a browser test is updated in the same change.

- Title: one dominant Play action, with contributor access secondary.
- Character selection: three large static cards and clear selected state.
- Map: one World 1 route with two nodes and obvious locked state.
- HUD: level at top left, health, tomatoes, and time at top right.
- Pause and completion: share the same cream, basil, marinara, and espresso component system.

All controls retain visible focus. Reduced motion remains respected. The game stays desktop-only and offline-capable.

## Asset constraints

- All production assets are local.
- No network requests occur during play.
- No Nintendo artwork, characters, or logos are used.
- No atlas labels, color swatches, baked gameplay backgrounds, or visible texture seams appear.
- Props may not overlap collision edges, hazards, enemies, collectibles, or the player.
- Windmills, villas, algorithmic trees, and random mushrooms are removed from World 1.

## Approval gates

The three interface mockups are approved. Implementation proceeds through course 1-1, Farfalle Fields. A rendered first-playable checkpoint must be approved before the same rendering system is finalized across the remaining World 1 journey.

## Verification

- Run all unit and browser tests.
- Render 1-1 at 1280×720, 1440×900, and 1920×1080.
- Inspect console errors, failed requests, overflow, seams, collision alignment, character behavior, and prop obstruction.
- Complete 1-1 through the production UI, then verify pause, completion, save, and resume.
