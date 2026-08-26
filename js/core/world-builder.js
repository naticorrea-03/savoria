import { AABB } from './aabb.js';

const TILES = {
  top: 'assets/sprites/tile_top.png',
  fill: 'assets/sprites/tile_fill.png',
  wall: 'assets/sprites/tile_wall.png',
  plat: 'assets/sprites/tile_plat.png',
  river: 'assets/sprites/tile_river.png',
  pillar: 'assets/sprites/tile_pillar.png',
};
const PROPS = ['assets/sprites/bush.png', 'assets/sprites/grass_tuft.png',
  'assets/sprites/pasta_plant.png', 'assets/sprites/small_mushroom.png'];

const SPRITES = {
  meatball: 'assets/sprites/meatball_walker.png',
  flyer: 'assets/sprites/pesto_flyer.png',
  shooter: 'assets/sprites/marinara_shooter.png',
  boss: 'assets/sprites/don_funghi.png',
  tomato: 'assets/sprites/tomato.png',
  basil: 'assets/sprites/basil_leaf.png',
  speed: 'assets/sprites/speed_pasta.png',
  shield: 'assets/sprites/parmesan_shield.png',
  boost: 'assets/sprites/basil_boost.png',
};

export const WORLD_ONE_ASSETS = [...new Set([
  ...Object.values(TILES),
  ...PROPS,
  ...Object.values(SPRITES),
  'assets/sprites/goal_archway.png',
  'assets/sprites/start_signpost.png',
])];

