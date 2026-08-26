export class AssetLoadError extends Error {
  constructor(path, cause) {
    const pathname = String(path).split(/[?#]/, 1)[0];
    const asset = pathname.split('/').filter(Boolean).at(-1) ?? String(path);
    super(`Could not load required asset: ${asset}`, { cause });
    this.name = 'AssetLoadError';
    this.asset = asset;
    this.path = path;
  }
}

export function createTextureStore({ THREE, loader, baseUrl }) {
  const originals = new Map();
  const clones = new Set();

  async function preload(paths, onProgress = () => {}) {
    let loaded = 0;
    const uniquePaths = [...new Set(paths)];
    const results = await Promise.allSettled(uniquePaths.map(async (path) => {
      try {
        const value = await loader.loadAsync(new URL(path, baseUrl).href);
        value.colorSpace = THREE.SRGBColorSpace;
        originals.set(path, value);
        onProgress(++loaded, uniquePaths.length);
      } catch (error) {
        throw new AssetLoadError(path, error);
      }
    }));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  function texture(path) {
    const value = originals.get(path);
    if (!value) throw new Error(`Texture not preloaded: ${path}`);
    return value;
  }

  function tiled(path, repeatX, repeatY, offsetX = 0, offsetY = 0) {
    const clone = texture(path).clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(Math.max(0.5, repeatX), Math.max(0.5, repeatY));
    clone.offset.set(offsetX % 1, offsetY % 1);
    clone.needsUpdate = true;
    clones.add(clone);
    return clone;
  }

  function dispose() {
    for (const value of clones) value.dispose();
    for (const value of originals.values()) value.dispose();
    clones.clear();
    originals.clear();
  }

  return { preload, texture, tiled, dispose };
}
