// Pure helpers for the illustrated world map: node layout, the winding road
// between nodes, and which reveals a player has already seen. No DOM here, so
// the unit tests can cover it. Presentation only; it never touches the save.

export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;

// Worlds that are planned but not released yet. Released worlds always come
// from the level registry, so a world shipping later drops out of this list.
export const PLANNED_WORLDS = [
  { n: 4, name: 'Curry Cliffs', cuisine: 'Indian Cuisine', thumb: 'assets/sprites/world4_thumb.png' },
  { n: 5, name: 'Dumpling Dynasty', cuisine: 'Chinese Cuisine', thumb: 'assets/sprites/world5_thumb.png' },
  { n: 6, name: 'Dessert Dome', cuisine: 'Sweet Cuisine', thumb: 'assets/sprites/world6_thumb.png' },
];

export const WORLD_ACCENTS = {
  pasta: { accent: '#f2b544', deep: '#7a3d0c' },
  sushi: { accent: '#ff8fa3', deep: '#6b1f33' },
  taco: { accent: '#ff8a3d', deep: '#6e2410' },
};

export function worldAccent(theme) {
  return WORLD_ACCENTS[theme] ?? { accent: '#f2b544', deep: '#5a2c0a' };
}

// Course nodes zigzag left to right across a 1600 by 900 stage. Each world
// gets its own phase so the three maps do not look copy-pasted.
export function courseNodePoints(count, worldNumber = 1) {
  if (count <= 0) return [];
  const left = 330;
  const right = 1270;
  const flip = worldNumber % 2 === 0 ? -1 : 1;
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const wave = count === 1 ? 0 : (index % 2 === 0 ? 1 : -1) * flip;
    return {
      x: Math.round(left + (right - left) * t),
      y: Math.round(540 + wave * 105 + Math.sin((index + worldNumber) * 1.7) * 18),
    };
  });
}

// Catmull-Rom through the points, written as cubic Bezier segments.
function catmullSegments(points, tension = 0.5) {
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const k = tension / 3 * 2;
    segments.push([
      p1,
      { x: p1.x + (p2.x - p0.x) * k / 2, y: p1.y + (p2.y - p0.y) * k / 2 },
      { x: p2.x - (p3.x - p1.x) * k / 2, y: p2.y - (p3.y - p1.y) * k / 2 },
      p2,
    ]);
  }
  return segments;
}

const round = (value) => Math.round(value * 10) / 10;

export function segmentPathData([a, b, c, d]) {
  return `M${round(a.x)} ${round(a.y)} C${round(b.x)} ${round(b.y)} ${round(c.x)} ${round(c.y)} ${round(d.x)} ${round(d.y)}`;
}

export function pointOnSegment([a, b, c, d], t) {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x,
    y: w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y,
  };
}

