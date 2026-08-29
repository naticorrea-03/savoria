const level = (world, idx, name, theme, time, segs) => ({ id: `${world}-${idx}`, world, idx, name, theme, time, segs });

export const WORLD_ONE = {
  n: 1,
  name: 'Pasta Plains',
  cuisine: 'Italian Cuisine',
  theme: 'pasta',
  thumb: 'assets/sprites/world1_thumb.png',
};

export const WORLD_ONE_LEVELS = [
  level(1, 1, 'Farfalle Fields', 'pasta', 240, [
    ['run', 12, { coins: 5, tutorial: 'move', deco: 'cypress' }],
    ['run', 6, { tutorial: 'jump' }],
    ['gap', 3.5, { arc: 5 }],
    ['run', 14, { enemy: 'meatball', tutorial: 'stomp', deco: 'windmill', decoS: 1.2 }],
    ['blocks', 3],
    ['checkpoint', 0],
    ['river', 9],
    ['run', 16, { tutorial: 'run', coins: 4, item: 'basil', deco: 'cypress' }],
    ['gap', 5, { arc: 5, requiresRun: true }],
    ['goal', 0],
  ]),
  level(1, 2, 'Penne Ridge', 'pasta', 280, [
    ['run', 10, { coins: 4, tutorial: 'move', deco: 'windmill' }],
    ['run', 4, { tutorial: 'jump' }],
    ['gap', 4, { arc: 5 }],
    ['run', 12, { enemy: 'meatball', tutorial: 'stomp' }],
    ['gap', 5, { mover: 1, safeGround: true, period: 4 }],
    ['run', 4],
    ['steps', 3],
    ['run', 12, { coins: 4, tutorial: 'run', item: 'basil' }],
    ['gap', 6.5, { arc: 5, requiresRun: true }],
    ['checkpoint', 0],
    ['river', 10],
    ['blocks', 3, { enemy: 'meatball' }],
    ['gap', 7.5, { mover: 1, arc: 5, requiresRun: true, period: 5 }],
    ['run', 5],
    ['pillars', 3],
    ['goal', 0],
  ]),
];
