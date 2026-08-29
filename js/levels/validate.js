const THEMES = new Set(['pasta', 'sushi', 'taco', 'curry', 'dumpling', 'dessert']);
const TUTORIALS = new Set(['move', 'jump', 'run', 'stomp']);
const ENEMIES = new Set(['meatball', 'flyer', 'shooter']);
const ITEMS = new Set(['basil', 'boost', 'shield', 'speed']);
const DECORATIONS = new Set([
  'adobe', 'archgate', 'bamboo', 'bao', 'campanile', 'cactus', 'candycane',
  'candycastle', 'cupcake', 'cypress', 'dome', 'lantern', 'mesa', 'pagoda',
  'palace', 'sakura', 'villa', 'volcano', 'windmill',
]);

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPositive = (value) => isFiniteNumber(value) && value > 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isFlag = (value) => value === true || value === false || value === 0 || value === 1;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const OPTION_RULES = {
  arc: { accepts: (value) => Number.isInteger(value) && value >= 2, expected: 'an integer of at least 2' },
  coins: { accepts: isPositiveInteger, expected: 'a positive integer' },
  deco: { accepts: (value) => DECORATIONS.has(value), expected: 'a known decoration' },
  decoS: { accepts: isPositive, expected: 'a positive finite number' },
  dir: { accepts: (value) => value === -1 || value === 1, expected: '-1 or 1' },
  enemy: { accepts: (value) => ENEMIES.has(value), expected: 'a known enemy' },
  enemy2: { accepts: (value) => ENEMIES.has(value), expected: 'a known enemy' },
  flyer: { accepts: isFlag, expected: 'a boolean flag' },
  item: { accepts: (value) => ITEMS.has(value), expected: 'a known item' },
  ledge: { accepts: isFlag, expected: 'a boolean flag' },
  mover: { accepts: isFlag, expected: 'a boolean flag' },
  period: { accepts: isPositive, expected: 'a positive finite number' },
  pillar: { accepts: isPositive, expected: 'a positive finite number' },
  plat: { accepts: isFlag, expected: 'a boolean flag' },
  requiresRun: { accepts: (value) => typeof value === 'boolean', expected: 'a boolean' },
  safeGround: { accepts: (value) => typeof value === 'boolean', expected: 'a boolean' },
  shooter: { accepts: isFlag, expected: 'a boolean flag' },
  shooterAt: { accepts: (value) => isFiniteNumber(value) && value > 0 && value < 1, expected: 'a finite number between 0 and 1' },
  tutorial: { accepts: (value) => TUTORIALS.has(value), expected: 'a known tutorial' },
};

const schema = (size, options = []) => ({ size, options: new Set(options) });
const SEGMENT_SCHEMAS = {
  run: schema(isPositive, ['coins', 'tutorial', 'enemy', 'enemy2', 'flyer', 'shooter', 'shooterAt', 'item', 'deco', 'decoS', 'pillar', 'ledge']),
  gap: schema(isPositive, ['arc', 'plat', 'safeGround', 'mover', 'period', 'requiresRun', 'flyer']),
  rise: schema((value) => isFiniteNumber(value) && value !== 0),
  steps: schema(isPositiveInteger, ['dir', 'requiresRun']),
  river: schema(isPositive, ['flyer']),
  plats: schema(isPositiveInteger, ['coins']),
  roll: schema(isPositive, ['coins', 'enemy']),
  blocks: schema(isPositiveInteger, ['enemy']),
  tier: schema(isPositive, ['enemy', 'item']),
  pillars: schema(isPositiveInteger, ['requiresRun']),
  bonus: schema((value) => value === 0, ['item']),
  checkpoint: schema((value) => value === 0),
  goal: schema((value) => value === 0),
  boss: schema((value) => value === 0),
};

function validateSegment(segment, index, errors) {
  if (!Array.isArray(segment)) {
    errors.push(`segment ${index} must be an array`);
    return;
  }
  if (segment.length < 2 || segment.length > 3) {
    errors.push(`segment ${index} must contain a primitive, size, and optional options object`);
  }

  const [kind, size, options] = segment;
  const segmentSchema = SEGMENT_SCHEMAS[kind];
  if (!segmentSchema) {
    errors.push(`segment ${index} has an unknown primitive`);
    return;
  }
  if (!segmentSchema.size(size)) errors.push(`segment ${index} has an invalid ${kind} size`);
  if (options === undefined) return;
  if (!isPlainObject(options)) {
    errors.push(`segment ${index} options must be an object`);
    return;
  }

  for (const [key, value] of Object.entries(options)) {
    if (!segmentSchema.options.has(key)) {
      errors.push(`segment ${index} has unknown ${kind} option ${key}`);
      continue;
    }
    const rule = OPTION_RULES[key];
    if (!rule.accepts(value)) errors.push(`segment ${index} option ${key} must be ${rule.expected}`);
  }
  if (Object.hasOwn(options, 'shooterAt') && !options.shooter) {
    errors.push(`segment ${index} option shooterAt requires shooter`);
  }
  if (Object.hasOwn(options, 'period') && !options.mover) {
    errors.push(`segment ${index} option period requires mover`);
  }
}

export function validateLevelDefinition(definition) {
  const errors = [];
  const id = definition?.id ?? '';
  const world = definition?.world;
  const index = definition?.idx;

  if (!/^\d+-\d+$/.test(id)) errors.push('id must use world-level format');
  if (!isPositiveInteger(world)) errors.push('world must be a positive integer');
  if (!isPositiveInteger(index)) errors.push('idx must be a positive integer');
  if (isPositiveInteger(world) && isPositiveInteger(index) && id !== `${world}-${index}`) {
    errors.push('id must match world and idx');
  }
  if (typeof definition?.name !== 'string' || !definition.name.trim()) errors.push('name is required');
  if (!THEMES.has(definition?.theme)) errors.push('theme must be known');
  if (!isPositiveInteger(definition?.time)) errors.push('time must be a positive integer');

  const segments = definition?.segs;
  if (!Array.isArray(segments) || segments.length === 0) {
    errors.push('segs must be a non-empty array');
    return errors;
  }

  segments.forEach((segment, segmentIndex) => validateSegment(segment, segmentIndex, errors));
  const terminalIndexes = [];
  segments.forEach((segment, segmentIndex) => {
    if (Array.isArray(segment) && (segment[0] === 'goal' || segment[0] === 'boss')) {
      terminalIndexes.push(segmentIndex);
    }
  });
  if (terminalIndexes.length !== 1) {
    errors.push('level needs exactly one goal or boss');
  } else if (terminalIndexes[0] !== segments.length - 1) {
    errors.push('goal or boss must be the final segment');
  }
  return errors;
}

export function assertValidReleasedLevels(levels) {
  const ids = new Set();
  for (const level of levels) {
    const errors = validateLevelDefinition(level);
    if (ids.has(level?.id)) errors.push(`duplicate id ${level.id}`);
    ids.add(level?.id);
    if (errors.length) throw new Error(`${level?.id || 'unknown'}: ${errors.join('; ')}`);
  }
}
