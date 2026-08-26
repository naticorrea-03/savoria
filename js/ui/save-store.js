export const SAVE_KEY = 'savoria3d-save-v3';
const LEGACY_KEY = 'savoria3d-save-v2';
const MAX_RELEASED_LEVELS = 2;

export const createFreshSave = () => ({ version: 3, unlocked: 1, best: {}, chef: 'fatsio', sound: true });

export function parseSave(raw) {
  if (!raw) return { save: createFreshSave(), recovered: false };
  try {
    const value = JSON.parse(raw);
    const save = createFreshSave();
    save.unlocked = Math.min(MAX_RELEASED_LEVELS, Math.max(1, Number(value.unlocked) || 1));
    save.best = Object.fromEntries(Object.entries(value.best ?? {}).filter(([id, stars]) => /^1-[12]$/.test(id) && Number.isInteger(stars) && stars >= 0 && stars <= 3));
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
  return parseSave(storage.getItem(LEGACY_KEY));
}

export function writeSave(storage, save) {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function recordCompletion(save, levelId, stars, nextUnlocked) {
  return {
    ...save,
    unlocked: Math.min(MAX_RELEASED_LEVELS, Math.max(save.unlocked, nextUnlocked)),
    best: { ...save.best, [levelId]: Math.max(save.best[levelId] ?? 0, stars) },
  };
}
