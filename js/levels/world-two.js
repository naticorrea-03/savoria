const level = (world, idx, name, theme, time, segs) => ({
  id: `${world}-${idx}`,
  world,
  idx,
  name,
  theme,
  time,
  segs,
});

export const WORLD_TWO = {
  n: 2,
  name: 'Sushi Shores',
  cuisine: 'Japanese Cuisine',
  theme: 'sushi',
  thumb: 'assets/sprites/world2_thumb.png',
  mapBackground: 'assets/world2/world-map-background.png',
};

export const WORLD_TWO_LEVELS = [
  level(2, 1, 'Nori Narrows', 'sushi', 260, [
    ['run', 12, { coins: 4, deco: 'sakura' }],
    ['gap', 4, { arc: 4 }],
    ['roll', 16, { coins: 1, enemy: 'meatball' }],
    ['run', 8, { shooter: 1, deco: 'archgate', decoS: 1.1 }],
    ['river', 12],
    ['bonus', 0],
    ['checkpoint', 0],
    ['plats', 4, { coins: 1 }],
    ['tier', 14, { item: 'speed' }],
    ['gap', 6, { mover: 1 }],
    ['run', 10, { coins: 4, deco: 'sakura', decoS: 1.3 }],
    ['goal', 0],
  ]),
  level(2, 2, 'Wasabi Falls', 'sushi', 280, [
    ['run', 10, { coins: 3, deco: 'archgate' }],
    ['steps', 3],
    ['blocks', 4, { enemy: 'meatball' }],
    ['river', 16, { flyer: 1 }],
    ['run', 8, { item: 'shield', deco: 'bamboo', decoS: 1.4 }],
    ['checkpoint', 0],
    ['gap', 6, { plat: 1, arc: 5 }],
    ['roll', 14, { enemy: 'meatball' }],
    ['plats', 5, { coins: 1 }],
    ['pillars', 3],
    ['goal', 0],
  ]),
];
