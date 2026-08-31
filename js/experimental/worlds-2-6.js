const level = (world, idx, name, theme, time, segs) => ({ id: `${world}-${idx}`, world, idx, name, theme, time, segs });

export const EXPERIMENTAL_WORLDS = [
  { n: 3, name: 'Taco Territory', cuisine: 'Mexican Cuisine', theme: 'taco', thumb: 'assets/sprites/world3_thumb.png' },
  { n: 4, name: 'Curry Cliffs', cuisine: 'Indian Cuisine', theme: 'curry', thumb: 'assets/sprites/world4_thumb.png' },
  { n: 5, name: 'Dumpling Dynasty', cuisine: 'Chinese Cuisine', theme: 'dumpling', thumb: 'assets/sprites/world5_thumb.png' },
  { n: 6, name: 'Dessert Dome', cuisine: 'Sweet Cuisine', theme: 'dessert', thumb: 'assets/sprites/world6_thumb.png' },
];

export const EXPERIMENTAL_LEVELS = [
  level(3, 1, 'Guaca Mesa', 'taco', 260, [
    ['run', 12, { coins: 4, deco: 'cactus' }], ['roll', 16, { coins: 1, enemy: 'meatball' }], ['gap', 5, { arc: 5 }], ['steps', 3], ['tier', 14, { item: 'boost' }], ['river', 12, { flyer: 1 }], ['bonus', 0], ['checkpoint'], ['run', 8, { shooter: 1 }], ['gap', 7, { mover: 1, arc: 4 }], ['blocks', 4, { enemy: 'meatball' }], ['pillars', 3], ['goal'],
  ]),
  level(3, 2, 'Salsa Rapids', 'taco', 280, [
    ['run', 10, { coins: 3, deco: 'cactus' }], ['river', 14], ['roll', 12, { enemy: 'meatball' }], ['steps', 3], ['run', 8, { shooter: 1, item: 'shield' }], ['checkpoint'], ['river', 18, { flyer: 1 }], ['run', 8, { pillar: 3.4, enemy: 'meatball' }], ['gap', 8, { mover: 1, period: 3.5, arc: 5 }], ['tier', 14, {}], ['pillars', 4], ['goal'],
  ]),
  level(4, 1, 'Turmeric Terraces', 'curry', 260, [
    ['run', 12, { coins: 4, deco: 'dome' }], ['steps', 2], ['roll', 14, { coins: 1 }], ['steps', 2], ['tier', 14, { enemy: 'meatball', item: 'speed' }], ['steps', 2, { dir: -1 }], ['gap', 5, { arc: 5 }], ['bonus', 0], ['checkpoint'], ['river', 12, { flyer: 1 }], ['blocks', 4, { enemy: 'meatball' }], ['plats', 4, { coins: 1 }], ['run', 8, { coins: 4 }], ['goal'],
  ]),
  level(4, 2, 'Vindaloo Heights', 'curry', 280, [
    ['run', 10, { coins: 3, deco: 'dome' }], ['steps', 4], ['run', 8, { shooter: 1 }], ['gap', 6, { plat: 1, flyer: 1 }], ['roll', 12, { enemy: 'meatball' }], ['checkpoint'], ['steps', 4, { dir: -1 }], ['river', 16, { flyer: 1 }], ['run', 8, { pillar: 3.6, enemy: 'meatball' }], ['gap', 8, { mover: 1, arc: 5 }], ['pillars', 4], ['goal'],
  ]),
  level(5, 1, 'Bao Bridges', 'dumpling', 260, [
    ['run', 12, { coins: 4, deco: 'lantern' }], ['gap', 5, { arc: 5 }], ['roll', 16, { coins: 1, enemy: 'meatball' }], ['river', 14], ['tier', 14, { item: 'speed' }], ['bonus', 0], ['checkpoint'], ['plats', 5, { coins: 1 }], ['run', 8, { shooter: 1 }], ['gap', 6, { mover: 1 }], ['blocks', 4, { enemy: 'meatball' }], ['run', 8, { coins: 4, deco: 'bao', decoS: 1.3 }], ['goal'],
  ]),
  level(5, 2, 'Wonton Wall', 'dumpling', 280, [
    ['run', 10, { coins: 3, deco: 'lantern' }], ['run', 8, { pillar: 3.4, enemy: 'meatball' }], ['steps', 3], ['blocks', 4, { enemy: 'meatball' }], ['gap', 6, { plat: 1, arc: 4 }], ['run', 6, { item: 'shield' }], ['checkpoint'], ['river', 18, { flyer: 1 }], ['steps', 3, { dir: -1 }], ['roll', 14, { enemy: 'meatball' }], ['gap', 8, { mover: 1, period: 3.5, arc: 5 }], ['pillars', 4], ['goal'],
  ]),
  level(6, 1, 'Macaron Pass', 'dessert', 280, [
    ['run', 10, { coins: 4, deco: 'candycane' }], ['gap', 5, { arc: 5 }], ['roll', 16, { coins: 1, enemy: 'meatball' }], ['river', 14, { flyer: 1 }], ['run', 8, { shooter: 1, item: 'boost' }], ['bonus', 0], ['checkpoint'], ['steps', 3], ['blocks', 4, { enemy: 'meatball' }], ['plats', 5, { coins: 1 }], ['tier', 14, { enemy: 'meatball' }], ['gap', 7, { mover: 1, arc: 4 }], ['pillars', 4], ['goal'],
  ]),
  level(6, 2, "The Don's Dessert Keep", 'dessert', 300, [
    ['run', 10, { coins: 3, deco: 'candycane' }], ['roll', 12, { enemy: 'meatball' }], ['river', 12, { flyer: 1 }], ['run', 8, { enemy: 'meatball', item: 'shield' }], ['checkpoint'], ['boss'],
  ]),
];
