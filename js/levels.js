// Savoria 3D — six worlds, twelve side-scrolling levels, built from compact segment recipes.
// A level is a strip along +x. Ground height varies. Depth (z) is visual only.

export const THEMES = {
  pasta: {
    tint: 0xffffff, hazardTint: 0xffffff, melt: 0xd8341c,
    bg: 'assets/sprites/bg1.jpg',
    skyTop: 0x4fa4e8, skyBottom: 0xbfe2f8, fog: 0xf7d99a, fogFar: 150,
    sun: 0xfff2cc, sunPos: [40, 60, 25], ambient: 0xffe6c0,
    colors: { ground: 0xe2b04a, ground2: 0xcf9a35, plat: 0xf0d27a, brick: 0xc96a2e , top: 0xf2d488 },
    hazardColor: 0xc22f1d, hazardEmissive: 0x8a1205,
    hills: [0xd9b060, 0xc9a050], deco: ['cypress', 'windmill'],
    skyline: ['villa', 'campanile', 'cypress', 'windmill'],
  },
  sushi: {
    tint: 0xdcecd0, hazardTint: 0xd8b860, melt: 0x9ac858,
    bg: 'assets/sprites/bg2.jpg',
    skyTop: 0x8fd0f0, skyBottom: 0xffd9e8, fog: 0xf5dce8, fogFar: 150,
    sun: 0xfff0e0, sunPos: [30, 60, 30], ambient: 0xffe8f0,
    colors: { ground: 0xdcd4a8, ground2: 0x9aaa60, plat: 0xf08060, brick: 0x4a6a4a , top: 0xf0ead0 },
    hazardColor: 0xc89030, hazardEmissive: 0x705010,
    hills: [0xf0c0d8, 0xa8c8a0], deco: ['sakura', 'archgate', 'bamboo'],
    skyline: ['pagoda', 'archgate', 'sakura', 'bamboo'],
  },
  taco: {
    tint: 0xffb888, hazardTint: 0xff9070, melt: 0xe8a018,
    bg: 'assets/sprites/bg3.jpg',
    skyTop: 0x5a1c4e, skyBottom: 0xff8f3d, fog: 0xe8703a, fogFar: 140,
    sun: 0xffd9a8, sunPos: [-30, 40, 30], ambient: 0xe8c0a0,
    colors: { ground: 0xc98a52, ground2: 0x9c5e38, plat: 0xf0c070, brick: 0x7a4030 , top: 0xe8a058 },
    hazardColor: 0xff4a10, hazardEmissive: 0xdd2200,
    hills: [0xa9502a, 0x7a3820], deco: ['cactus', 'mesa'],
    skyline: ['adobe', 'cactus', 'mesa', 'volcano'],
  },
  curry: {
    tint: 0xffd898, hazardTint: 0xffa838, melt: 0xe07818,
    bg: 'assets/sprites/bg4.jpg',
    skyTop: 0xf0b860, skyBottom: 0xffe8b0, fog: 0xf0d8a0, fogFar: 145,
    sun: 0xfff0d0, sunPos: [35, 55, 25], ambient: 0xf8e0b8,
    colors: { ground: 0xd8a858, ground2: 0xb08040, plat: 0xe8c880, brick: 0x9a6830 , top: 0xf0cc80 },
    hazardColor: 0xd88018, hazardEmissive: 0x904800,
    hills: [0xc89850, 0xa87838], deco: ['dome', 'cypress'],
    skyline: ['palace', 'dome', 'cypress'],
  },
  dumpling: {
    tint: 0xf0d8b0, hazardTint: 0xe8c060, melt: 0xc03828,
    bg: 'assets/sprites/bg5.jpg',
    skyTop: 0xd06030, skyBottom: 0xffc880, fog: 0xf0b878, fogFar: 145,
    sun: 0xffe0b0, sunPos: [-25, 50, 30], ambient: 0xf0c8a0,
    colors: { ground: 0xc8a070, ground2: 0xa07848, plat: 0x98b060, brick: 0x8a3428 , top: 0xe8d0a8 },
    hazardColor: 0xd0a030, hazardEmissive: 0x785810,
    hills: [0x8a5838, 0x6a4028], deco: ['lantern', 'bao', 'bamboo'],
    skyline: ['pagoda', 'lantern', 'bao', 'bamboo'],
  },
  dessert: {
    tint: 0xffc8e4, hazardTint: 0x9a6a48, melt: 0xf06a9a,
    bg: 'assets/sprites/bg6.jpg',
    skyTop: 0xc890e0, skyBottom: 0xffd0e8, fog: 0xf0c8e0, fogFar: 145,
    sun: 0xfff0f8, sunPos: [30, 55, 30], ambient: 0xf8d8e8,
    colors: { ground: 0xf0b0cc, ground2: 0xd090b0, plat: 0xc08850, brick: 0x8a5a9a , top: 0xfae4f0 },
    hazardColor: 0x6a3a1a, hazardEmissive: 0x3a1a08,
    hills: [0xe8a8d0, 0xc890c0], deco: ['candycane', 'cupcake'],
    skyline: ['candycastle', 'cupcake', 'candycane'],
  },
};