function createWorldTools(THREE) {
  function skyTexture(top, bottom) {
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#' + top.toString(16).padStart(6, '0'));
    grad.addColorStop(1, '#' + bottom.toString(16).padStart(6, '0'));
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeSprite(textures, path, w, h) {
    const m = new THREE.SpriteMaterial({ map: textures.texture(path), transparent: true, alphaTest: 0.1 });
    const s = new THREE.Sprite(m);
    s.scale.set(w, h, 1);
    return s;
  }

  const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

  // six-face material set for painted terrain boxes: lasagna sides, basil-lasagna top.
  // World-aligned offsets keep the pattern continuous across adjacent boxes.
  function groundMats(textures, x, y, z, w, h, d, tint) {
    const side = (rw, o) => new THREE.MeshLambertMaterial({ color: tint, map: textures.tiled(TILES.fill, rw / 4, h / 4, o / 4, y / 4) });
    const top = new THREE.MeshLambertMaterial({ color: tint, map: textures.tiled(TILES.top, w / 4, d / 4, (x - w / 2) / 4, (z - d / 2) / 4) });
    const bottom = mat(0x554433);
    return [side(d, z - d / 2), side(d, z - d / 2), top, bottom, side(w, x - w / 2), side(w, x - w / 2)];
  }

  // ── Decoration builders (one per world flavor) ─────────────────────────
  function buildDeco(t, s = 1) {
    const g = new THREE.Group();
    if (t === 'cypress') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.2 * s, 6), mat(0x6b4423));
      trunk.position.y = 0.6 * s; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - i * 0.28) * s, 1.6 * s, 8), mat(i % 2 ? 0x3f7d3b : 0x4f9448));
        cone.position.y = (1.4 + i * 1.05) * s; cone.castShadow = true; g.add(cone);
      }
    } else if (t === 'windmill') {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.3 * s, 4.5 * s, 8), mat(0xe8d5a8));
      tower.position.y = 2.25 * s; tower.castShadow = true; g.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 1.2 * s, 8), mat(0xc0392b));
      roof.position.y = 5.1 * s; g.add(roof);
      const blades = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 2.6 * s, 0.06), mat(0xf5e6c4));
        b.position.y = 1.3 * s;
        const pivot = new THREE.Group(); pivot.add(b); pivot.rotation.z = (i * Math.PI) / 2;
        blades.add(pivot);
      }
      blades.position.set(0, 4.4 * s, 1.05 * s);
      g.add(blades); g.userData.spin = blades;
    } else if (t === 'sakura') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 2.2 * s, 6), mat(0x6b4030));
      trunk.position.y = 1.1 * s; trunk.castShadow = true; g.add(trunk);
      [[0, 2.9, 0, 1.4], [-0.9, 2.4, 0.2, 0.9], [0.9, 2.5, -0.2, 1]].forEach(([x, y, z, r]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r * s, 10, 8), mat(0xf0aac8));
        puff.position.set(x * s, y * s, z * s); puff.castShadow = true; g.add(puff);
      });
    } else if (t === 'archgate') {
      // festival arch with pennant flags
      for (const dx of [-1.6, 1.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.22 * s, 3.4 * s, 8), mat(0xc0392b));
        post.position.set(dx * s, 1.7 * s, 0); post.castShadow = true; g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.4 * s, 0.35 * s, 0.5 * s), mat(0xa8281a));
      beam.position.y = 3.4 * s; beam.castShadow = true; g.add(beam);
      const beam2 = new THREE.Mesh(new THREE.BoxGeometry(3.6 * s, 0.28 * s, 0.4 * s), mat(0xc0392b));
      beam2.position.y = 2.7 * s; g.add(beam2);
    } else if (t === 'cactus') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45 * s, 1.8 * s, 4, 8), mat(0x4a8a3a));
      body.position.y = 1.35 * s; body.castShadow = true; g.add(body);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s, 0.8 * s, 4, 8), mat(0x559949));
      arm.position.set(0.62 * s, 1.5 * s, 0); arm.rotation.z = -0.5; g.add(arm);
    } else if (t === 'mesa') {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry((2.6 - i * 0.5) * s, (3.1 - i * 0.5) * s, 1.6 * s, 9), mat(i % 2 ? 0x94401f : 0xa9502a));
        m.position.y = (0.8 + i * 1.6) * s; m.castShadow = true; g.add(m);
      }
    } else if (t === 'dome') {
      // golden palace dome on a drum
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * s, 1.2 * s, 1.6 * s, 10), mat(0xe8d0a0));
      drum.position.y = 0.8 * s; drum.castShadow = true; g.add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25 * s, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8b040, metalness: 0.5, roughness: 0.4 }));
      dome.position.y = 2.2 * s; dome.scale.y = 1.15; dome.castShadow = true; g.add(dome);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.9 * s, 6), mat(0xc89020));
      spike.position.y = 3.9 * s; g.add(spike);
    } else if (t === 'lantern') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 3.4 * s, 6), mat(0x6a3020));
      pole.position.y = 1.7 * s; g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 0.12 * s, 0.12 * s), mat(0x6a3020));
      arm.position.set(0.6 * s, 3.3 * s, 0); g.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe83020, emissive: 0xa01808 }));
      lamp.position.set(1.2 * s, 2.75 * s, 0); lamp.scale.y = 1.25; g.add(lamp);
    } else if (t === 'bao') {
      // plump steamed bun with pleated top
      const bun = new THREE.Mesh(new THREE.SphereGeometry(1.3 * s, 12, 10), mat(0xf2e6d0));
      bun.position.y = 1 * s; bun.scale.y = 0.85; bun.castShadow = true; g.add(bun);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 8, 6), mat(0xe0d0b8));
      knot.position.y = 2.05 * s; g.add(knot);
    } else if (t === 'candycane') {
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.55 * s, 8), mat(i % 2 ? 0xe03030 : 0xf8f0f0));
        seg.position.y = (0.28 + i * 0.55) * s; seg.castShadow = true; g.add(seg);
      }
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.55 * s, 0.2 * s, 8, 12, Math.PI), mat(0xe03030));
      hook.position.y = 3.3 * s; hook.rotation.y = Math.PI / 2; g.add(hook);
    } else if (t === 'villa') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2 * s, 1.7 * s, 1.7 * s), mat(0xf0e2c0));
      base.position.y = 0.85 * s; base.castShadow = true; g.add(base);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 1.65 * s, 1.1 * s, 4), mat(0xc0442a));
      roof.position.y = 2.25 * s; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.85 * s, 0.1), mat(0x5a3620));
      door.position.set(0, 0.45 * s, 0.86 * s); g.add(door);
      for (const dx of [-0.65, 0.65]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.34 * s, 0.1), mat(0x6a5030));
        win.position.set(dx * s, 1.1 * s, 0.86 * s); g.add(win);
      }
    } else if (t === 'campanile') {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 3.8 * s, 1.1 * s), mat(0xe8d8b0));
      tower.position.y = 1.9 * s; tower.castShadow = true; g.add(tower);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.95 * s, 0.9 * s, 4), mat(0xc0442a));
      roof.position.y = 4.25 * s; roof.rotation.y = Math.PI / 4; g.add(roof);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.6 * s, 0.1), mat(0x5a4028));
      win.position.set(0, 3.2 * s, 0.56 * s); g.add(win);
    } else if (t === 'pagoda') {
      for (let i = 0; i < 3; i++) {
        const w = (2 - i * 0.45) * s;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85 * s, w), mat(0xf0e0c0));
        body.position.y = (0.45 + i * 1.15) * s; body.castShadow = true; g.add(body);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, w * 0.85, 0.55 * s, 4), mat(0xb03024));
        roof.position.y = (1.1 + i * 1.15) * s; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      }
    } else if (t === 'adobe') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.3 * s, 1.4 * s, 1.7 * s), mat(0xd8a068));
      base.position.y = 0.7 * s; base.castShadow = true; g.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 0.9 * s, 1.3 * s), mat(0xc89058));
      top.position.y = 1.85 * s; top.castShadow = true; g.add(top);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.12, 10, 1, false, 0, Math.PI), mat(0x4a2c18));
      door.position.set(0, 0.55 * s, 0.86 * s); door.rotation.x = Math.PI / 2; g.add(door);
    } else if (t === 'palace') {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * s, 1.65 * s, 1.9 * s, 12), mat(0xf0dcAa));
      drum.position.y = 0.95 * s; drum.castShadow = true; g.add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6 * s, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8b040, metalness: 0.5, roughness: 0.4 }));
      dome.position.y = 2.7 * s; dome.scale.y = 1.2; dome.castShadow = true; g.add(dome);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 1 * s, 6), mat(0xc89020));
      spike.position.y = 4.9 * s; g.add(spike);
      for (const dx of [-2.2, 2.2]) {
        const mn = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.34 * s, 3.4 * s, 8), mat(0xf0dcaa));
        mn.position.set(dx * s, 1.7 * s, 0); mn.castShadow = true; g.add(mn);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xe8b040, metalness: 0.5, roughness: 0.4 }));
        cap.position.set(dx * s, 3.6 * s, 0); cap.scale.y = 1.2; g.add(cap);
      }
    } else if (t === 'candycastle') {
      const towers = [[-1.2, 2.2, 0.55], [1.2, 2.2, 0.55], [0, 3.2, 0.8]];
      for (const [dx, h, r] of towers) {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r * s, r * 1.1 * s, h * s, 10), mat(0xf5d5e5));
        body.position.set(dx * s, h / 2 * s, 0); body.castShadow = true; g.add(body);
        const icing = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15 * s, 10, 8), mat(0xfdf3f8));
        icing.position.set(dx * s, h * s, 0); icing.scale.y = 0.55; g.add(icing);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95 * s, 1.2 * s, 10), mat(0x9a5a3a));
        roof.position.set(dx * s, (h + 0.75) * s, 0); roof.castShadow = true; g.add(roof);
        const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 6, 5), mat(0xd02020));
        cherry.position.set(dx * s, (h + 1.45) * s, 0); g.add(cherry);
      }
    } else if (t === 'bamboo') {
      for (let i = 0; i < 3; i++) {
        const h = (2.4 + i * 0.8) * s;
        const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.14 * s, h, 6), mat(0x6aa844));
        cane.position.set((i - 1) * 0.5 * s, h / 2, (i % 2) * 0.3 * s);
        cane.castShadow = true; g.add(cane);
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.8 * s, 5), mat(0x4f9448));
        leaf.position.set((i - 1) * 0.5 * s + 0.25, h - 0.2, (i % 2) * 0.3 * s);
        leaf.rotation.z = -1.2; g.add(leaf);
      }
    } else if (t === 'cupcake') {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 0.65 * s, 1.1 * s, 10), mat(0xc08850));
      cup.position.y = 0.55 * s; cup.castShadow = true; g.add(cup);
      const swirl = new THREE.Mesh(new THREE.SphereGeometry(0.95 * s, 12, 10), mat(0xf8c8dc));
      swirl.position.y = 1.5 * s; swirl.scale.y = 0.8; swirl.castShadow = true; g.add(swirl);
      const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.25 * s, 8, 6), mat(0xd02020));
      cherry.position.y = 2.35 * s; g.add(cherry);
    }
    return g;
  }

  function buildGoalFork() {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3, emissive: 0x664400 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 0.6, 10), mat(0xd9c9a0));
    plinth.position.y = 0.3; g.add(plinth);
    const fork = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.4, 8), gold);
    handle.position.y = 2.3; fork.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.16), gold);
    head.position.y = 4.1; fork.add(head);
    for (let i = -1; i <= 1; i++) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), gold);
      tine.position.set(i * 0.4, 4.85, 0); fork.add(tine);
    }
    fork.traverse((o) => { o.castShadow = true; });
    g.add(fork); g.userData.fork = fork;
    return g;
  }
  return { skyTexture, makeSprite, mat, groundMats, buildDeco, buildGoalFork };
}

