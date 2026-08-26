// Savoria 3D — side-scrolling engine: 3D-rendered world, gameplay on the x/y plane.
import * as THREE from 'three';

// ── Tiny synth SFX (fully local, WebAudio) ─────────────────────────────
class Sfx {
  constructor() { this.ctx = null; }
  ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    try {
      this.ensure();
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch (e) { /* audio blocked until user gesture; fine */ }
  }
  jump()   { this.blip(300, 0.18, 'square', 0.09, 320); }
  coin()   { this.blip(880, 0.09, 'square', 0.08); setTimeout(() => this.blip(1320, 0.14, 'square', 0.08), 60); }
  stomp()  { this.blip(200, 0.15, 'triangle', 0.14, -120); }
  hurt()   { this.blip(180, 0.3, 'sawtooth', 0.1, -120); }
  power()  { [520, 660, 880].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'square', 0.08), i * 80)); }
  goal()   { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.1), i * 130)); }
  boss()   { this.blip(90, 0.5, 'sawtooth', 0.12, -40); }
}
export const sfx = new Sfx();

// ── Helpers ────────────────────────────────────────────────────────────
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

class AABB {
  constructor(cx, cy, cz, w, h, d) { this.set(cx, cy, cz, w, h, d); }
  set(cx, cy, cz, w, h, d) {
    this.minX = cx - w / 2; this.maxX = cx + w / 2;
    this.minY = cy - h / 2; this.maxY = cy + h / 2;
    this.minZ = cz - d / 2; this.maxZ = cz + d / 2;
    return this;
  }
  intersects(o) {
    // epsilon guards against float dust: standing exactly on a surface must
    // never count as being inside it (0.5 + h/2 - h/2 can come back 0.4999…)
    const e = 1e-4;
    return this.minX < o.maxX - e && this.maxX > o.minX + e &&
           this.minY < o.maxY - e && this.maxY > o.minY + e &&
           this.minZ < o.maxZ - e && this.maxZ > o.minZ + e;
  }
}

const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

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

// ── Animated 3D chefs ──────────────────────────────────────────────────
// Each chef is a rig of primitives with hip/shoulder pivots so limbs swing.
const CHEF_CONFIGS = {
  fatsio: {
    skin: 0xeab98c, hair: 0x5a3a1e, shirt: 0xf5efe0, pants: 0x8a5a2e,
    boots: 0x5a3a20, extra: 'scarf', torsoW: 1.28, torsoH: 0.95, scale: 1.06,
  },
  dinnerette: {
    skin: 0xd99a66, hair: 0x4a2c14, shirt: 0xf2e0a8, pants: 0xe8c860,
    boots: 0x8a5a30, extra: 'tiara', torsoW: 0.92, torsoH: 0.9, scale: 1.0, dress: true, longHair: true,
  },
  chefno: {
    skin: 0xeab98c, hair: 0x6a4526, shirt: 0xf5efe0, pants: 0x3f7d3b,
    boots: 0x8a5a30, extra: 'hat', torsoW: 0.88, torsoH: 0.85, scale: 0.94, apron: true,
  },
};

function limb(joint, len, r, color, bootColor) {
  // pivot group at the joint; geometry hangs below it
  const g = new THREE.Group();
  const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat(color));
  seg.position.y = -len / 2;
  seg.castShadow = true;
  g.add(seg);
  if (bootColor) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 1.6, r * 3.2), mat(bootColor));
    boot.position.set(0, -len - r * 0.5, r * 0.6);
    boot.castShadow = true;
    g.add(boot);
  } else {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 6), mat(0xeab98c));
    hand.position.y = -len - r * 0.4;
    g.add(hand);
  }
  g.position.copy(joint);
  return g;
}

