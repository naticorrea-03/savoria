function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

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
  props: [
    {
      id: 'basil',
      path: 'assets/world1/basil-prop.png',
      width: 1.25,
      height: 1.25,
      yOffset: 0.58,
    },
  ],
  sprites: {
    meatball: 'assets/sprites/meatball_walker.png',
    flyer: 'assets/sprites/pesto_flyer.png',
    shooter: 'assets/sprites/marinara_shooter.png',
    boss: 'assets/sprites/don_funghi.png',
    tomato: 'assets/sprites/tomato.png',
    basil: 'assets/sprites/basil_leaf.png',
    speed: 'assets/sprites/speed_pasta.png',
    shield: 'assets/sprites/parmesan_shield.png',
    boost: 'assets/sprites/basil_boost.png',
    goal: 'assets/sprites/goal_archway.png',
    start: 'assets/sprites/start_signpost.png',
  },
});

function visitAssetPaths(value, paths) {
  if (typeof value === 'string' && /^assets\/.*\.(png|webp|jpg)$/i.test(value)) {
    paths.add(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) visitAssetPaths(child, paths);
}

export function collectWorldOneAssets(manifest = WORLD_ONE_VISUALS) {
  const paths = new Set();
  visitAssetPaths(manifest, paths);
  return [...paths];
}

export function terrainVisualFor(kind, manifest = WORLD_ONE_VISUALS) {
  return manifest.terrain[kind] ?? manifest.terrain.ground;
}

export function decorationSlotsFor({ kind, width, top, x = 0 }, manifest = WORLD_ONE_VISUALS) {
  if (!['ground', 'ground2'].includes(kind) || width < 12) return [];
  const prop = manifest.props[0];
  const count = width >= 22 ? 2 : 1;
  const spread = Math.max(0, width / 2 - 3);
  const direction = Math.abs(Math.floor(x)) % 2 === 0 ? 1 : -1;
  const offsets = count === 1
    ? [direction * Math.min(2, spread)]
    : [-spread * 0.65, spread * 0.65];
  return offsets.map((xOffset) => ({
    ...prop,
    xOffset,
    y: top + prop.yOffset,
    z: manifest.plane.propZ,
  }));
}