function spawnEnemy(state, e, tools) {
  const { makeSprite } = tools;
  const size = e.t === 'meatball' ? 1.5 : e.t === 'flyer' ? 1.4 : 1.7;
  const s = makeSprite(state.textures, SPRITES[e.t], size, size);
  s.position.set(e.p[0], e.p[1] + size * 0.35, e.p[2]);
  state.scene.add(s);
  state.enemies.push({
    t: e.t, sprite: s, base: [...e.p], range: Math.max(1.5, e.range || 5),
    t0: Math.random() * 6, dead: false, size, shootT: 1.5, half: size * 0.42,
  });
}

function buildWorld(state, tools) {
  const { THREE } = state;
  const { mat, groundMats, makeSprite, buildDeco, buildGoalFork } = tools;
  const L = state.level, th = L.theme, C = th.colors;
  const matCache = {};
  const matFor = (key) => matCache[key] || (matCache[key] = mat(C[key] ?? 0x888888));

  const tint = new THREE.Color(th.tint ?? 0xffffff);
  const tint2 = tint.clone().multiplyScalar(0.82);
  // melted sauce/cheese dressing: shared mats + geo, added as children so movers carry theirs
  const meltCol = new THREE.Color(th.melt ?? 0xd8341c);
  const meltMat = new THREE.MeshLambertMaterial({ color: meltCol });
  const meltMat2 = new THREE.MeshLambertMaterial({ color: meltCol.clone().multiplyScalar(0.78) });
  const dripGeo = new THREE.CapsuleGeometry(0.14, 0.34, 3, 6);
  const holeMat = new THREE.MeshLambertMaterial({ color: 0xb08428 });
  const holeGeo = new THREE.CircleGeometry(0.24, 10);
  const dress = (mesh, w, h, d, kind) => {
    // sauce oozes over the front lip only; the painted top stays visible
    const seed = Math.abs(Math.floor(mesh.position.x * 7 + mesh.position.y * 3));
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.24, (kind === 'plat' ? 0.3 : 0.44) + (seed % 3) * 0.07, 0.24),
      seed % 2 ? meltMat : meltMat2);
    band.position.set(0, h / 2 - 0.12, d / 2 + 0.06);
    mesh.add(band);
    const nd = Math.max(2, Math.round(w / 2.4));
    for (let i = 0; i < nd; i++) {
      const lx = -w / 2 + 0.5 + ((seed + i * 2.17) * 1.31) % Math.max(0.6, w - 1);
      const len = 0.5 + ((seed + i * 3) % 3) * 0.28;
      const drip = new THREE.Mesh(dripGeo, i % 2 ? meltMat : meltMat2);
      drip.position.set(lx, h / 2 - 0.3 - len * 0.22, d / 2 + 0.1);
      drip.scale.y = len;
      mesh.add(drip);
    }
    if (kind === 'brick') {   // swiss-cheese holes on the front face
      for (let i = 0; i < 2; i++) {
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(-w / 4 + (i * w) / 2 + ((seed % 3) - 1) * 0.15, ((seed + i) % 2) * 0.3 - 0.15, d / 2 + 0.02);
        hole.scale.setScalar(0.8 + ((seed + i) % 2) * 0.4);
        mesh.add(hole);
      }
    }
  };
  let propSeed = 0;
  for (const b of L.boxes) {
    const [x, y, z, w, h, d, ck] = b;
    let material;
    if (ck === 'ground' || ck === 'ground2') {
      material = groundMats(state.textures, x, y, z, w, h, d, ck === 'ground' ? tint : tint2);
    } else if (ck === 'brick') {
      // cheese blocks: golden, hole-pocked (holes added in dress())
      material = new THREE.MeshLambertMaterial({ color: 0xf2cc5a, map: state.textures.tiled(TILES.plat, w / 3.4, h / 3.4) });
    } else if (ck === 'pillar') {
      material = new THREE.MeshLambertMaterial({ color: tint, map: state.textures.tiled(TILES.pillar, 1, h / 3.5) });
    } else if (ck === 'plat') {
      material = new THREE.MeshLambertMaterial({ color: tint, map: state.textures.tiled(TILES.plat, w / 3.4, d / 3.4) });
    } else {
      material = matFor(ck);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    state.scene.add(mesh);
    state.solids.push({ mesh, aabb: new AABB(x, y, z, w, h, d) });
    if (ck === 'ground' || ck === 'ground2' || ck === 'plat' || ck === 'brick') dress(mesh, w, h, d, ck);
    // painted props on wide ground tops
    if ((ck === 'ground' || ck === 'ground2') && w >= 8 && y + h / 2 < 15) {
      const n = w > 14 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        propSeed++;
        const p = makeSprite(state.textures, PROPS[propSeed % PROPS.length], 1.5, 1.5);
        p.material.color.set(tint);
        p.position.set(x - w / 2 + 2 + ((propSeed * 5.3) % (w - 4)), y + h / 2 + 0.7, 2.6);
        state.scene.add(p);
      }
    }
  }

  // bonus doors (teleport pairs)
  state.doors = [];
  state.doorCd = 0;
  for (const dr of L.doors || []) {
    const arch = new THREE.Group();
    for (const dx of [-0.75, 0.75]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 0.5), mat(C.brick));
      post.position.set(dx, 1.2, 0); post.castShadow = true; arch.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.4, 0.6), mat(C.brick));
    lintel.position.y = 2.5; arch.add(lintel);
    const glowP = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    glowP.position.set(0, 1.15, 0);
    arch.add(glowP);
    arch.position.set(dr.at[0], dr.at[1], 0);
    state.scene.add(arch);
    state.doors.push({ at: dr.at, to: dr.to, glow: glowP });
  }

  for (const m of L.movers || []) {
    const [x, y, z, w, h, d] = m.box;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: tint, map: state.textures.tiled(TILES.plat, 1, 1), emissive: 0x221100 }));
    mesh.castShadow = mesh.receiveShadow = true;
    dress(mesh, w, h, d, 'plat');
    state.scene.add(mesh);
    state.solids.push({
      mesh, aabb: new AABB(x, y, z, w, h, d),
      mover: { base: [x, y, z], to: m.to, period: m.period, size: [w, h, d] },
    });
  }

  state.hazards = [];
  for (const hz of L.hazards || []) {
    const [x, y, z, w, d] = hz;
    const rt = state.textures.tiled(TILES.river, w / 6, d / 6);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d),
      new THREE.MeshStandardMaterial({ map: rt, color: th.hazardTint ?? 0xffffff, emissive: th.hazardEmissive, emissiveIntensity: 0.4, roughness: 0.35 }));
    mesh.position.set(x, y, z);
    state.scene.add(mesh);
    state.hazards.push({ mesh, aabb: new AABB(x, y + 0.1, z, w, 1.0, d), baseY: y, tex: rt });
  }

  for (const c of L.coins || []) {
    const s = makeSprite(state.textures, SPRITES.tomato, 0.9, 0.9);
    s.position.set(c[0], c[1] + 0.5, c[2]);
    state.scene.add(s);
    state.coins.push({ sprite: s, base: c[1] + 0.5, taken: false });
  }

  for (const it of L.items || []) {
    const s = makeSprite(state.textures, SPRITES[it.t], 1.1, 1.1);
    s.position.set(it.p[0], it.p[1] + 0.8, it.p[2]);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.22 }));
    bubble.position.copy(s.position);
    state.scene.add(s, bubble);
    state.items.push({ sprite: s, bubble, t: it.t, base: s.position.y, taken: false });
  }

  for (const e of L.enemies || []) spawnEnemy(state, e, tools);

  if (L.boss) {
    const s = makeSprite(state.textures, SPRITES.boss, 5.2, 5.2);
    s.position.set(L.boss.p[0], L.boss.p[1], L.boss.p[2]);
    state.scene.add(s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xa34fc9 }));
    ring.rotation.x = Math.PI / 2;
    state.scene.add(ring);
    state.bossState = {
      sprite: s, ring, hp: L.boss.hp, maxHp: L.boss.hp, home: [...L.boss.p],
      mode: 'sleep', t: 0, chargeDir: 1, speed: 9,
      arena: L.boss.arena, awake: false,
    };
  }

  if (L.checkpoint) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4, 8), mat(0xd9c9a0));
    pole.position.y = 2; g.add(pole);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 4), mat(0x999999));
    flag.rotation.z = -Math.PI / 2; flag.position.set(0.75, 3.4, 0); g.add(flag);
    g.position.set(...L.checkpoint);
    state.scene.add(g);
    state.checkpointFlag = flag;
  }

  if (L.goal) {
    // her painted GOAL archway, with the golden fork spinning behind it
    state.goalObj = new THREE.Group();
    const arch = makeSprite(state.textures, 'assets/sprites/goal_archway.png', 6.4, 6.4);
    arch.position.y = 3.1;
    state.goalObj.add(arch);
    const fork = buildGoalFork();
    fork.scale.setScalar(0.6);
    fork.position.set(0, 3.6, -1);
    state.goalObj.add(fork);
    state.goalObj.userData.fork = fork.userData.fork;
    state.goalObj.position.set(...L.goal);
    state.scene.add(state.goalObj);
  }
  // start signpost
  const sign = makeSprite(state.textures, 'assets/sprites/start_signpost.png', 2.4, 2.4);
  sign.position.set(L.spawn[0] + 2.5, L.spawn[1] - 2.8, 1.5);
  state.scene.add(sign);

  for (const d of L.deco || []) {
    const g = buildDeco(d.t, d.s || 1);
    g.position.set(...d.p);
    state.scene.add(g);
    if (g.userData.spin) state.decoSpins.push(g.userData.spin);
  }
}