function buildChef(id) {
  const c = CHEF_CONFIGS[id] || CHEF_CONFIGS.fatsio;
  const g = new THREE.Group();

  const legL = limb(new THREE.Vector3(-0.2, 0.72, 0), 0.5, 0.13, c.pants, c.boots);
  const legR = limb(new THREE.Vector3(0.2, 0.72, 0), 0.5, 0.13, c.pants, c.boots);
  g.add(legL, legR);

  let torso;
  if (c.dress) {
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.95, 10), mat(c.pants));
    torso.position.y = 0.95;
    const bodice = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(c.shirt));
    bodice.position.y = 1.32; bodice.scale.y = 0.9; bodice.castShadow = true;
    g.add(bodice);
  } else {
    torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(c.shirt));
    torso.position.y = 1.08;
    torso.scale.set(c.torsoW, c.torsoH, 0.92);
  }
  torso.castShadow = true;
  g.add(torso);
  if (c.apron) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.1), mat(0x4a9448));
    apron.position.set(0, 0.98, 0.42);
    g.add(apron);
  }

  const armL = limb(new THREE.Vector3(-0.52 * c.torsoW, 1.38, 0), 0.42, 0.1, c.shirt);
  const armR = limb(new THREE.Vector3(0.52 * c.torsoW, 1.38, 0), 0.42, 0.1, c.shirt);
  g.add(armL, armR);

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat(c.skin));
  skull.castShadow = true;
  head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(c.hair));
  hairCap.position.y = 0.05;
  head.add(hairCap);
  if (c.longHair) {
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(c.hair));
    back.position.set(0, -0.18, -0.26); back.scale.set(1, 1.7, 0.8);
    head.add(back);
  }
  for (const dx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0x3a2418));
    eye.position.set(dx, 0.03, 0.32);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(c.skin));
  nose.position.set(0, -0.06, 0.36);
  head.add(nose);

  if (c.extra === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.09, 8, 14), mat(0xd8402a));
    scarf.position.y = -0.3; scarf.rotation.x = Math.PI / 2;
    head.add(scarf);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), mat(0xd8402a));
    tail.position.set(0.16, -0.5, 0.22); tail.rotation.z = 0.4;
    head.add(tail);
  } else if (c.extra === 'tiara') {
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3 }));
    tiara.position.y = 0.26; tiara.rotation.x = Math.PI / 2.6;
    head.add(tiara);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mat(0xd8402a));
    gem.position.set(0, 0.33, 0.18);
    head.add(gem);
  } else if (c.extra === 'hat') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.26, 10), mat(0xffffff));
    band.position.y = 0.32;
    head.add(band);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), mat(0xffffff));
    puff.position.y = 0.56; puff.scale.y = 0.75; puff.castShadow = true;
    head.add(puff);
  }
  head.position.y = 1.85;
  head.scale.setScalar(1.18);   // chibi proportions: big head reads storybook-cute
  g.add(head);

  g.scale.setScalar(c.scale);
  g.userData = { legL, legR, armL, armR, torso, head, torsoBaseY: torso.scale.y };
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

// ── Game ───────────────────────────────────────────────────────────────
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

export class Game {
  constructor(container, level, opts) {
    this.level = level;
    this.opts = opts;           // { charSprite, hearts, onEvent(type, data) }
    this.textures = opts.textures;
    this.ev = opts.onEvent;
    this.running = false;
    this.finished = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const th = level.theme;
    this.scene.background = skyTexture(th.skyTop, th.skyBottom);
    this.scene.fog = new THREE.Fog(th.fog, 45, th.fogFar);

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

    const hemi = new THREE.HemisphereLight(th.ambient, 0x665544, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(th.sun, 1.9);
    sun.position.set(...th.sunPos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = 45;
    Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 220 });
    this.scene.add(sun);
    this.sun = sun;
    // soft fill from the camera side so front faces read painted, not black
    const fill = new THREE.DirectionalLight(0xfff4e0, 0.55);
    fill.position.set(0, 8, 40);
    this.scene.add(fill);

    this.keys = {};
    this.solids = [];
    this.enemies = [];
    this.coins = [];
    this.items = [];
    this.projectiles = [];
    this.particles = [];
    this.decoSpins = [];
    this.time = level.time;
    this.coinsGot = 0;
    this.hearts = opts.hearts ?? 3;
    this.maxHearts = 5;
    this.invuln = 0;
    this.power = null;
    this.baseSpeed = 8.6; this.baseJump = 12.5;
    this.passedCheckpoint = false;
    this.bossState = null;

    this.buildWorld();
    this.buildParallax();
    this.buildPlayer();
    this.bindInput();

    this.clock = new THREE.Clock();
    this._raf = null;
    this._onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this._onResize);

