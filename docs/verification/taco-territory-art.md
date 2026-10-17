# Taco Territory painted art

Generated with the built-in image generation tool on 2026-10-17.

Art direction: the existing `world3_thumb.png` sunset palette, warm storybook food painting,
golden upper-left highlights, painted dark contours, toasted corn, beans, salsa, peppers,
cilantro, nopal, and marigolds. Existing World 1 and World 2 art supplied framing references.
No people or costumes. Individual generation calls produced each asset; the shooter was
regenerated to give it a distinct habanero silhouette.

All files live in `assets/sprites/`. Pixel dimensions exactly match the listed World 1
counterpart. Exports use optimized indexed PNG, retaining alpha for cutouts. RGB terrain
and scene images stay opaque. The middle and near layers now have genuine transparency
instead of World 1's baked neutral matte.

| Asset | Pixels | Bytes | Reference |
| --- | --- | ---: | --- |
| `w3_background_far.png` | 1672 × 941 | 527,292 | `assets/world1/background-far.png` |
| `w3_background_middle.png` | 1672 × 941 | 409,636 | `assets/world1/background-middle.png` |
| `w3_background_near.png` | 1672 × 941 | 257,270 | `assets/world1/background-near.png` |
| `w3_ground_face.png` | 1672 × 941 | 930,904 | `assets/world1/ground-face.png` |
| `w3_ground_cap.png` | 2172 × 724 | 463,730 | `assets/world1/ground-cap.png` |
| `w3_quesadilla_platform.png` | 1672 × 941 | 134,287 | `assets/world1/ravioli-platform.png` |
| `w3_tortilla_pillar.png` | 1221 × 1288 | 459,253 | `assets/world1/penne-pillar.png` |
| `w3_cliff_edge.png` | 360 × 1536 | 198,146 | `assets/world1/lasagna-cliff-edge.png` |
| `w3_salsa_surface.png` | 1774 × 887 | 152,136 | `assets/world1/marinara-surface.png` |
| `w3_bean_walker.png` | 1254 × 1254 | 360,982 | `assets/world1/marinara-puff.png` |
| `w3_habanero_shooter.png` | 320 × 320 | 17,291 | `assets/sprites/marinara_shooter.png` |
| `w3_jalapeno_flyer.png` | 320 × 320 | 17,246 | `assets/sprites/pesto_flyer.png` |
| `w3_nopal_garden.png` | 1254 × 1254 | 382,427 | `assets/world1/basil-prop.png` |
| `w3_taco_goal.png` | 1254 × 1254 | 403,307 | `assets/world1/golden-pasta-bell.png` |
| `w3_tortilla_signpost.png` | 1024 × 1536 | 367,890 | `assets/world1/chef-spawn-marker.png` |
| `w3_molcajete_boss.png` | 320 × 320 | 36,258 | `assets/sprites/don_funghi.png` |
| `w3_tomato.png` | 320 × 320 | 26,044 | `assets/sprites/tomato.png` |
| `w3_cilantro_leaf.png` | 320 × 320 | 24,540 | `assets/sprites/basil_leaf.png` |
| `w3_taquito_speed.png` | 320 × 320 | 24,708 | `assets/sprites/speed_pasta.png` |
| `w3_tostada_shield.png` | 320 × 320 | 29,807 | `assets/sprites/parmesan_shield.png` |
| `w3_cilantro_boost.png` | 320 × 320 | 35,260 | `assets/sprites/basil_boost.png` |
| `w3_world_map.png` | 1672 × 941 | 848,872 | `assets/world1/world-map-background.png` |

The map image also fills the title-background manifest slot. The platform fills both
platform cap and face slots. Shared terrain kinds reference the matching local art.
The new nopal garden fills the decoration slot, which World 1 currently leaves empty.
All 22 unique paths are collected by the existing `collectVisualAssets` preload flow,
used by solo and multiplayer. The World 3 level definition also points the world-map
screen at the new map art. No World 1 paths remain in the World 3 manifest.

Prompt set: sunset food landscape (far), transparent tortilla mesa settlement (middle),
transparent tortilla dunes and food garden (near), tortilla/bean/queso ground cross-section,
continuous tortilla ground lip, quesadilla platform, tortilla-stack pillar, tortilla cliff
trim, bubbling roasted-chile salsa strip, bean-and-corn croqueta walker, orange habanero
shooter, jalapeno flyer with corn wings, nopal garden, tortilla goal arch with bell,
right-pointing tortilla signpost, molcajete boss, tomato, cilantro sprig, taquito speed
pickup, tostada shield, cilantro boost bunch, and elevated sunset food-world map.
Each prompt specified reference style, upper-left lighting, safe framing, transparency
where appropriate, and no text, people, costumes, pasta, or watermark. Tile prompts
requested matching repeat edges. Export preparation fitted the painted silhouettes,
resized to reference dimensions, and blended tile boundary strips to identical pixels.

## Verification

- `npm ci`: passed, 121 packages installed.
- `npm test`: passed, 204 unit tests and 30 server tests.
- `CI=1 npx playwright test --workers=1`: passed, 21 browser tests.
- Final browser recheck: 21 passed on isolated ports 8997/8998/2587 using temporary
  copies of the same assertions. Default ports had become occupied by another checkout;
  that checkout was left untouched. Temporary runner files were removed afterward.
- Asset audit: all 22 exact pixel sizes; every file below its reference byte budget;
  all cutouts have alpha with clear corners; horizontal tile boundary pixels match
  for ground face, cap, platform, and salsa; vertical boundaries match for ground face,
  pillar, and cliff trim.
- Total exported art: 6,107,286 bytes versus 20,182,434 bytes for the reference slots.
- Browser capture: no page errors or HTTP failures while loading both World 3 courses.
- Visual corrections: regenerated the shooter, fitted UVs for narrow terrain,
  gave tall brick columns tortilla-stack art, lowered the parallax scenery,
  and anchored the decoration plane and goal feet to the terrain.

## Review screenshots

Saved outside the repository, in the requested sibling `../taco-shots/` folder:

- `3-1-spawn.png`, `3-1-shooter.png`, `3-1-river.png`, `3-1-pillars.png`, `3-1-goal.png`.
- `3-2-spawn.png`, `3-2-shooter.png`, `3-2-river.png`, `3-2-pillars.png`, `3-2-goal.png`.
- `3-world-map.png`: World 3 selection strip.

The ten gameplay views are 1440 × 900 Playwright captures of the playing screen.
The additional map image is a cropped World 3 selection strip. The capture helper pauses
simulation and moves the camera/player between review locations; these are visual review
views, not evidence of a manual end-to-end playthrough. The browser suite separately
checks both courses and World 3 completion.

## Matching limits

The new art follows the original palette, framing, and painted contours, rather than
pixel-identical brushwork. World 1's fake checkerboard mattes were deliberately not copied.
The molcajete boss and some pickup variants fill the complete manifest contract but are
not encountered in the current two World 3 courses. Their image exports were inspected;
their gameplay appearances were not exercised by these screenshots.