// Arc-length table so the chef walks at an even speed along a curve.
export function segmentLengthTable(segment, samples = 24) {
  const table = [0];
  let previous = pointOnSegment(segment, 0);
  for (let index = 1; index <= samples; index += 1) {
    const point = pointOnSegment(segment, index / samples);
    table.push(table[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  return table;
}

export function pointAtDistance(segment, table, fraction) {
  const total = table.at(-1);
  const target = Math.min(1, Math.max(0, fraction)) * total;
  let index = 1;
  while (index < table.length - 1 && table[index] < target) index += 1;
  const span = table[index] - table[index - 1] || 1;
  const local = (index - 1 + (target - table[index - 1]) / span) / (table.length - 1);
  return pointOnSegment(segment, local);
}

// Hand-placed roads for map art that already paints its own path. They only
// apply while the course count matches; a new course falls back to the
// generated zigzag instead of breaking the map.
export const WORLD_ANCHORS = {
  1: {
    count: 2,
    paintedGate: true,
    start: { x: 200, y: 800 },
    nodes: [{ x: 420, y: 578 }, { x: 1222, y: 295 }],
    gate: { x: 1338, y: 204 },
    controls: [
      [{ x: 250, y: 720 }, { x: 320, y: 610 }],
      [{ x: 780, y: 520 }, { x: 1000, y: 400 }],
      [{ x: 1270, y: 268 }, { x: 1312, y: 236 }],
    ],
  },
};

function anchoredLayout(anchors) {
  const route = [anchors.start, ...anchors.nodes, anchors.gate];
  const segments = anchors.controls.map(([b, c], index) => {
    const curve = [route[index], b, c, route[index + 1]];
    return { curve, d: segmentPathData(curve), length: segmentLengthTable(curve).at(-1) };
  });
  return {
    nodes: anchors.nodes.map((point) => ({ ...point })),
    segments,
    start: anchors.start,
    gate: anchors.gate,
    paintedGate: Boolean(anchors.paintedGate),
    anchored: true,
  };
}

// The whole map: an entry point at the left, one node per course, and a
// gate toward the next world at the right. segments[i] ends at nodes[i];
// the last segment ends at the gate. Everything stays inside the area a
// 900 by 620 window still shows after cover-fitting.
export function worldMapLayout(count, worldNumber = 1) {
  const anchors = WORLD_ANCHORS[worldNumber];
  if (anchors && anchors.count === count) return anchoredLayout(anchors);
  const nodes = courseNodePoints(count, worldNumber);
  if (nodes.length === 0) {
    return { nodes, segments: [], start: null, gate: null, paintedGate: false, anchored: false };
  }
  const first = nodes[0];
  const last = nodes.at(-1);
  const start = { x: 240, y: Math.min(760, first.y + 150) };
  const gate = { x: 1380, y: Math.max(300, last.y - 130) };
  const route = [start, ...nodes, gate];
  const segments = catmullSegments(route).map((curve) => ({
    curve,
    d: segmentPathData(curve),
    length: segmentLengthTable(curve).at(-1),
  }));
  return { nodes, segments, start, gate, paintedGate: false, anchored: false };
}

// Cover-fit the stage into a viewport, keeping the stage centered.
export function coverTransform(viewWidth, viewHeight) {
  const scale = Math.max(viewWidth / STAGE_WIDTH, viewHeight / STAGE_HEIGHT);
  return {
    scale,
    x: (viewWidth - STAGE_WIDTH * scale) / 2,
    y: (viewHeight - STAGE_HEIGHT * scale) / 2,
  };
}

// Which course unlocks, world unlocks, and world intros the player has already watched. Kept apart
// from the save file so cinematics can never damage progress.
export const CINEMATIC_MEMORY_KEY = 'savoria3d-cinematics-v1';

export function createMemory() {
  return { worlds: [], worldCards: [], courses: [] };
}

export function parseMemory(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return {
      worlds: Array.isArray(value.worlds) ? value.worlds.filter(Number.isInteger) : [],
      worldCards: Array.isArray(value.worldCards) ? value.worldCards.filter(Number.isInteger) : [],
      courses: Array.isArray(value.courses) ? value.courses.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return null;
  }
}

// Players who already had progress before this map existed should not sit
// through every intro and unlock at once, so seed memory from their save.
export function seedMemory(save, levels) {
  const memory = createMemory();
  const hasProgress = Object.keys(save?.best ?? {}).length > 0;
  if (!hasProgress) return memory;
  const open = levels.slice(0, Math.max(1, Number(save.unlocked) || 1));
  memory.courses = open.map(({ id }) => id);
  memory.worlds = [...new Set(open.map(({ world }) => world))];
  memory.worldCards = [...memory.worlds];
  return memory;
}

export function isWorldOpen(worldNumber, save, levels) {
  const firstIndex = levels.findIndex(({ world }) => world === worldNumber);
  return firstIndex >= 0 && firstIndex < (Number(save?.unlocked) || 1);
}

export function pendingCourseReveals(memory, save, levels, worldNumber) {
  const seen = new Set(memory.courses);
  return levels
    .map((level, index) => ({ level, index }))
    .filter(({ level, index }) => (
      level.world === worldNumber
      && index < (Number(save?.unlocked) || 1)
      && !seen.has(level.id)
    ))
    .map(({ level }) => level.id);
}

export function pendingWorldReveals(memory, save, levels, worlds) {
  const seen = new Set(memory.worldCards);
  return worlds
    .filter(({ n }) => n !== worlds[0]?.n && isWorldOpen(n, save, levels) && !seen.has(n))
    .map(({ n }) => n);
}
