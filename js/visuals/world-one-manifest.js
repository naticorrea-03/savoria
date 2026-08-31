import {
  collectVisualAssets,
  decorationSlotsFor as decorationSlotsForManifest,
  deepFreeze,
  terrainVisualFor as terrainVisualForManifest,
} from './manifest-utils.js';

export const WORLD_ONE_VISUALS = deepFreeze({
  id: 'pasta-plains',
  plane: {
    gameplayZ: 0,
    propZ: -4,
    spriteZ: 1.2,
  },
  ui: {
    titleBackground: 'assets/world1/title-background.png',
    mapBackground: 'assets/world1/world-map-background.png',
  },
  backgrounds: [
    {
      id: 'far',
      path: 'assets/world1/background-far.png',
      z: -56,
      width: 256,
      height: 144,
      y: 2,
      parallax: 0.08,
      opacity: 0.72,
      uv: { offsetX: 0, offsetY: 0.55, repeatX: 1, repeatY: 0.45 },
    },
    {
      id: 'middle',
      path: 'assets/world1/background-middle.png',
      z: -34,
      width: 160,
      height: 27,
      y: -5.5,
      parallax: 0.16,
      opacity: 0.82,
      removeLightNeutral: true,
      uv: { offsetX: 0, offsetY: 0.27, repeatX: 1, repeatY: 0.36 },
    },
    {
      id: 'near',
      path: 'assets/world1/background-near.png',
      z: -18,
      width: 160,
      height: 20,
      y: -6.5,
      parallax: 0.28,
      opacity: 0.9,
      removeLightNeutral: true,
      uv: { offsetX: 0, offsetY: 0.33, repeatX: 1, repeatY: 0.23 },
    },
  ],
  terrain: {
    ground: {
      cap: 'assets/world1/ground-cap.png',
      face: 'assets/world1/ground-face.png',
      edge: 'assets/world1/lasagna-cliff-edge.png',
      edgeWidth: 1.4,
      faceUv: { offsetX: 0.06, offsetY: 0.22, repeatX: 0.88, repeatY: 0.54 },
      sourceAspect: 2.9,
      skirtDepth: 6,
      skirtTint: 0xb8724f,
      capDepth: 0.52,
      faceDepth: 0.08,
    },
    ground2: {
      cap: 'assets/world1/ground-cap.png',
      face: 'assets/world1/ground-face.png',
      edge: 'assets/world1/lasagna-cliff-edge.png',
      edgeWidth: 1.4,
      faceUv: { offsetX: 0.06, offsetY: 0.22, repeatX: 0.88, repeatY: 0.54 },
      sourceAspect: 2.9,
      skirtDepth: 6,
      skirtTint: 0xb8724f,
      capDepth: 0.52,
      faceDepth: 0.08,
    },
    plat: {
      cap: 'assets/world1/ravioli-platform.png',
      face: 'assets/world1/ravioli-platform.png',
      removeLightNeutral: true,
      faceUv: { offsetX: 0.095, offsetY: 0.39, repeatX: 0.81, repeatY: 0.22 },
      capDepth: 0.34,
      faceDepth: 0.08,
    },
    brick: {
      cap: 'assets/world1/ravioli-platform.png',
      face: 'assets/world1/ravioli-platform.png',
      removeLightNeutral: true,
      faceUv: { offsetX: 0.095, offsetY: 0.39, repeatX: 0.81, repeatY: 0.22 },
      capDepth: 0.34,
      faceDepth: 0.08,
      tint: 0xf0c85a,
    },
    pillar: {
      cap: 'assets/world1/ground-cap.png',
      face: 'assets/world1/penne-pillar.png',
      capDepth: 0.3,
      faceDepth: 0.08,
    },
  },
  hazard: {
    surface: 'assets/world1/marinara-surface.png',
    removeLightNeutral: true,
    opacity: 0.98,
    uv: { offsetX: 0.01, offsetY: 0.38, repeatX: 0.98, repeatY: 0.18 },
  },
  props: [],
  sprites: {
    meatball: 'assets/world1/marinara-puff.png',
    flyer: 'assets/sprites/pesto_flyer.png',
    shooter: 'assets/sprites/marinara_shooter.png',
    boss: 'assets/sprites/don_funghi.png',
    tomato: 'assets/sprites/tomato.png',
    basil: 'assets/sprites/basil_leaf.png',
    speed: 'assets/sprites/speed_pasta.png',
    shield: 'assets/sprites/parmesan_shield.png',
    boost: 'assets/sprites/basil_boost.png',
    goal: 'assets/world1/golden-pasta-bell.png',
    start: 'assets/world1/chef-spawn-marker.png',
  },
});

export function collectWorldOneAssets(manifest = WORLD_ONE_VISUALS) {
  return collectVisualAssets(manifest);
}

export function terrainVisualFor(kind, manifest = WORLD_ONE_VISUALS) {
  return terrainVisualForManifest(kind, manifest);
}

export function decorationSlotsFor({ kind, width, top, x = 0 }, manifest = WORLD_ONE_VISUALS) {
  return decorationSlotsForManifest({ kind, width, top, x }, manifest);
}
