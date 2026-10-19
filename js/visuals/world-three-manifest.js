import { deepFreeze } from './manifest-utils.js';

const art = (name) => `assets/sprites/w3_${name}.png`;

const ground = {
  cap: art('ground_cap'),
  face: art('ground_face'),
  edge: art('cliff_edge'),
  edgeWidth: 0.65,
  // The face art is three stacked taco layers that tile in both directions.
  // Tiling at a fixed world size keeps the layers from squashing on short
  // ground or restarting in the skirt below it.
  faceTile: { width: 7.2 * (1672 / 941), height: 7.2 },
  skirtDepth: 6,
  skirtTint: 0xb88059,
  capDepth: 0.52,
  faceDepth: 0.08,
};

const platform = {
  cap: art('quesadilla_platform'),
  face: art('quesadilla_platform'),
  // Crops are fitted to the painted silhouette after export, not a white matte.
  faceUv: { offsetX: 0, offsetY: 0.34, repeatX: 1, repeatY: 0.32 },
  capDepth: 0.34,
  faceDepth: 0.08,
};

export const WORLD_THREE_VISUALS = deepFreeze({
  id: 'taco-territory',
  plane: { gameplayZ: 0, propZ: -0.6, spriteZ: 1.2 },
  ui: {
    titleBackground: art('world_map'),
    mapBackground: art('world_map'),
  },
  backgrounds: [
    {
      id: 'far', path: art('background_far'),
      z: -56, width: 256, height: 144, y: 2, parallax: 0.08, opacity: 1,
    },
    {
      id: 'middle', path: art('background_middle'),
      z: -34, width: 160, height: 27, y: -6, parallax: 0.16, opacity: 0.82,
    },
    {
      id: 'near', path: art('background_near'),
      z: -18, width: 160, height: 20, y: -7, parallax: 0.28, opacity: 0.88,
    },
  ],
  terrain: {
    ground,
    ground2: { ...ground, tint: 0xf4dfc2 },
    plat: platform,
    brick: {
      cap: art('ground_cap'), face: art('tortilla_pillar'),
      faceUv: { offsetX: 0.075, offsetY: 0, repeatX: 0.85, repeatY: 1 },
      sourceAspect: (1221 / 1288) * 0.85,
      capDepth: 0.34, faceDepth: 0.08, tint: 0xedba85,
    },
    pillar: {
      cap: art('ground_cap'), face: art('tortilla_pillar'),
      faceUv: { offsetX: 0.075, offsetY: 0, repeatX: 0.85, repeatY: 1 },
      capDepth: 0.3, faceDepth: 0.08,
    },
  },
  hazard: {
    surface: art('salsa_surface'), opacity: 0.98,
    uv: { offsetX: 0, offsetY: 0.325, repeatX: 1, repeatY: 0.35 },
  },
  props: [
    { path: art('nopal_garden'), width: 2.3, height: 2.3, yOffset: 0.6 },
  ],
  landmarks: { goal: { width: 6.4, height: 6.4, y: 2.9 } },
  sprites: {
    meatball: art('bean_walker'),
    shooter: art('habanero_shooter'),
    flyer: art('jalapeno_flyer'),
    // Don Funghi keeps his own look in every world.
    boss: 'assets/sprites/don_funghi.png',
    tomato: art('tomato'),
    basil: art('cilantro_leaf'),
    speed: art('taquito_speed'),
    shield: art('tostada_shield'),
    boost: art('cilantro_boost'),
    goal: art('taco_goal'),
    start: art('tortilla_signpost'),
  },
});