// ── segment builder ────────────────────────────────────────────────────
// Depth of the play strip:
const D = 10;

function build(def) {
  const out = {
    boxes: [], movers: [], hazards: [], coins: [], items: [], enemies: [], deco: [], doors: [],
    spawn: [2, 4, 0], checkpoint: null, goal: null, boss: null, killY: -9,
    time: def.time || 300,
  };
  let x = 0, g = 0; // cursor, ground-top height
  const groundRun = (len, ck = 'ground') => {
    out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, ck]);
    return x + len;
  };
  const coinsOver = (cx, n, y, dx = 1.8) => {
    for (let i = 0; i < n; i++) out.coins.push([cx + i * dx, y, 0]);
  };
  const arcOver = (cx, len, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.coins.push([cx + t * len, g + 1.6 + Math.sin(t * Math.PI) * 2.4, 0]);
    }
  };

  for (const seg of def.segs) {
    const [kind, a, opts = {}] = seg;
    if (kind === 'run') {
      const len = a;
      const x0 = x;
      x = groundRun(len);
      if (opts.coins) coinsOver(x0 + len / 2 - opts.coins * 0.9, opts.coins, g + 1.5);
      if (opts.enemy) out.enemies.push({ t: opts.enemy, p: [x0 + len / 2, g + 0.4, 0], range: Math.max(1.5, Math.min(len / 2 - 3, 6)), axis: 'x' });
      if (opts.enemy2) out.enemies.push({ t: opts.enemy2, p: [x0 + len * 0.75, g + 0.4, 0], range: Math.min(len / 4, 4), axis: 'x' });
      if (opts.flyer) out.enemies.push({ t: 'flyer', p: [x0 + len / 2, g + 4.5, 0], range: Math.min(len / 2 - 1, 6), axis: 'x' });
      if (opts.shooter) out.enemies.push({ t: 'shooter', p: [x0 + len * (opts.shooterAt ?? 0.6), g + 0.4, 0] });
      if (opts.item) out.items.push({ t: opts.item, p: [x0 + len / 2, g + 1.2, 0] });
      if (opts.deco) out.deco.push({ t: opts.deco, p: [x0 + len * 0.5, g, -3.5], s: opts.decoS || 1 });
      if (opts.pillar) { // penne-pillar obstacle to hop
        out.boxes.push([x0 + len / 2, g + (opts.pillar / 2), 0, 2.4, opts.pillar, D * 0.7, 'pillar']);
      }
      if (opts.ledge) { // floating ledge with coins above the run
        out.boxes.push([x0 + len / 2, g + 3.6, 0, 5, 0.9, 6, 'plat']);
        coinsOver(x0 + len / 2 - 2, 3, g + 5.3, 2);
      }
    } else if (kind === 'gap') {
      const len = a;
      if (opts.arc) arcOver(x, len, opts.arc);
      if (opts.plat) out.boxes.push([x + len / 2, g - 0.4, 0, 3.2, 0.9, 7, 'plat']);
      if (opts.mover) out.movers.push({ box: [x + 2, g - 0.4, 0, 3.4, 0.8, 6, 'plat'], to: [len - 4, 0, 0], period: opts.period || 4 });
      if (opts.flyer) out.enemies.push({ t: 'flyer', p: [x + len / 2, g + 3, 0], range: Math.min(len / 2, 6), axis: 'x' });
      x += len;
    } else if (kind === 'rise') {
      g += a;
    } else if (kind === 'steps') {
      const n = a, dir = opts.dir || 1;
      for (let i = 0; i < n; i++) {
        if (dir > 0) g += 1.4;
        out.boxes.push([x + 1.5, g - 2, 0, 3, 4, D, i % 2 ? 'ground2' : 'brick']);
        if (dir < 0) g -= 1.4;
        x += 3;
      }
    } else if (kind === 'river') {
      const len = a;
      out.hazards.push([x + len / 2, g - 3.4, 0, len, D + 4]);
      const hops = Math.max(1, Math.round(len / 5) - 0);
      for (let i = 1; i <= hops; i++) {
        const hx = x + (len * i) / (hops + 1);
        out.boxes.push([hx, g - 0.3 + (i % 2) * 0.7, 0, 3, 0.9, 6, 'plat']);
        out.coins.push([hx, g + 1.8 + (i % 2) * 0.7, 0]);
      }
      if (opts.flyer) out.enemies.push({ t: 'flyer', p: [x + len / 2, g + 4, 0], range: len / 2 - 2, axis: 'x' });
      x += len;
    } else if (kind === 'plats') {
      const n = a; // floating platforms over a pit
      for (let i = 0; i < n; i++) {
        const px = x + 2 + i * 5;
        const py = g + (i % 2) * 1.6;
        out.boxes.push([px, py - 0.4, 0, 3.4, 0.9, 6, 'plat']);
        if (opts.coins) out.coins.push([px, py + 1.6, 0]);
      }
      x += 2 + n * 5;
    } else if (kind === 'roll') {
      // undulating ground: walkable bumps and dips, coins on the crests
      let remaining = a, i = 0;
      while (remaining > 0) {
        const w = Math.min(4 + (i % 2), remaining);
        out.boxes.push([x + w / 2, g - 2.5, 0, w, 5, D, i % 2 ? 'ground2' : 'ground']);
        if (opts.coins && i % 2 === 1) out.coins.push([x + w / 2, g + 1.4, 0]);
        if (opts.enemy && i === 2) out.enemies.push({ t: opts.enemy, p: [x + w / 2, g + 0.4, 0], range: 2, axis: 'x' });
        x += w; remaining -= w; i++;
        g += (i % 2 ? 0.5 : -0.5) * (i % 4 === 3 ? 2 : 1);   // small bumps, one bigger swell
      }
      g = Math.round(g * 2) / 2;
    } else if (kind === 'blocks') {
      // floating brick clusters over solid ground, coins on top
      // clear runway at both ends so jump arcs into/out of the segment never bonk
      const n = a, span = n * 3.2 + 8;
      out.boxes.push([x + span / 2, g - 2.5, 0, span, 5, D, 'ground']);
      for (let i = 0; i < n; i++) {
        const bx = x + 4.5 + i * 3.2;
        out.boxes.push([bx, g + 3.1, 0, 2.3, 1.1, 4.5, 'brick']);
        out.coins.push([bx, g + 4.7, 0]);
      }
      if (opts.enemy) out.enemies.push({ t: opts.enemy, p: [x + span / 2, g + 0.4, 0], range: Math.max(1.5, span / 2 - 3.5), axis: 'x' });
      x += span;
    } else if (kind === 'tier') {
      // double-decker: low road with trouble, high road with treasure
      const len = a;
      out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, 'ground']);
      out.boxes.push([x + len / 2, g + 3.3, 0, len * 0.72, 1, 6, 'plat']);
      coinsOver(x + len / 2 - 4, 5, g + 4.9, 2);
      out.enemies.push({ t: opts.enemy || 'meatball', p: [x + len / 2, g + 0.4, 0], range: Math.max(1.5, len / 2 - 3), axis: 'x' });
      if (opts.item) out.items.push({ t: opts.item, p: [x + len / 2, g + 4.6, 0] });
      x += len;
    } else if (kind === 'pillars') {
      // tall pillar-hop finale; coins trace the arcs
      const n = a;
      let top = g + 1.2;
      for (let i = 0; i < n; i++) {
        out.boxes.push([x + 1.75, top - 6, 0, 3.5, 12, 6.5, i % 2 ? 'ground2' : 'brick']);
        out.coins.push([x + 1.75, top + 1.4, 0]);
        if (i < n - 1) out.coins.push([x + 4.4, top + 2.4, 0]);
        x += 6;
        top += (i % 3 === 2 ? -1.1 : 1.1);
      }
      g = Math.round((top - (n % 3 === 0 ? 0 : 1.1)) * 2) / 2;
      out.boxes.push([x + 3, g - 2.5, 0, 6, 5, D, 'ground']);   // landing shelf
      x += 6;
    } else if (kind === 'bonus') {
      // glowing door → coin vault in the clouds → door back, a bit further on
      const len = 10;
      out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, 'ground2']);
      const vx = x, vy = g + 26;
      out.boxes.push([vx + 9, vy - 1.5, 0, 22, 2.4, 8, 'brick']);
      for (let i = 0; i < 12; i++)
        out.coins.push([vx + 1.5 + (i % 6) * 2.7, vy + 1.4 + Math.floor(i / 6) * 2.1, 0]);
      out.items.push({ t: opts.item || 'basil', p: [vx + 17.5, vy + 1, 0] });
      out.doors.push({ at: [x + 3, g], to: [vx + 0.8, vy + 0.3] });
      out.doors.push({ at: [vx + 18.3, vy - 0.3], to: [x + len - 1.5, g] });
      x += len;
    } else if (kind === 'checkpoint') {
      x = groundRun(6, 'ground2');
      out.checkpoint = [x - 3, g + 0.2, 0];
    } else if (kind === 'goal') {
      x = groundRun(12);
      out.goal = [x - 5, g, 0];
      out.deco.push({ t: def.themeDeco0 || 'cypress', p: [x - 10, g, -3.5] });
    } else if (kind === 'boss') {
      const len = 46;
      const x0 = x;
      x = groundRun(len);
      // arena walls
      out.boxes.push([x0 + 1, g + 3, 0, 2, 6, D, 'brick']);
      out.boxes.push([x - 1, g + 3, 0, 2, 6, D, 'brick']);
      out.boss = { p: [x0 + len * 0.65, g + 2.4, 0], hp: 3, arena: [x0 + len / 2, g, 0, len - 8, D] };
      coinsOver(x0 + 6, 4, g + 1.5, 2.2);
      coinsOver(x - 14, 4, g + 1.5, 2.2);
      out.items.push({ t: 'basil', p: [x0 + 5, g + 1.2, 0] });
    }
  }
  out.length = x;
  return out;
}