function buildParallax(state, tools) {
  const { THREE } = state;
  const { mat, buildDeco } = tools;
  const L = state.level, th = L.theme;
  const len = L.length || 150;

  // near props just behind the strip
  for (let x = 8; x < len; x += 9 + (x % 3) * 3) {
    const t = th.deco?.[Math.floor(x / 12) % th.deco.length] || 'cypress';
    const g = buildDeco(t, 0.9 + (x % 5) * 0.12);
    g.position.set(x, -1.5, -12);
    state.scene.add(g);
    if (g.userData.spin) state.decoSpins.push(g.userData.spin);
  }

  // village skyline: themed buildings on a shelf, varied scale and spacing
  const skyline = th.skyline || ['villa'];
  for (let i = 0, x = -6; x < len + 20; i++, x += 11 + ((i * 7) % 7)) {
    const t = skyline[i % skyline.length];
    const s = 1.1 + ((i * 5) % 4) * 0.22;
    const g = buildDeco(t, s);
    g.position.set(x + ((i * 3) % 6), -2.4, -23 - ((i * 4) % 7));
    state.scene.add(g);
    if (g.userData.spin) state.decoSpins.push(g.userData.spin);
  }

  // hill rows behind the village
  const rows = [
    { z: -34, r: [8, 13], col: th.hills[0], y: -5, step: 21 },
    { z: -52, r: [15, 24], col: th.hills[1], y: -7, step: 31 },
  ];
  for (const row of rows) {
    const m = mat(row.col);
    for (let x = -14; x < len + 34; x += row.step) {
      const r = row.r[0] + ((x * 7) % (row.r[1] - row.r[0]));
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m);
      hill.position.set(x, row.y, row.z);
      hill.scale.y = 0.72;
      state.scene.add(hill);
    }
  }

  // scattered far landmarks on the hills (silhouette interest)
  for (let i = 0, x = 4; x < len + 10; i++, x += 24) {
    const g = buildDeco(skyline[(i + 1) % skyline.length], 2.6);
    g.position.set(x, -1.5, -38);
    state.scene.add(g);
  }

  // clouds
  const cm = mat(0xffffff, { fog: false });
  for (let x = -5; x < len + 20; x += 22) {
    const cloud = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.6 + (i % 2), 8, 6), cm);
      puff.position.set(i * 2.2 - 2.2, (i % 2) * 0.6, 0);
      cloud.add(puff);
    }
    cloud.position.set(x + (x % 7), 16 + (x % 9), -58);
    cloud.scale.y = 0.55;
    state.scene.add(cloud);
  }
}

