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

export function alphaForLightNeutral(red, green, blue, alpha) {
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  const spread = brightest - darkest;
  const brightness = (red + green + blue) / 3;
  if (spread <= 100 && brightness >= 235) return 0;
  if (spread <= 45 && brightness >= 220) return 0;
  if (spread <= 110 && brightness >= 218) return Math.round(alpha * 0.18);
  if (spread > 55 || brightness < 200) return alpha;
  return Math.round(alpha * Math.max(0, Math.min(1, (220 - brightness) / 20)));
}

export function erodeLightNeutralFringe(data, width, height, radius = 3) {
  const originalAlpha = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < originalAlpha.length; pixel += 1) {
    originalAlpha[pixel] = data[pixel * 4 + 3];
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (originalAlpha[pixel] === 0) continue;
      const index = pixel * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const brightness = (red + green + blue) / 3;
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (brightness < 135 || spread > 165) continue;

      let touchesTransparency = false;
      for (let oy = -radius; oy <= radius && !touchesTransparency; oy += 1) {
        const neighborY = y + oy;
        if (neighborY < 0 || neighborY >= height) continue;
        for (let ox = -radius; ox <= radius; ox += 1) {
          const neighborX = x + ox;
          if (neighborX < 0 || neighborX >= width) continue;
          if (originalAlpha[neighborY * width + neighborX] === 0) {
            touchesTransparency = true;
            break;
          }
        }
      }
      if (touchesTransparency) data[index + 3] = 0;
    }
  }
  return data;
}

export function cropRectFromUv(uv, width, height) {
  if (!uv) return { x: 0, y: 0, width, height };
  return {
    x: Math.round(uv.offsetX * width),
    y: Math.round((1 - uv.offsetY - uv.repeatY) * height),
    width: Math.round(uv.repeatX * width),
    height: Math.round(uv.repeatY * height),
  };
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

  function clone(path) {
    const value = texture(path).clone();
    clones.add(value);
    return value;
  }

  function cropped(path, uv, {
    removeLightNeutral = false,
    featherBottom = 0,
    featherTop = 0,
    seamlessHorizontal = false,
  } = {}) {
    const source = texture(path);
    const image = source.image;
    if (!image) throw new Error(`Texture has no image data: ${path}`);
    const sourceWidth = image.naturalWidth || image.videoWidth || image.width;
    const sourceHeight = image.naturalHeight || image.videoHeight || image.height;
    const crop = cropRectFromUv(uv, sourceWidth, sourceHeight);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = crop.width;
    sourceCanvas.height = crop.height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    const canvas = seamlessHorizontal ? document.createElement('canvas') : sourceCanvas;
    if (seamlessHorizontal) {
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const seamlessContext = canvas.getContext('2d', { willReadFrequently: true });
      const half = Math.floor(canvas.width / 2);
      seamlessContext.drawImage(
        sourceCanvas,
        half,
        0,
        canvas.width - half,
        canvas.height,
        0,
        0,
        canvas.width - half,
        canvas.height,
      );
      seamlessContext.drawImage(
        sourceCanvas,
        0,
        0,
        half,
        canvas.height,
        canvas.width - half,
        0,
        half,
        canvas.height,
      );
      const sourcePixels = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
      const outputPixels = seamlessContext.getImageData(0, 0, canvas.width, canvas.height);
      const band = Math.max(2, Math.floor(canvas.width * 0.12));
      for (let x = half - band; x < half + band; x += 1) {
        const mix = (x - (half - band)) / (band * 2);
        const leftX = Math.min(canvas.width - 1, canvas.width - band * 2 + Math.floor(mix * band * 2));
        const rightX = Math.min(canvas.width - 1, Math.floor(mix * band * 2));
        for (let y = 0; y < canvas.height; y += 1) {
          const target = (y * canvas.width + x) * 4;
          const left = (y * canvas.width + leftX) * 4;
          const right = (y * canvas.width + rightX) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            outputPixels.data[target + channel] = Math.round(
              sourcePixels.data[left + channel] * (1 - mix)
              + sourcePixels.data[right + channel] * mix,
            );
          }
        }
      }
      seamlessContext.putImageData(outputPixels, 0, 0);
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      let alpha = pixels.data[index + 3];
      if (removeLightNeutral) {
        alpha = alphaForLightNeutral(
          pixels.data[index],
          pixels.data[index + 1],
          pixels.data[index + 2],
          alpha,
        );
      }
      const row = Math.floor(index / 4 / canvas.width);
      if (featherBottom > 0) {
        const start = canvas.height * (1 - featherBottom);
        if (row > start) alpha *= Math.max(0, (canvas.height - row) / (canvas.height - start));
      }
      if (featherTop > 0) {
        const end = canvas.height * featherTop;
        if (row < end) alpha *= Math.max(0, row / end);
      }
      pixels.data[index + 3] = Math.round(alpha);
    }
    if (removeLightNeutral) {
      erodeLightNeutralFringe(pixels.data, canvas.width, canvas.height);
    }
    context.putImageData(pixels, 0, 0);
    const value = new THREE.CanvasTexture(canvas);
    value.colorSpace = THREE.SRGBColorSpace;
    clones.add(value);
    return value;
  }

  function masked(path) {
    return cropped(path, null, { removeLightNeutral: true });
  }

  function dispose() {
    for (const value of clones) value.dispose();
    for (const value of originals.values()) value.dispose();
    clones.clear();
    originals.clear();
  }

  return { preload, texture, tiled, clone, cropped, masked, dispose };
}
