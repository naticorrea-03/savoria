export const SAVE_KEY = 'savoria3d-save-v4';
const LEGACY_KEYS = ['savoria3d-save-v3', 'savoria3d-save-v2'];
const MAX_RELEASED_LEVELS = 4;
const RELEASED_LEVEL_IDS = new Set(['1-1', '1-2', '2-1', '2-2']);

export const createFreshSave = () => ({ version: 4, unlocked: 1, best: {}, chef: 'fatsio', sound: true });

export function parseSave(raw) {
  if (!raw) return { save: createFreshSave(), recovered: false };
  try {
    const value = JSON.parse(raw);
    const save = createFreshSave();
    save.best = Object.fromEntries(Object.entries(value.best ?? {}).filter(([id, stars]) => RELEASED_LEVEL_IDS.has(id) && Number.isInteger(stars) && stars >= 0 && stars <= 3));
    const progressFloor = save.best['2-1'] !== undefined
      ? 4
      : save.best['1-2'] !== undefined
        ? 3
        : save.best['1-1'] !== undefined
          ? 2
          : 1;
    save.unlocked = Math.min(
      MAX_RELEASED_LEVELS,
      Math.max(progressFloor, Number(value.unlocked) || 1),
    );
    save.chef = ['fatsio', 'dinnerette', 'chefno'].includes(value.chef) ? value.chef : save.chef;
    save.sound = value.sound !== false;
    return { save, recovered: false };
  } catch {
    return { save: createFreshSave(), recovered: true };
  }
}

export function loadSave(storage) {
  const current = storage.getItem(SAVE_KEY);
  if (current) return parseSave(current);
  for (const key of LEGACY_KEYS) {
    const legacy = storage.getItem(key);
    if (legacy) return parseSave(legacy);
  }
  return parseSave(null);
}

export function writeSave(storage, save) {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function recordCompletion(save, levelId, stars, nextUnlocked) {
  if (!RELEASED_LEVEL_IDS.has(levelId) || !Number.isInteger(stars)) {
    return { ...save, best: { ...save.best } };
  }
  const validStars = Math.min(3, Math.max(0, stars));
  return {
    ...save,
    unlocked: Math.min(MAX_RELEASED_LEVELS, Math.max(save.unlocked, nextUnlocked)),
    best: { ...save.best, [levelId]: Math.max(save.best[levelId] ?? 0, validStars) },
  };
}
