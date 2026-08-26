const SEGMENTS = new Set(['run', 'gap', 'rise', 'steps', 'river', 'plats', 'roll', 'blocks', 'tier', 'pillars', 'bonus', 'checkpoint', 'goal', 'boss']);

export function validateLevelDefinition(definition) {
  const errors = [];
  if (!/^\d+-\d+$/.test(definition?.id ?? '')) errors.push('id must use world-level format');
  if (!Number.isInteger(definition?.world) || definition.world < 1) errors.push('world must be a positive integer');
  if (!Number.isInteger(definition?.idx) || definition.idx < 1) errors.push('idx must be a positive integer');
  if (!definition?.name?.trim()) errors.push('name is required');
  if (!definition?.theme) errors.push('theme is required');
  if (!Array.isArray(definition?.segs) || definition.segs.length === 0) errors.push('segs must be a non-empty array');
  for (const [index, segment] of (definition?.segs ?? []).entries()) {
    if (!Array.isArray(segment) || !SEGMENTS.has(segment[0])) errors.push(`segment ${index} has an unknown primitive`);
    if (typeof segment?.[1] !== 'number' || !Number.isFinite(segment[1])) errors.push(`segment ${index} needs a finite numeric size`);
  }
  if (!(definition?.segs ?? []).some(([kind]) => kind === 'goal' || kind === 'boss')) errors.push('level needs a goal or boss');
  return errors;
}

export function assertValidReleasedLevels(levels) {
  const ids = new Set();
  for (const level of levels) {
    const errors = validateLevelDefinition(level);
    if (ids.has(level.id)) errors.push(`duplicate id ${level.id}`);
    ids.add(level.id);
    if (errors.length) throw new Error(`${level.id || 'unknown'}: ${errors.join('; ')}`);
  }
}
