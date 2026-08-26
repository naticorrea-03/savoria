const D = 10;

const TUTORIAL_TEXT = Object.freeze({
  move: 'Move',
  jump: 'Jump',
  run: 'Hold Shift to run',
  stomp: 'Stomp from above',
});

export function compileSegments(def) {
  const out = {
    boxes: [], movers: [], hazards: [], coins: [], items: [], enemies: [], deco: [], doors: [],
    tutorials: [], requiredJumps: [],
    spawn: [2, 4, 0], checkpoint: null, goal: null, boss: null, killY: -9,
    time: def.time || 300,
  };
  let x = 0, g = 0;
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

  const addRequiredJump = (sourceIndex, kind, takeoffX, distance, opts = {}) => {
    out.requiredJumps.push({
      id: `${def.id}:${sourceIndex}:${out.requiredJumps.length}`,
      sourceIndex,
      kind,
      takeoffX,
      distance,
      requiresRun: opts.requiresRun === true,
      movingPlatform: opts.movingPlatform === true,
      hazard: opts.hazard === true,
    });
  };

  for (const [sourceIndex, seg] of def.segs.entries()) {
    const [kind, a, opts = {}] = seg;
    if (opts.tutorial) {
      const text = TUTORIAL_TEXT[opts.tutorial];
      if (text && !out.tutorials.some((tutorial) => tutorial.id === opts.tutorial)) {
        out.tutorials.push({ id: opts.tutorial, text, x });
      }
    }
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
      if (opts.pillar) out.boxes.push([x0 + len / 2, g + (opts.pillar / 2), 0, 2.4, opts.pillar, D * 0.7, 'pillar']);
      if (opts.ledge) {
        out.boxes.push([x0 + len / 2, g + 3.6, 0, 5, 0.9, 6, 'plat']);
        coinsOver(x0 + len / 2 - 2, 3, g + 5.3, 2);
      }
    } else if (kind === 'gap') {
      const len = a;
      if (opts.arc) arcOver(x, len, opts.arc);
      if (opts.plat) out.boxes.push([x + len / 2, g - 0.4, 0, 3.2, 0.9, 7, 'plat']);
      if (opts.safeGround) {
        out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, 'ground2']);
      }
      if (opts.mover) {
        const moverY = opts.safeGround ? g + 1.1 : g - 0.4;
        out.movers.push({
          box: [x + 2, moverY, 0, 3.4, 0.8, 6, 'plat'],
          to: [len - 4, 0, 0],
          period: opts.period || 4,
          sourceX: x,
          safe: opts.safeGround === true,
          hazard: opts.safeGround !== true,
        });
      }
      if (opts.flyer) out.enemies.push({ t: 'flyer', p: [x + len / 2, g + 3, 0], range: Math.min(len / 2, 6), axis: 'x' });
      if (opts.mover) {
        const approach = Math.max(0, (len - 3.4) / 2);
        addRequiredJump(sourceIndex, kind, x, approach, {
          requiresRun: opts.requiresRun,
          movingPlatform: true,
          hazard: !opts.safeGround,
        });
        addRequiredJump(sourceIndex, kind, x + len / 2, approach, {
          requiresRun: opts.requiresRun,
          movingPlatform: true,
          hazard: !opts.safeGround,
        });
      } else {
        addRequiredJump(sourceIndex, kind, x, len, {
          requiresRun: opts.requiresRun,
          hazard: !opts.safeGround,
        });
      }
      x += len;
    } else if (kind === 'rise') {
      g += a;
    } else if (kind === 'steps') {
      const n = a, dir = opts.dir || 1;
      for (let i = 0; i < n; i++) {
        if (dir > 0) g += 1.4;
        addRequiredJump(sourceIndex, kind, x, 3, opts);
        out.boxes.push([x + 1.5, g - 2, 0, 3, 4, D, i % 2 ? 'ground2' : 'brick']);
        if (dir < 0) g -= 1.4;
        x += 3;
      }
      g = Math.round(g * 10) / 10;
    } else if (kind === 'river') {
      const len = a;
      out.hazards.push([x + len / 2, g - 3.4, 0, len, D + 4]);
      const hops = Math.max(1, Math.round(len / 5));
      for (let i = 1; i <= hops; i++) {
        const hx = x + (len * i) / (hops + 1);
        out.boxes.push([hx, g - 0.3 + (i % 2) * 0.7, 0, 3, 0.9, 6, 'plat']);
        out.coins.push([hx, g + 1.8 + (i % 2) * 0.7, 0]);
      }
      const centerSpacing = len / (hops + 1);
      const landingGap = Math.max(0, centerSpacing - 1.5);
      for (let i = 0; i <= hops; i++) {
        addRequiredJump(sourceIndex, kind, x + centerSpacing * i, landingGap, {
          hazard: true,
        });
      }
      if (opts.flyer) out.enemies.push({ t: 'flyer', p: [x + len / 2, g + 4, 0], range: len / 2 - 2, axis: 'x' });
      x += len;
    } else if (kind === 'plats') {
      const n = a;
      for (let i = 0; i < n; i++) {
        const px = x + 2 + i * 5;
        const py = g + (i % 2) * 1.6;
        out.boxes.push([px, py - 0.4, 0, 3.4, 0.9, 6, 'plat']);
        if (opts.coins) out.coins.push([px, py + 1.6, 0]);
      }
      x += 2 + n * 5;
    } else if (kind === 'roll') {
      let remaining = a, i = 0;
      while (remaining > 0) {
        const w = Math.min(4 + (i % 2), remaining);
        out.boxes.push([x + w / 2, g - 2.5, 0, w, 5, D, i % 2 ? 'ground2' : 'ground']);
        if (opts.coins && i % 2 === 1) out.coins.push([x + w / 2, g + 1.4, 0]);
        if (opts.enemy && i === 2) out.enemies.push({ t: opts.enemy, p: [x + w / 2, g + 0.4, 0], range: 2, axis: 'x' });
        x += w; remaining -= w; i++;
        g += (i % 2 ? 0.5 : -0.5) * (i % 4 === 3 ? 2 : 1);
      }
      g = Math.round(g * 2) / 2;
    } else if (kind === 'blocks') {
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
      const len = a;
      out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, 'ground']);
      out.boxes.push([x + len / 2, g + 3.3, 0, len * 0.72, 1, 6, 'plat']);
      coinsOver(x + len / 2 - 4, 5, g + 4.9, 2);
      out.enemies.push({ t: opts.enemy || 'meatball', p: [x + len / 2, g + 0.4, 0], range: Math.max(1.5, len / 2 - 3), axis: 'x' });
      if (opts.item) out.items.push({ t: opts.item, p: [x + len / 2, g + 4.6, 0] });
      x += len;
    } else if (kind === 'pillars') {
      const n = a;
      let top = g + 1.2;
      for (let i = 0; i < n; i++) {
        addRequiredJump(sourceIndex, kind, x, i === 0 ? 1.75 : 2.5, opts);
        out.boxes.push([x + 1.75, top - 6, 0, 3.5, 12, 6.5, i % 2 ? 'ground2' : 'brick']);
        out.coins.push([x + 1.75, top + 1.4, 0]);
        if (i < n - 1) out.coins.push([x + 4.4, top + 2.4, 0]);
        x += 6;
        top += (i % 3 === 2 ? -1.1 : 1.1);
      }
      g = Math.round((top - (n % 3 === 0 ? 0 : 1.1)) * 2) / 2;
      out.boxes.push([x + 3, g - 2.5, 0, 6, 5, D, 'ground']);
      x += 6;
    } else if (kind === 'bonus') {
      const len = 10;
      out.boxes.push([x + len / 2, g - 2.5, 0, len, 5, D, 'ground2']);
      const vx = x, vy = g + 26;
      out.boxes.push([vx + 9, vy - 1.5, 0, 22, 2.4, 8, 'brick']);
      for (let i = 0; i < 12; i++) out.coins.push([vx + 1.5 + (i % 6) * 2.7, vy + 1.4 + Math.floor(i / 6) * 2.1, 0]);
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

export function compileLevel(definition, theme) {
  const built = compileSegments({ ...definition, themeDeco0: theme.deco[0] });
  return {
    ...built,
    id: definition.id,
    world: definition.world,
    index: definition.idx,
    title: definition.name,
    displayName: `${definition.world}-${definition.idx} ${definition.name}`,
    theme,
  };
}
