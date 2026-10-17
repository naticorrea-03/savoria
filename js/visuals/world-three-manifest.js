import { deepFreeze } from './manifest-utils.js';
import { WORLD_ONE_VISUALS } from './world-one-manifest.js';

// Taco Territory ships on World 1 art until it gets its own sprite sheets.
// The theme in themes.js (sky, fog, tint, colors) is what sets it apart for now.
export const WORLD_THREE_VISUALS = deepFreeze({
  ...WORLD_ONE_VISUALS,
  id: 'taco-territory',
  ui: { mapBackground: 'assets/world1/world-map-background.png' },
});