    window.__game = this;
  }

  buildWorld() {
    const L = this.level, th = L.theme, C = th.colors;
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
        material = groundMats(this.textures, x, y, z, w, h, d, ck === 'ground' ? tint : tint2);
      } else if (ck === 'brick') {
        // cheese blocks: golden, hole-pocked (holes added in dress())
        material = new THREE.MeshLambertMaterial({ color: 0xf2cc5a, map: this.textures.tiled(TILES.plat, w / 3.4, h / 3.4) });
      } else if (ck === 'pillar') {
        material = new THREE.MeshLambertMaterial({ color: tint, map: this.textures.tiled(TILES.pillar, 1, h / 3.5) });
      } else if (ck === 'plat') {
        material = new THREE.MeshLambertMaterial({ color: tint, map: this.textures.tiled(TILES.plat, w / 3.4, d / 3.4) });
      } else {
        material = matFor(ck);
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.solids.push({ mesh, aabb: new AABB(x, y, z, w, h, d) });
      if (ck === 'ground' || ck === 'ground2' || ck === 'plat' || ck === 'brick') dress(mesh, w, h, d, ck);
      // painted props on wide ground tops
      if ((ck === 'ground' || ck === 'ground2') && w >= 8 && y + h / 2 < 15) {
        const n = w > 14 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          propSeed++;
          const p = makeSprite(this.textures, PROPS[propSeed % PROPS.length], 1.5, 1.5);
          p.material.color.set(tint);
          p.position.set(x - w / 2 + 2 + ((propSeed * 5.3) % (w - 4)), y + h / 2 + 0.7, 2.6);
          this.scene.add(p);
        }
      }
    }

    // bonus doors (teleport pairs)
    this.doors = [];
    this.doorCd = 0;
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
      this.scene.add(arch);
      this.doors.push({ at: dr.at, to: dr.to, glow: glowP });
    }

    for (const m of L.movers || []) {
      const [x, y, z, w, h, d] = m.box;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: tint, map: this.textures.tiled(TILES.plat, 1, 1), emissive: 0x221100 }));
      mesh.castShadow = mesh.receiveShadow = true;
      dress(mesh, w, h, d, 'plat');
      this.scene.add(mesh);
      this.solids.push({
        mesh, aabb: new AABB(x, y, z, w, h, d),
        mover: { base: [x, y, z], to: m.to, period: m.period, size: [w, h, d] },
      });
    }

    this.hazards = [];
    for (const hz of L.hazards || []) {
      const [x, y, z, w, d] = hz;
      const rt = this.textures.tiled(TILES.river, w / 6, d / 6);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d),
        new THREE.MeshStandardMaterial({ map: rt, color: th.hazardTint ?? 0xffffff, emissive: th.hazardEmissive, emissiveIntensity: 0.4, roughness: 0.35 }));
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.hazards.push({ mesh, aabb: new AABB(x, y + 0.1, z, w, 1.0, d), baseY: y, tex: rt });
    }

    for (const c of L.coins || []) {
      const s = makeSprite(this.textures, SPRITES.tomato, 0.9, 0.9);
      s.position.set(c[0], c[1] + 0.5, c[2]);
      this.scene.add(s);
      this.coins.push({ sprite: s, base: c[1] + 0.5, taken: false });
    }

    for (const it of L.items || []) {
      const s = makeSprite(this.textures, SPRITES[it.t], 1.1, 1.1);
      s.position.set(it.p[0], it.p[1] + 0.8, it.p[2]);
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.22 }));
      bubble.position.copy(s.position);
      this.scene.add(s, bubble);
      this.items.push({ sprite: s, bubble, t: it.t, base: s.position.y, taken: false });
    }

    for (const e of L.enemies || []) this.spawnEnemy(e);

    if (L.boss) {
      const s = makeSprite(this.textures, SPRITES.boss, 5.2, 5.2);
      s.position.set(L.boss.p[0], L.boss.p[1], L.boss.p[2]);
      this.scene.add(s);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xa34fc9 }));
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
      this.bossState = {
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
      this.scene.add(g);
      this.checkpointFlag = flag;
    }

    if (L.goal) {
      // her painted GOAL archway, with the golden fork spinning behind it
      this.goalObj = new THREE.Group();
      const arch = makeSprite(this.textures, 'assets/sprites/goal_archway.png', 6.4, 6.4);
      arch.position.y = 3.1;
      this.goalObj.add(arch);
      const fork = buildGoalFork();
      fork.scale.setScalar(0.6);
      fork.position.set(0, 3.6, -1);
      this.goalObj.add(fork);
      this.goalObj.userData.fork = fork.userData.fork;
      this.goalObj.position.set(...L.goal);
      this.scene.add(this.goalObj);
    }
    // start signpost
    const sign = makeSprite(this.textures, 'assets/sprites/start_signpost.png', 2.4, 2.4);
    sign.position.set(L.spawn[0] + 2.5, L.spawn[1] - 2.8, 1.5);
    this.scene.add(sign);

    for (const d of L.deco || []) {
      const g = buildDeco(d.t, d.s || 1);
      g.position.set(...d.p);
      this.scene.add(g);
      if (g.userData.spin) this.decoSpins.push(g.userData.spin);
    }
  }

  // Fully 3D backdrop, built to evoke the Savoria world paintings:
  // near props → village skyline → rolling hills → far hills → clouds.
  buildParallax() {
    const L = this.level, th = L.theme;
    const len = L.length || 150;

    // near props just behind the strip
    for (let x = 8; x < len; x += 9 + (x % 3) * 3) {
      const t = th.deco?.[Math.floor(x / 12) % th.deco.length] || 'cypress';
      const g = buildDeco(t, 0.9 + (x % 5) * 0.12);
      g.position.set(x, -1.5, -12);
      this.scene.add(g);
      if (g.userData.spin) this.decoSpins.push(g.userData.spin);
    }

    // village skyline: themed buildings on a shelf, varied scale and spacing
    const skyline = th.skyline || ['villa'];
    for (let i = 0, x = -6; x < len + 20; i++, x += 11 + ((i * 7) % 7)) {
      const t = skyline[i % skyline.length];
      const s = 1.1 + ((i * 5) % 4) * 0.22;
      const g = buildDeco(t, s);
      g.position.set(x + ((i * 3) % 6), -2.4, -23 - ((i * 4) % 7));
      this.scene.add(g);
      if (g.userData.spin) this.decoSpins.push(g.userData.spin);
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
        this.scene.add(hill);
      }
    }

    // scattered far landmarks on the hills (silhouette interest)
    for (let i = 0, x = 4; x < len + 10; i++, x += 24) {
      const g = buildDeco(skyline[(i + 1) % skyline.length], 2.6);
      g.position.set(x, -1.5, -38);
      this.scene.add(g);
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
      this.scene.add(cloud);
    }
  }

  spawnEnemy(e) {
    const size = e.t === 'meatball' ? 1.5 : e.t === 'flyer' ? 1.4 : 1.7;
    const s = makeSprite(this.textures, SPRITES[e.t], size, size);
    s.position.set(e.p[0], e.p[1] + size * 0.35, e.p[2]);
    this.scene.add(s);
    this.enemies.push({
      t: e.t, sprite: s, base: [...e.p], range: Math.max(1.5, e.range || 5),
      t0: Math.random() * 6, dead: false, size, shootT: 1.5, half: size * 0.42,
    });
  }

  buildPlayer() {
    this.rig = buildChef(this.opts.charId);
    this.scene.add(this.rig);
    this.rig.rotation.y = 1.15;
    this.player = {
      pos: new THREE.Vector3(...this.level.spawn),
      vel: new THREE.Vector3(),
      w: 0.8, h: 1.55, d: 0.8,
      grounded: false, coyote: 0, jumpBuf: 0, jumps: 0,
      facing: 1, groundMover: null,
    };
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.28 }));
    this.glow.visible = false;
    this.scene.add(this.glow);
  }

  bindInput() {
    const JUMP = ['Space', 'ArrowUp', 'KeyW'];
    const EAT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
    this._kd = (e) => {
      if (EAT.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (JUMP.includes(e.code)) this.player.jumpBuf = 0.13;
      if (e.code === 'Escape') this.ev('pause');
      sfx.ensure();
    };
    this._ku = (e) => {
      this.keys[e.code] = false;
      // variable jump with a guaranteed minimum height: quick taps still jump properly
      if (JUMP.includes(e.code) && this.player.vel.y > 7 &&
          !JUMP.some((c) => this.keys[c])) this.player.vel.y = 7;
    };
    // if the window loses focus mid-hold, keyups never arrive; clear everything
    this._blur = () => { this.keys = {}; this.player.jumpBuf = 0; };
    addEventListener('keydown', this._kd);
    addEventListener('keyup', this._ku);
    addEventListener('blur', this._blur);
    document.addEventListener('visibilitychange', this._blur);
  }

  burst(pos, color, n = 10, spread = 4) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
        new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.9 + 1,
        (Math.random() - 0.5) * spread);
      this.scene.add(m);
      this.particles.push({ m, v, life: 0.7 });
    }
  }

  start() {
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.running && !this.finished) this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  pause() { this.running = false; this.keys = {}; }
  resume() { this.running = true; this.keys = {}; this.clock.getDelta(); }

  update(dt) {
    const P = this.player;
    this.elapsed = (this.elapsed || 0) + dt;

    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.killPlayer(true); return; }
    this.ev('timer', this.time);

    // movers
    for (const s of this.solids) {
      if (!s.mover) continue;
      const mv = s.mover;
      const t = (Math.sin((this.elapsed / mv.period) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const nx = mv.base[0] + mv.to[0] * t, ny = mv.base[1] + mv.to[1] * t, nz = mv.base[2] + mv.to[2] * t;
      mv.delta = [nx - s.mesh.position.x, ny - s.mesh.position.y, nz - s.mesh.position.z];
      s.mesh.position.set(nx, ny, nz);
      s.aabb.set(nx, ny, nz, ...mv.size);
    }

    // input: pure side-scroller
    let mx = 0;
    if (this.keys.ArrowRight || this.keys.KeyD) mx += 1;
    if (this.keys.ArrowLeft || this.keys.KeyA) mx -= 1;
    const speed = this.baseSpeed * (this.power?.type === 'speed' ? 1.55 : 1);
    if (mx !== 0) {
      P.vel.x += (mx * speed - P.vel.x) * Math.min(1, dt * 10);
      P.facing = mx;
    } else {
      P.vel.x *= Math.max(0, 1 - dt * 9);
    }

    // jumping
    P.coyote = P.grounded ? 0.16 : Math.max(0, P.coyote - dt);
    P.jumpBuf = Math.max(0, P.jumpBuf - dt);
    const jumpV = this.baseJump * (this.power?.type === 'boost' ? 1.28 : 1);
    if (P.jumpBuf > 0) {
      if (P.coyote > 0) {
        P.vel.y = jumpV; P.jumpBuf = 0; P.coyote = 0; P.jumps = 1; sfx.jump();
      } else if (P.jumps < 2 && P.vel.y < 10) {   // grace: a rapid second tap can't waste the double at ground level; walking off a ledge still leaves one air jump
        P.vel.y = jumpV * 0.92; P.jumpBuf = 0; P.jumps = 2; sfx.jump();
        this.burst(P.pos.clone().setY(P.pos.y - 0.6), 0xfff2cc, 6, 2);
      }
    }

    P.vel.y -= 30 * dt;
    if (P.vel.y < -26) P.vel.y = -26;

    // move & collide (x then y; z is locked)
    const box = new AABB(0, 0, 0, 0, 0, 0);
    const setBox = () => box.set(P.pos.x, P.pos.y + P.h / 2, 0, P.w, P.h, P.d);

    if (P.groundMover?.mover?.delta) {
      const d = P.groundMover.mover.delta;
      P.pos.x += d[0]; P.pos.y += d[1];
    }

    // substep so one slow frame can never move the player through a thin
    // platform (fall step can hit 1.3 units; platforms are as thin as 0.8)
    const maxDisp = Math.max(Math.abs(P.vel.x), Math.abs(P.vel.y)) * dt;
    const steps = Math.max(1, Math.ceil(maxDisp / 0.4));
    const sdt = dt / steps;
    P.grounded = false; P.groundMover = null;
    for (let i = 0; i < steps; i++) {
      P.pos.x += P.vel.x * sdt; setBox();
      for (const s of this.solids) if (box.intersects(s.aabb)) {
        const lip = s.aabb.maxY - P.pos.y;
        if (lip > -0.05 && lip <= 0.55 && P.vel.y <= 0.01) {  // step up small ledges (tolerant of float dust)
          P.pos.y = Math.max(P.pos.y, s.aabb.maxY); setBox(); continue;
        }
        // resolve to the NEAREST face so a snap can never exceed real penetration
        const penL = box.maxX - s.aabb.minX, penR = s.aabb.maxX - box.minX;
        P.pos.x = penL < penR ? s.aabb.minX - P.w / 2 : s.aabb.maxX + P.w / 2;
        P.vel.x = 0; setBox();
      }
      P.pos.y += P.vel.y * sdt; setBox();
      for (const s of this.solids) if (box.intersects(s.aabb)) {
        if (P.vel.y <= 0 && P.pos.y + P.h * 0.5 > s.aabb.maxY) {
          P.pos.y = s.aabb.maxY; P.vel.y = 0; P.grounded = true; P.jumps = 0;
          if (s.mover) P.groundMover = s;
        } else if (P.vel.y > 0 && box.maxY - s.aabb.minY < 0.75) {
          // ceiling bonk only on shallow head contact; deep overlaps are side hits
          P.pos.y = s.aabb.minY - P.h; P.vel.y = 0;
        }
        setBox();
      }
    }
    P.pos.z = 0; P.vel.z = 0;

    // hazards & kill plane
    if (P.pos.y < this.level.killY) { this.killPlayer(); return; }
    for (const hz of this.hazards) {
      hz.mesh.position.y = hz.baseY + Math.sin(this.elapsed * 2.2 + hz.baseY) * 0.08;
      hz.tex.offset.x = this.elapsed * 0.03;   // slow lava-flow scroll
      if (box.intersects(hz.aabb)) {
        if (this.power?.type === 'shield') { P.vel.y = 11; continue; }
        this.killPlayer(); return;
      }
    }

    // bonus doors
    this.doorCd = Math.max(0, this.doorCd - dt);
    for (const dr of this.doors) {
      dr.glow.material.opacity = 0.4 + Math.sin(this.elapsed * 4) * 0.15;
      if (this.doorCd <= 0 &&
          Math.abs(P.pos.x - dr.at[0]) < 1.1 && Math.abs(P.pos.y - dr.at[1]) < 1.6) {
        this.burst(P.pos.clone().setY(P.pos.y + 1), 0xffe9a0, 12, 3);
        P.pos.set(dr.to[0], dr.to[1] + 0.5, 0);
        P.vel.set(0, 0, 0);
        setBox();   // enemy/projectile checks this frame must see the new position
        this.doorCd = 1.4;
        sfx.power();
        this.burst(P.pos.clone().setY(P.pos.y + 1), 0xffe9a0, 12, 3);
        // snap the camera so the vault doesn't require a long pan
        this.camera.position.set(P.pos.x, P.pos.y + 4, 21);
      }
    }

    // checkpoint / goal
    const L = this.level;
    if (L.checkpoint && !this.passedCheckpoint &&
        Math.abs(P.pos.x - L.checkpoint[0]) < 2.2 && Math.abs(P.pos.y - L.checkpoint[1]) < 3.5) {
      this.passedCheckpoint = true;
      this.checkpointFlag.material = mat(0xf2c14e);
      this.ev('msg', 'Checkpoint! 🚩');
      sfx.power();
    }
    if (this.goalObj) {
      this.goalObj.userData.fork.rotation.y += dt * 1.6;
      if (P.pos.distanceTo(this.goalObj.position) < 2.6) return this.complete();
    }

    // coins
    for (const c of this.coins) {
      if (c.taken) continue;
      c.sprite.position.y = c.base + Math.sin(this.elapsed * 3 + c.base) * 0.16;
      if (P.pos.distanceTo(c.sprite.position) < 1.4) {
        c.taken = true; c.sprite.visible = false;
        this.coinsGot++; sfx.coin();
        this.burst(c.sprite.position, 0xff5a3c, 7, 2.5);
        this.ev('coins', this.coinsGot);
      }
    }

    // items
    for (const it of this.items) {
      if (it.taken) continue;
      it.sprite.position.y = it.base + Math.sin(this.elapsed * 2 + it.base) * 0.2;
      it.bubble.position.copy(it.sprite.position);
      if (P.pos.distanceTo(it.sprite.position) < 1.5) {
        it.taken = true; it.sprite.visible = it.bubble.visible = false;
        sfx.power();
        this.burst(it.sprite.position, 0xb9d857, 10, 3);
        if (it.t === 'basil') {
          this.hearts = Math.min(this.maxHearts, this.hearts + 1);
          this.ev('hearts', this.hearts);
          this.ev('msg', '+1 Heart 🌿');
        } else {
          this.power = { type: it.t, t: it.t === 'shield' ? 8 : 10 };
          this.ev('power', this.power);
          const names = { speed: 'Speed Pasta!', shield: 'Parmesan Shield!', boost: 'Basil Boost!' };
          this.ev('msg', names[it.t]);
        }
      }
    }
    if (this.power) {
      this.power.t -= dt;
      this.ev('power', this.power);
      if (this.power.t <= 0) { this.power = null; this.ev('power', null); }
    }
    this.glow.visible = this.power?.type === 'shield';
    if (this.glow.visible) {
      this.glow.position.copy(P.pos).y += 0.9;
      this.glow.material.opacity = 0.2 + Math.sin(this.elapsed * 8) * 0.08;
    }

    // enemies
    this.invuln = Math.max(0, this.invuln - dt);
    const pBox = box;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const sp = e.sprite;
      if (e.t === 'meatball') {
        e.t0 += dt;
        sp.position.x = e.base[0] + Math.sin(e.t0 * (5 / e.range)) * e.range;
        sp.position.y = e.base[1] + e.size * 0.35 + Math.abs(Math.sin(e.t0 * 7)) * 0.18;
      } else if (e.t === 'flyer') {
        e.t0 += dt;
        sp.position.x = e.base[0] + Math.sin(e.t0 * (4 / e.range)) * e.range;
        sp.position.y = e.base[1] + Math.sin(e.t0 * 2.4) * 1.1;
      } else if (e.t === 'shooter') {
        sp.position.y = e.base[1] + e.size * 0.35 + Math.sin(this.elapsed * 2) * 0.06;
        e.shootT -= dt;
        const dist = Math.abs(P.pos.x - sp.position.x);
        if (e.shootT <= 0 && dist < 11 && dist > 2) {   // only fires when visible on screen
          e.shootT = 3.0;
          const dir = P.pos.clone().sub(sp.position);
          const flight = Math.max(0.7, dir.length() / 12);
          const v = new THREE.Vector3(dir.x / flight, dir.y / flight + 11 * flight * 0.5, 0);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0xd42a12, emissive: 0x7a0d00 }));
          m.position.copy(sp.position).y += 0.4;
          this.scene.add(m);
          this.projectiles.push({ m, v, life: 3.5 });
          sfx.blip(240, 0.12, 'square', 0.06, -80);
        }
      }
      const eBox = new AABB(sp.position.x, sp.position.y, 0, e.half * 2, e.half * 2, e.half * 2);
      if (pBox.intersects(eBox)) {
        const stomping = P.vel.y < -2 && (P.pos.y > sp.position.y + e.half * 0.3);
        if (stomping || this.power?.type === 'shield') {
          e.dead = true; sp.visible = false;
          if (stomping) P.vel.y = 10;
          sfx.stomp();
          this.burst(sp.position, 0x8a4a2a, 12, 4);
          this.coinsGot += 2; this.ev('coins', this.coinsGot);
        } else this.hurt(sp.position);
      }
    }

    // projectiles
    for (const pr of this.projectiles) {
      pr.v.y -= 22 * dt;
      pr.m.position.addScaledVector(pr.v, dt);
      pr.life -= dt;
      if (pr.life <= 0 || pr.m.position.y < this.level.killY) { pr.dead = true; this.scene.remove(pr.m); continue; }
      // projectiles splat on terrain instead of flying through it
      const pp = pr.m.position;
      if (this.solids.some(s => pp.x > s.aabb.minX && pp.x < s.aabb.maxX &&
          pp.y > s.aabb.minY && pp.y < s.aabb.maxY)) {
        pr.dead = true; this.scene.remove(pr.m);
        this.burst(pp, 0xd42a12, 5, 1.5);
        continue;
      }
      if (P.pos.distanceTo(pr.m.position) < 1) {
        pr.dead = true; this.scene.remove(pr.m);
        if (this.power?.type !== 'shield') this.hurt(pr.m.position);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    if (this.bossState) this.updateBoss(dt, pBox);

    // particles / deco
    for (const pt of this.particles) {
      pt.v.y -= 12 * dt;
      pt.m.position.addScaledVector(pt.v, dt);
      pt.life -= dt;
      pt.m.material.opacity = Math.max(0, pt.life / 0.7);
      pt.m.material.transparent = true;
      if (pt.life <= 0) { this.scene.remove(pt.m); pt.dead = true; }
    }
    this.particles = this.particles.filter((p) => !p.dead);
    for (const sp of this.decoSpins) sp.rotation.z += dt * 0.8;

    // animated chef rig / blob shadow
    const R = this.rig, U = R.userData;
    R.position.set(P.pos.x, P.pos.y, 0);
    const targetYaw = P.facing >= 0 ? 1.15 : Math.PI - 1.15;   // 3/4 view toward travel
    R.rotation.y += (targetYaw - R.rotation.y) * Math.min(1, dt * 12);
    const runAmt = Math.min(1, Math.abs(P.vel.x) / this.baseSpeed);
    if (!P.grounded) {
      // jump pose: legs split, arms raised
      U.legL.rotation.x += (0.7 - U.legL.rotation.x) * dt * 14;
      U.legR.rotation.x += (-0.9 - U.legR.rotation.x) * dt * 14;
      U.armL.rotation.z += (2.4 - U.armL.rotation.z) * dt * 10;
      U.armR.rotation.z += (-2.4 - U.armR.rotation.z) * dt * 10;
      U.torso.rotation.x = 0.12;
    } else if (runAmt > 0.12) {
      // run cycle
      const t = this.elapsed * 13 * (0.6 + runAmt * 0.6);
      U.legL.rotation.x = Math.sin(t) * 0.95 * runAmt;
      U.legR.rotation.x = -Math.sin(t) * 0.95 * runAmt;
      U.armL.rotation.x = -Math.sin(t) * 0.8 * runAmt;
      U.armR.rotation.x = Math.sin(t) * 0.8 * runAmt;
      U.armL.rotation.z += (0.25 - U.armL.rotation.z) * dt * 10;
      U.armR.rotation.z += (-0.25 - U.armR.rotation.z) * dt * 10;
      U.torso.rotation.x = 0.14 * runAmt;
      R.position.y += Math.abs(Math.sin(t)) * 0.09 * runAmt;
      U.head.rotation.x = Math.sin(t * 2) * 0.03;
    } else {
      // idle: gentle breathing
      const b = Math.sin(this.elapsed * 2.4);
      U.legL.rotation.x *= 0.85; U.legR.rotation.x *= 0.85;
      U.armL.rotation.x *= 0.85; U.armR.rotation.x *= 0.85;
      U.armL.rotation.z += (0.12 - U.armL.rotation.z) * dt * 6;
      U.armR.rotation.z += (-0.12 - U.armR.rotation.z) * dt * 6;
      U.torso.rotation.x = 0;
      U.torso.scale.y += (U.torsoBaseY * (1 + b * 0.015) - U.torso.scale.y) * dt * 8;
      U.head.rotation.x = b * 0.03;
    }
    R.visible = this.invuln > 0 ? Math.sin(this.elapsed * 30) > 0 : true;

    let gy = this.level.killY;
    for (const s of this.solids) {
      if (P.pos.x > s.aabb.minX - 0.2 && P.pos.x < s.aabb.maxX + 0.2 &&
          s.aabb.maxY <= P.pos.y + 0.1 && s.aabb.maxY > gy) gy = s.aabb.maxY;
    }
    this.blob.position.set(P.pos.x, gy + 0.03, 0);
    this.blob.scale.setScalar(Math.max(0.5, Math.min(1, 1 - (P.pos.y - gy) * 0.07)));
    this.blob.visible = gy > this.level.killY;

    // side-view camera with facing lookahead
    const len = this.level.length || 100;
    let cx = P.pos.x + P.facing * 2.5;
    cx = Math.max(9, Math.min(len - 9, cx));
    const cy = Math.max(3.5, P.pos.y + 4);
    this.camera.position.lerp(new THREE.Vector3(cx, cy, 21), Math.min(1, dt * 5));
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - 1.8, 0);
    this.sun.position.set(P.pos.x + this.level.theme.sunPos[0] * 0.4,
      this.level.theme.sunPos[1], this.level.theme.sunPos[2]);
    this.sun.target.position.set(P.pos.x, 0, 0);
    this.sun.target.updateMatrixWorld();
  }

  updateBoss(dt, pBox) {
    const B = this.bossState, P = this.player, sp = B.sprite;
    const [ax, , , aw] = B.arena;

    if (!B.awake) {
      if (Math.abs(P.pos.x - sp.position.x) < 18) {
        B.awake = true; B.mode = 'idle'; B.t = 1.2;
        this.ev('bossShow', { hp: B.hp, maxHp: B.maxHp });
        this.ev('msg', 'DON FUNGHI: "You dare enter MY kitchen?!"');
        sfx.boss();
      }
      sp.position.y = B.home[1] + Math.sin(this.elapsed * 1.5) * 0.2;
    } else {
      B.t -= dt;
      if (B.mode === 'idle') {
        sp.position.y = B.home[1] + Math.sin(this.elapsed * 3) * 0.3;
        if (B.t <= 0) {
          B.mode = 'telegraph'; B.t = 0.7;
          B.chargeDir = Math.sign(P.pos.x - sp.position.x) || 1;
        }
      } else if (B.mode === 'telegraph') {
        sp.position.x += (Math.random() - 0.5) * 0.14;
        if (B.t <= 0) { B.mode = 'charge'; B.t = 1.8; sfx.boss(); }
      } else if (B.mode === 'charge') {
        sp.position.x += B.chargeDir * B.speed * dt;
        sp.position.y = B.home[1] - 0.6 + Math.abs(Math.sin(this.elapsed * 14)) * 0.4;
        if (Math.abs(sp.position.x - ax) > aw / 2 - 3 || B.t <= 0) {
          B.mode = 'tired'; B.t = 2.4;
          this.ev('msg', 'Now! Stomp him!');
        }
      } else if (B.mode === 'tired') {
        sp.position.y = B.home[1] - 1.0 + Math.sin(this.elapsed * 2) * 0.1;
        if (B.t <= 0) { B.mode = 'idle'; B.t = 1.0 + Math.random(); }
      }
    }

    B.ring.position.set(sp.position.x, B.home[1] - 2.1, 0);
    B.ring.rotation.z += dt * 2;
    B.ring.material.color.set(B.mode === 'tired' ? 0x8fd42a : 0xa34fc9);

    const eBox = new AABB(sp.position.x, sp.position.y, 0, 3.2, 4.0, 3.2);
    if (pBox.intersects(eBox)) {
      const stomping = P.vel.y < -2 && P.pos.y > sp.position.y + 1.0;
      if (stomping && B.mode === 'tired') {
        P.vel.y = 13; B.hp--; sfx.stomp();
        this.burst(sp.position, 0xa34fc9, 18, 6);
        this.ev('bossHp', { hp: B.hp, maxHp: B.maxHp });
        if (B.hp <= 0) {
          sp.visible = false; B.ring.visible = false;
          this.bossState = null;
          this.ev('msg', 'DON FUNGHI: "Impossible!! My empire… crumbles…"');
          sfx.goal();
          setTimeout(() => this.complete(true), 1400);
          return;
        }
        B.mode = 'idle'; B.t = 0.8; B.speed += 2.5;
        this.ev('msg', 'DON FUNGHI: "Minions! Get in here!"');
        this.spawnEnemy({ t: 'meatball', p: [ax - 8, B.arena[1] + 0.4, 0], range: 5 });
        this.spawnEnemy({ t: 'meatball', p: [ax + 8, B.arena[1] + 0.4, 0], range: 5 });
      } else if (!stomping) {
        if (this.power?.type !== 'shield') this.hurt(sp.position);
      } else {
        P.vel.y = 11;
      }
    }
  }

  hurt(fromPos) {
    if (this.invuln > 0) return;
    this.hearts--; this.invuln = 1.6;
    sfx.hurt();
    this.ev('hearts', this.hearts);
    const P = this.player;
    P.vel.x = (Math.sign(P.pos.x - fromPos.x) || 1) * 5.5;   // gentle knockback: never flings you into pits
    P.vel.y = 6;
    this.burst(P.pos.clone().setY(P.pos.y + 1), 0xff4444, 8, 3);
    this.ev('msg', 'Ouch! 💔');
    this.ev('flash');
    if (this.hearts <= 0) this.die();
  }

  killPlayer(timeout = false) {
    if (this.invuln > 0 && !timeout) { this.respawn(); return; }
    this.hearts--; sfx.hurt();
    this.ev('hearts', this.hearts);
    this.ev('flash');
    if (timeout) { this.ev('msg', "Time's up! ⏰"); this.time = this.level.time; this.ev('timer', this.time); }
    else this.ev('msg', this.player.pos.y < this.level.killY ? 'Fell! 💔' : 'Too hot! 💔');
    if (this.hearts <= 0) return this.die();
    this.respawn();
  }

  respawn() {
    const P = this.player;
    const spot = this.passedCheckpoint && this.level.checkpoint ? this.level.checkpoint : this.level.spawn;
    P.pos.set(spot[0], spot[1] + 1, 0);
    P.vel.set(0, 0, 0);
    this.invuln = 2;
  }

  die() {
    this.finished = true;
    this.ev('died');
  }

  complete(isBoss = false) {
    if (this.finished) return;
    this.finished = true;
    sfx.goal();
    this.ev('complete', {
      coins: this.coinsGot,
      totalCoins: this.level.coins.length,
      time: Math.round(this.level.time - this.time),
      hearts: this.hearts,
      isBoss,
    });
  }

  destroy() {
    this.ev = () => {};   // a destroyed game must never emit events (stray timeouts)
    cancelAnimationFrame(this._raf);
    removeEventListener('resize', this._onResize);
    removeEventListener('keydown', this._kd);
    removeEventListener('keyup', this._ku);
    removeEventListener('blur', this._blur);
    document.removeEventListener('visibilitychange', this._blur);
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();   // free the GPU context now; browsers cap live contexts and kill old ones, which caused mounting stutter across restarts
    this.renderer.domElement.remove();
    if (window.__game === this) window.__game = null;
  }
}
