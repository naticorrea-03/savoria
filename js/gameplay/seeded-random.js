export function seedToUint32(seed) {
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  const value = String(seed ?? 'savoria');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function nextSeededRandom(state) {
  state.randomState = (state.randomState + 0x6D2B79F5) >>> 0;
  let value = state.randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
