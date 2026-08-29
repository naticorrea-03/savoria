export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function visitAssetPaths(value, paths) {
  if (typeof value === 'string' && /^assets\/.*\.(png|webp|jpg)$/i.test(value)) {
    paths.add(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) visitAssetPaths(child, paths);
}

export function collectVisualAssets(manifest) {
  const paths = new Set();
  visitAssetPaths(manifest, paths);
  return [...paths];
}

export function terrainVisualFor(kind, manifest) {
  return manifest.terrain[kind] ?? manifest.terrain.ground;
}

export function decorationSlotsFor({ kind, width, top, x = 0 }, manifest) {
  if (!['ground', 'ground2'].includes(kind) || width < 12) return [];
  const prop = manifest.props[0];
  if (!prop) return [];
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