// ── level definitions ──────────────────────────────────────────────────
const L = (world, idx, name, theme, time, segs) => ({ id: `${world}-${idx}`, world, idx, name, theme, time, segs });

export const WORLDS = [
  { n: 1, name: 'Pasta Plains', cuisine: 'Italian Cuisine', theme: 'pasta', thumb: 'assets/sprites/world1_thumb.png' },
  { n: 2, name: 'Sushi Shores', cuisine: 'Japanese Cuisine', theme: 'sushi', thumb: 'assets/sprites/world2_thumb.png' },
  { n: 3, name: 'Taco Territory', cuisine: 'Mexican Cuisine', theme: 'taco', thumb: 'assets/sprites/world3_thumb.png' },
  { n: 4, name: 'Curry Cliffs', cuisine: 'Indian Cuisine', theme: 'curry', thumb: 'assets/sprites/world4_thumb.png' },
  { n: 5, name: 'Dumpling Dynasty', cuisine: 'Chinese Cuisine', theme: 'dumpling', thumb: 'assets/sprites/world5_thumb.png' },
  { n: 6, name: 'Dessert Dome', cuisine: 'Sweet Cuisine', theme: 'dessert', thumb: 'assets/sprites/world6_thumb.png' },
];

export const LEVELS = [
  L(1, 1, 'Farfalle Fields', 'pasta', 260, [
    ['run', 12, { coins: 4, deco: 'cypress' }],
    ['roll', 16, { coins: 1 }],
    ['run', 10, { enemy: 'meatball', deco: 'windmill', decoS: 1.2 }],
    ['gap', 4, { arc: 5 }],
    ['blocks', 3],
    ['bonus', 0],
    ['checkpoint'],
    ['river', 10],
    ['roll', 14, { coins: 1, enemy: 'meatball' }],
    ['gap', 5, { arc: 5 }],
    ['run', 10, { coins: 4, deco: 'cypress' }],
    ['goal'],
  ]),
  L(1, 2, 'Penne Ridge', 'pasta', 280, [
    ['run', 10, { coins: 3, deco: 'windmill' }],
    ['roll', 14, { enemy: 'meatball' }],
    ['run', 8, { pillar: 3.4 }],
    ['gap', 5, { arc: 5 }],
    ['steps', 2],
    ['tier', 16, { item: 'boost' }],
    ['checkpoint'],
    ['steps', 2, { dir: -1 }],
    ['river', 14, { flyer: 1 }],
    ['blocks', 4, { enemy: 'meatball' }],
    ['gap', 6, { mover: 1, arc: 4 }],
    ['pillars', 3],
    ['goal'],
  ]),
  L(2, 1, 'Nori Narrows', 'sushi', 260, [
    ['run', 12, { coins: 4, deco: 'sakura' }],
    ['gap', 4, { arc: 4 }],
    ['roll', 16, { coins: 1, enemy: 'meatball' }],
    ['run', 8, { shooter: 1, deco: 'archgate', decoS: 1.1 }],
    ['river', 12],
    ['bonus', 0],
    ['checkpoint'],
    ['plats', 4, { coins: 1 }],
    ['tier', 14, { item: 'speed' }],
    ['gap', 6, { mover: 1 }],
    ['run', 10, { coins: 4, deco: 'sakura', decoS: 1.3 }],
    ['goal'],
  ]),
  L(2, 2, 'Wasabi Falls', 'sushi', 280, [
    ['run', 10, { coins: 3, deco: 'archgate' }],
    ['steps', 3],
    ['blocks', 4, { enemy: 'meatball' }],
    ['river', 16, { flyer: 1 }],
    ['run', 8, { item: 'shield', deco: 'bamboo', decoS: 1.4 }],
    ['checkpoint'],
    ['gap', 6, { plat: 1, arc: 5 }],
    ['roll', 14, { enemy: 'meatball' }],
    ['plats', 5, { coins: 1 }],
    ['pillars', 3],
    ['goal'],
  ]),
  L(3, 1, 'Guaca Mesa', 'taco', 260, [
    ['run', 12, { coins: 4, deco: 'cactus' }],
    ['roll', 16, { coins: 1, enemy: 'meatball' }],
    ['gap', 5, { arc: 5 }],
    ['steps', 3],
    ['tier', 14, { item: 'boost' }],
    ['river', 12, { flyer: 1 }],
    ['bonus', 0],
    ['checkpoint'],
    ['run', 8, { shooter: 1 }],
    ['gap', 7, { mover: 1, arc: 4 }],
    ['blocks', 4, { enemy: 'meatball' }],
    ['pillars', 3],
    ['goal'],
  ]),
  L(3, 2, 'Salsa Rapids', 'taco', 280, [
    ['run', 10, { coins: 3, deco: 'cactus' }],
    ['river', 14],
    ['roll', 12, { enemy: 'meatball' }],
    ['steps', 3],
    ['run', 8, { shooter: 1, item: 'shield' }],
    ['checkpoint'],
    ['river', 18, { flyer: 1 }],
    ['run', 8, { pillar: 3.4, enemy: 'meatball' }],
    ['gap', 8, { mover: 1, period: 3.5, arc: 5 }],
    ['tier', 14, {}],
    ['pillars', 4],
    ['goal'],
  ]),
  L(4, 1, 'Turmeric Terraces', 'curry', 260, [
    ['run', 12, { coins: 4, deco: 'dome' }],
    ['steps', 2],
    ['roll', 14, { coins: 1 }],
    ['steps', 2],
    ['tier', 14, { enemy: 'meatball', item: 'speed' }],
    ['steps', 2, { dir: -1 }],
    ['gap', 5, { arc: 5 }],
    ['bonus', 0],
    ['checkpoint'],
    ['river', 12, { flyer: 1 }],
    ['blocks', 4, { enemy: 'meatball' }],
    ['plats', 4, { coins: 1 }],
    ['run', 8, { coins: 4 }],
    ['goal'],
  ]),
  L(4, 2, 'Vindaloo Heights', 'curry', 280, [
    ['run', 10, { coins: 3, deco: 'dome' }],
    ['steps', 4],
    ['run', 8, { shooter: 1 }],
    ['gap', 6, { plat: 1, flyer: 1 }],
    ['roll', 12, { enemy: 'meatball' }],
    ['checkpoint'],
    ['steps', 4, { dir: -1 }],
    ['river', 16, { flyer: 1 }],
    ['run', 8, { pillar: 3.6, enemy: 'meatball' }],
    ['gap', 8, { mover: 1, arc: 5 }],
    ['pillars', 4],
    ['goal'],
  ]),
  L(5, 1, 'Bao Bridges', 'dumpling', 260, [
    ['run', 12, { coins: 4, deco: 'lantern' }],
    ['gap', 5, { arc: 5 }],
    ['roll', 16, { coins: 1, enemy: 'meatball' }],
    ['river', 14],
    ['tier', 14, { item: 'speed' }],
    ['bonus', 0],
    ['checkpoint'],
    ['plats', 5, { coins: 1 }],
    ['run', 8, { shooter: 1 }],
    ['gap', 6, { mover: 1 }],
    ['blocks', 4, { enemy: 'meatball' }],
    ['run', 8, { coins: 4, deco: 'bao', decoS: 1.3 }],
    ['goal'],
  ]),
  L(5, 2, 'Wonton Wall', 'dumpling', 280, [
    ['run', 10, { coins: 3, deco: 'lantern' }],
    ['run', 8, { pillar: 3.4, enemy: 'meatball' }],
    ['steps', 3],
    ['blocks', 4, { enemy: 'meatball' }],
    ['gap', 6, { plat: 1, arc: 4 }],
    ['run', 6, { item: 'shield' }],
    ['checkpoint'],
    ['river', 18, { flyer: 1 }],
    ['steps', 3, { dir: -1 }],
    ['roll', 14, { enemy: 'meatball' }],
    ['gap', 8, { mover: 1, period: 3.5, arc: 5 }],
    ['pillars', 4],
    ['goal'],
  ]),
  L(6, 1, 'Macaron Pass', 'dessert', 280, [
    ['run', 10, { coins: 4, deco: 'candycane' }],
    ['gap', 5, { arc: 5 }],
    ['roll', 16, { coins: 1, enemy: 'meatball' }],
    ['river', 14, { flyer: 1 }],
    ['run', 8, { shooter: 1, item: 'boost' }],
    ['bonus', 0],
    ['checkpoint'],
    ['steps', 3],
    ['blocks', 4, { enemy: 'meatball' }],
    ['plats', 5, { coins: 1 }],
    ['tier', 14, { enemy: 'meatball' }],
    ['gap', 7, { mover: 1, arc: 4 }],
    ['pillars', 4],
    ['goal'],
  ]),
  L(6, 2, "The Don's Dessert Keep", 'dessert', 300, [
    ['run', 10, { coins: 3, deco: 'candycane' }],
    ['roll', 12, { enemy: 'meatball' }],
    ['river', 12, { flyer: 1 }],
    ['run', 8, { enemy: 'meatball', item: 'shield' }],
    ['checkpoint'],
    ['boss'],
  ]),
];

export function buildLevel(def) {
  const theme = THEMES[def.theme];
  const built = build({ ...def, themeDeco0: theme.deco[0] });
  return { ...built, id: def.id, name: `${def.world}-${def.idx} ${def.name}`, theme, themeDecos: theme.deco };
}