export function buildWorldScene({ THREE, scene, level, textures }) {
  const rootsBeforeBuild = new Set(scene.children);
  const tools = createWorldTools(THREE);
  const state = {
    THREE,
    scene,
    level,
    textures,
    solids: [],
    hazards: [],
    coins: [],
    items: [],
    enemies: [],
    doors: [],
    decoSpins: [],
    bossState: null,
    checkpointFlag: null,
    goalObj: null,
  };

  const theme = level.theme;
  const background = tools.skyTexture(theme.skyTop, theme.skyBottom);
  scene.background = background;
  scene.fog = new THREE.Fog(theme.fog, 45, theme.fogFar);

  const hemi = new THREE.HemisphereLight(theme.ambient, 0x665544, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.9);
  sun.position.set(...theme.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCameraSize = 45;
  Object.assign(sun.shadow.camera, {
    left: -shadowCameraSize,
    right: shadowCameraSize,
    top: shadowCameraSize,
    bottom: -shadowCameraSize,
    near: 1,
    far: 220,
  });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff4e0, 0.55);
  fill.position.set(0, 8, 40);
  scene.add(fill);
  state.sun = sun;

  buildWorld(state, tools);
  buildParallax(state, tools);

  const roots = scene.children.filter((child) => !rootsBeforeBuild.has(child));
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const root of roots) {
      root.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose();
      });
      scene.remove(root);
    }
    if (scene.background === background) scene.background = null;
    background.dispose();
  };

  return {
    solids: state.solids,
    hazards: state.hazards,
    coins: state.coins,
    items: state.items,
    enemies: state.enemies,
    doors: state.doors,
    decoSpins: state.decoSpins,
    checkpointFlag: state.checkpointFlag,
    goalObject: state.goalObj,
    bossState: state.bossState,
    sun,
    dispose,
  };
}
