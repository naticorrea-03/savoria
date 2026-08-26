const level = (world, idx, name, theme, time, segs) => ({ id: `${world}-${idx}`, world, idx, name, theme, time, segs });

export const WORLD_ONE = {
  n: 1,
  name: 'Pasta Plains',
  cuisine: 'Italian Cuisine',
  theme: 'pasta',
  thumb: 'assets/sprites/world1_thumb.png',
};

export const WORLD_ONE_LEVELS = [
  level(1, 1, 'Farfalle Fields', 'pasta', 260, [
    ['run', 12, { coins: 4, deco: 'cypress' }],
    ['roll', 16, { coins: 1 }],
    ['run', 10, { enemy: 'meatball', deco: 'windmill', decoS: 1.2 }],
    ['gap', 4, { arc: 5 }],
    ['blocks', 3],
    ['bonus', 0],
    ['checkpoint', 0],
    ['river', 10],
    ['roll', 14, { coins: 1, enemy: 'meatball' }],
    ['gap', 5, { arc: 5 }],
    ['run', 10, { coins: 4, deco: 'cypress' }],
    ['goal', 0],
  ]),
  level(1, 2, 'Penne Ridge', 'pasta', 280, [
    ['run', 10, { coins: 3, deco: 'windmill' }],
    ['roll', 14, { enemy: 'meatball' }],
    ['run', 8, { pillar: 3.4 }],
    ['gap', 5, { arc: 5 }],
    ['steps', 2],
    ['tier', 16, { item: 'boost' }],
    ['checkpoint', 0],
    ['steps', 2, { dir: -1 }],
    ['river', 14, { flyer: 1 }],
    ['blocks', 4, { enemy: 'meatball' }],
    ['gap', 6, { mover: 1, arc: 4 }],
    ['pillars', 3],
    ['goal', 0],
  ]),
];
