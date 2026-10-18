// Shared presentation effects for solo and Online Co-op: one particle pool,
// capped screen shake, defeat ghosts, flag pops, ambience, and per-chef
// squash and stretch. Callers feed it what they already draw. It never
// writes gameplay state and never talks to the network.

import { THEMES } from '../levels/themes.js';
import { FADE_IN_OUT, FADE_OUT, ParticlePool, SHAPE_DISC, SHAPE_SOFT } from './particle-pool.js';
import {
  addTrauma,
  createShake,
  createSquash,
  easeOutBack,
  kickSquash,
  prefersReducedMotion,
  stepShake,
  stepSquash,
} from './motion-math.js';

const CONFETTI = [0xd8341c, 0xf2b544, 0x5c9e2e, 0xfff3d0, 0xff8a3d];
const SAUCE = { meatball: [0x8a4a2a, 0xc54b22], flyer: [0x6fae3a, 0xb9d857], shooter: [0xd42a12, 0xff7a4d] };
const GHOST_COUNT = 4;
const GHOST_LIFE = 0.32;
const TURN_TIME = 0.14;
const HIT_FLASH_TIME = 0.2;

const AMBIENT = {
  pasta: { mote: 0xffe4a0, moteRate: 7, petal: null, steam: 0xfff6e8, steamRate: 3.2 },
  sushi: { mote: 0xfff4fa, moteRate: 4, petal: 0xffb7cf, petalRate: 2.2, steam: 0xf2fbff, steamRate: 2.4 },
  default: { mote: 0xfff0d0, moteRate: 5, petal: null, steam: 0xffffff, steamRate: 2.6 },
};

function themeKey(theme) {
  for (const [key, value] of Object.entries(THEMES)) if (value === theme) return key;
  return 'default';
}

export class FxLayer {
  constructor({
    THREE,
    scene,
    camera,
    theme,
    hazards = [],
    emit = () => {},
    viewport = null,
    capacity = 640,
    reduced = prefersReducedMotion(),
  }) {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.hazards = hazards;
    this.emit = emit;
    // Returns the canvas rect for screen-space events. Defaults to the window.
    this.viewport = viewport;
    this.reduced = reduced;
    this.amount = this.reduced ? 0.4 : 1;
    this.pool = new ParticlePool(THREE, capacity);
    scene.add(this.pool.points);

    this.shake = createShake();
    this.time = 0;
    this.moteClock = 0;
    this.petalClock = 0;
    this.steamClock = 0;
    this.flag = null;
    this.flagPop = -1;
    this.flagBase = null;
    this.ambient = AMBIENT[themeKey(theme)] ?? AMBIENT.default;

    this.ghosts = [];
    for (let index = 0; index < GHOST_COUNT; index += 1) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      this.ghosts.push({ sprite, t: -1, w: 1, h: 1 });
    }
    this.ghostCursor = 0;

    this.screen = new THREE.Vector3();
    this.bufferSize = new THREE.Vector2();
    this.scratch = {};
    this.style(0xffffff, 1, 0.3, 0.3, 1);
  }

  random(min, max) {
    return min + Math.random() * (max - min);
  }

  count(n) {
    return Math.max(1, Math.round(n * this.amount));
  }

  addShake(amount) {
    if (!this.reduced) addTrauma(this.shake, amount);
  }

  // Every spawn fills this one options object, so effects allocate nothing.
  style(color, life, size, sizeEnd, alpha) {
    const o = this.scratch;
    o.color = color;
    o.life = life;
    o.size = size;
    o.sizeEnd = sizeEnd;
    o.alpha = alpha;
    o.gravity = 0;
    o.drag = 0;
    o.sway = 0;
    o.shape = SHAPE_SOFT;
    o.fade = FADE_OUT;
    o.tint = 1;
    return o;
  }

  burst(position, color, count = 10, spread = 4) {
    const total = this.count(count * 1.4);
    for (let index = 0; index < total; index += 1) {
      const angle = this.random(0, Math.PI * 2);
      const speed = this.random(0.35, 1) * spread;
      const o = this.style(color, this.random(0.45, 0.8), this.random(0.26, 0.42), 0.06, 0.95);
      o.tint = index % 3 === 0 ? 1.25 : 1;
      o.gravity = 14;
      o.drag = 1.2;
      o.shape = SHAPE_DISC;
      this.pool.spawn(
        position.x, position.y, position.z + 0.3,
        Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * 0.9 + 1.2, this.random(-0.5, 0.5),
        o,
      );
    }
  }

  dust(x, y, count, spreadX = 1.6, up = 1.2, size = 0.62, alpha = 0.62) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const o = this.style(0xdcc08e, this.random(0.35, 0.6), size * this.random(0.6, 1), size * 1.9, alpha);
      o.drag = 3.2;
      o.gravity = -0.4;
      this.pool.spawn(
        x + this.random(-0.25, 0.25), y + 0.08, this.random(-0.2, 0.4),
        this.random(-spreadX, spreadX), this.random(0.2, up), 0,
        o,
      );
    }
  }

  sparkle(x, y, z, color, count, speed = 3.2) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2 + this.random(-0.2, 0.2);
      const o = this.style(color, 0.5, 0.36, 0.04, 1);
      o.tint = 1.3;
      o.drag = 4.5;
      o.shape = SHAPE_DISC;
      this.pool.spawn(x, y, z, Math.cos(angle) * speed, Math.sin(angle) * speed, 0, o);
    }
  }

  confetti(x, y, count, power = 9) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = this.random(Math.PI * 0.18, Math.PI * 0.82);
      const speed = this.random(0.45, 1) * power;
      const size = this.random(0.26, 0.4);
      const o = this.style(CONFETTI[index % CONFETTI.length], this.random(1.1, 1.8), size, size, 1);
      o.gravity = 9;
      o.drag = 1.6;
      o.sway = 1.4;
      o.shape = SHAPE_DISC;
      this.pool.spawn(
        x + this.random(-0.4, 0.4), y, this.random(-0.3, 0.6),
        Math.cos(angle) * speed, Math.sin(angle) * speed, this.random(-0.6, 0.6),
        o,
      );
    }
  }

  airPuff(x, y) {
    const total = this.count(10);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2;
      const o = this.style(0xffffff, 0.38, 0.34, 0.6, 0.55);
      o.drag = 5;
      this.pool.spawn(
        x, y + 0.1, 0.3,
        Math.cos(angle) * 3.2, Math.sin(angle) * 0.9 - 0.6, Math.sin(angle) * 1.2,
        o,
      );
    }
  }

  // Tomato or item pickup at a sprite position.
  pickupPop(position, color = 0xffd36b) {
    this.sparkle(position.x, position.y, position.z + 0.3, color, 8, 3.6);
    const o = this.style(0xffe9a8, 0.32, 0.8, 2.6, 0.65);
    this.pool.spawn(position.x, position.y, position.z + 0.2, 0, 0, 0, o);
  }

  // Sauce burst, white flash and a squashed ghost for a defeated enemy.
  defeat(sprite, type) {
    const p = sprite.position;
    const colors = SAUCE[type] ?? SAUCE.meatball;
    this.burst(p, colors[0], 6, 5);
    this.burst(p, colors[1], 4, 3.5);
    const o = this.style(0xffffff, 0.2, 0.8, 3, 0.7);
    this.pool.spawn(p.x, p.y, p.z + 0.4, 0, 0, 0, o);
    if (!this.reduced) this.spawnGhost(sprite);
  }

  checkpoint(x, y, flag) {
    this.confetti(x, y + 3, 46, 8);
    this.sparkle(x, y + 3.2, 0.8, 0xfff0b0, 12, 4);
    if (flag) {
      if (this.flag !== flag) this.flagBase = null;
      this.flag = flag;
      this.flagPop = 0;
    }
  }

  celebrate(position) {
    this.confetti(position.x, position.y + 1.5, 90, 12);
    this.sparkle(position.x, position.y + 2, 0.5, 0xfff3c0, 16, 5);
  }

  spawnGhost(source) {
    const ghost = this.ghosts[this.ghostCursor];
    this.ghostCursor = (this.ghostCursor + 1) % GHOST_COUNT;
    ghost.sprite.material.map = source.material.map;
    ghost.sprite.material.needsUpdate = true;
    ghost.sprite.position.copy(source.position);
    ghost.w = source.scale.x;
    ghost.h = source.scale.y;
    ghost.t = 0;
    ghost.sprite.visible = true;
  }

  // Sends a screen-space tomato event so the HUD can fly a tomato home.
  flyTomato(position, count = 1) {
    if (this.reduced) return;
    this.screen.copy(position).project(this.camera);
    const rect = this.viewport?.();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const width = rect?.width ?? innerWidth;
    const height = rect?.height ?? innerHeight;
    const x = left + (this.screen.x + 1) * 0.5 * width;
    const y = top + (1 - this.screen.y) * 0.5 * height;
    this.emit('fx', { type: 'tomato', x, y, count });
  }

  ambientStep(dt) {
    if (this.reduced || dt <= 0) return;
    const cx = this.camera.position.x;
    const cy = this.camera.position.y;
    const ambient = this.ambient;

    this.moteClock -= dt;
    while (this.moteClock <= 0) {
      this.moteClock += 1 / ambient.moteRate;
      const size = this.random(0.06, 0.13);
      const o = this.style(ambient.mote, this.random(3.5, 6), size, size, 0.75);
      o.sway = 0.25;
      o.fade = FADE_IN_OUT;
      o.shape = SHAPE_DISC;
      this.pool.spawn(
        cx + this.random(-17, 17), cy + this.random(-9, 6), this.random(-7, 3),
        this.random(-0.35, 0.35), this.random(0.1, 0.45), 0,
        o,
      );
    }

    if (ambient.petal) {
      this.petalClock -= dt;
      while (this.petalClock <= 0) {
        this.petalClock += 1 / ambient.petalRate;
        const size = this.random(0.16, 0.24);
        const o = this.style(ambient.petal, this.random(6, 9), size, size, 0.9);
        o.sway = 1.2;
        o.fade = FADE_IN_OUT;
        o.shape = SHAPE_DISC;
        this.pool.spawn(
          cx + this.random(-15, 19), cy + 8, this.random(-5, 2),
          this.random(-1.4, -0.5), this.random(-1.3, -0.8), 0,
          o,
        );
      }
    }

    // Steam rising off sauce rivers and hot hazards in view.
    this.steamClock -= dt;
    while (this.steamClock <= 0) {
      this.steamClock += 1 / ambient.steamRate;
      for (const hazard of this.hazards) {
        const minX = Math.max(hazard.aabb.minX, cx - 16);
        const maxX = Math.min(hazard.aabb.maxX, cx + 16);
        if (maxX <= minX) continue;
        const o = this.style(ambient.steam, this.random(1.6, 2.4), 0.5, 1.9, 0.22);
        o.sway = 0.45;
        o.fade = FADE_IN_OUT;
        o.drag = 0.4;
        this.pool.spawn(
          this.random(minX, maxX), hazard.aabb.maxY - 0.1, this.random(-0.6, 0.8),
          this.random(-0.15, 0.15), this.random(0.9, 1.5), 0,
          o,
        );
      }
    }
  }

  animateProps(dt) {
    for (const ghost of this.ghosts) {
      if (ghost.t < 0) continue;
      ghost.t += dt;
      const t = ghost.t / GHOST_LIFE;
      if (t >= 1) {
        ghost.t = -1;
        ghost.sprite.visible = false;
        continue;
      }
      ghost.sprite.scale.set(ghost.w * (1 + 0.6 * t), ghost.h * (1 - 0.78 * t), 1);
      ghost.sprite.material.opacity = 1 - t * t;
    }

    const flag = this.flag;
    if (flag && this.flagPop >= 0 && !this.reduced) {
      if (!this.flagBase) this.flagBase = flag.scale.clone();
      this.flagPop += dt;
      const t = Math.min(1, this.flagPop / 0.6);
      const wobble = Math.sin(t * Math.PI * 3) * (1 - t) * 0.22;
      flag.scale.set(this.flagBase.x * (1 - wobble), this.flagBase.y * (1 + wobble), this.flagBase.z);
      if (t >= 1) {
        flag.scale.copy(this.flagBase);
        this.flagPop = -1;
      }
    }
  }

  // Advances particles, props, ambience and shake. dt is real frame time,
  // 0 while paused (particles freeze, shake keeps settling).
  update(dt) {
    this.time += dt;
    if (dt > 0) {
      this.ambientStep(dt);
      this.animateProps(dt);
    }
    stepShake(this.shake, dt);
    this.pool.update(dt);
  }

  beginRender(renderer) {
    renderer.getDrawingBufferSize(this.bufferSize);
    this.pool.setViewportScale(this.bufferSize.y, this.camera.fov);
    if (this.shake.trauma > 0) {
      this.camera.position.x += this.shake.x;
      this.camera.position.y += this.shake.y;
    }
  }

  endRender() {
    if (this.shake.trauma > 0) {
      this.camera.position.x -= this.shake.x;
      this.camera.position.y -= this.shake.y;
    }
  }

  dispose() {
    this.pool.dispose();
    for (const ghost of this.ghosts) {
      ghost.sprite.material.map = null;
      ghost.sprite.material.dispose();
      ghost.sprite.removeFromParent();
    }
  }
}

// Squash and stretch, jump and landing dust, run dust, eased turns and the
// hurt flash for one drawn chef. Feed it the chef's drawn motion each frame.
// shakes: whether this chef's hard landings and hits move the camera. Only
// the chef on this screen should.
export class ChefFx {
  constructor({ THREE, fx, shakes = true }) {
    this.fx = fx;
    this.shakes = shakes;
    this.squash = createSquash();
    this.turn = 1;
    this.hitFlash = 0;
    this.dustClock = 0;
    this.primed = false;
    this.wasGrounded = true;
    this.lastVy = 0;
    this.minAirVy = 0;
    this.lastFacing = 1;
    this.lastHearts = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
  }

  // Forget history, for example after a respawn or a snap, so a teleport
  // does not read as a landing.
  reset(grounded, vy, facing, hearts, x = this.lastX, y = this.lastY) {
    this.primed = true;
    this.lastX = x;
    this.lastY = y;
    this.wasGrounded = grounded;
    this.lastVy = vy;
    this.minAirVy = 0;
    this.lastFacing = facing;
    this.lastHearts = hearts;
  }

  observe(x, y, vx, vy, grounded, facing, hearts, dt) {
    // First frame, respawn, door or checkpoint snap: start fresh.
    if (!this.primed || Math.abs(x - this.lastX) + Math.abs(y - this.lastY) > 4) {
      this.reset(grounded, vy, facing, hearts, x, y);
      return;
    }
    const fx = this.fx;
    const reduced = fx.reduced;

    if (!grounded) this.minAirVy = Math.min(this.minAirVy, vy);
    if (this.wasGrounded && !grounded && vy > 4) {
      if (!reduced) kickSquash(this.squash, 1.28);
      fx.dust(x, y, 6, 2, 0.8);
    } else if (!grounded && vy - this.lastVy > 6 && vy > 4) {
      // Double jump, or the bounce off a stomped enemy.
      if (!reduced) kickSquash(this.squash, 1.22);
      fx.airPuff(x, y);
    }
    if (!this.wasGrounded && grounded) {
      const impact = Math.min(1, Math.max(0, (-this.minAirVy - 3) / 20));
      if (impact > 0.05) {
        if (!reduced) kickSquash(this.squash, 1 - 0.34 * impact);
        fx.dust(x, y, 4 + Math.round(10 * impact), 2.4 + impact * 2, 0.9);
        if (impact > 0.8 && this.shakes) fx.addShake(0.12);
      }
      this.minAirVy = 0;
    }

    const speed = Math.abs(vx);
    if (grounded && speed > 6.5) {
      this.dustClock -= dt;
      if (this.dustClock <= 0) {
        this.dustClock = speed > 9.5 ? 0.06 : 0.14;
        fx.dust(x - Math.sign(vx) * 0.35, y, 1, 0.6, 0.6, speed > 9.5 ? 0.6 : 0.42, 0.5);
      }
    }

    if (facing !== this.lastFacing) {
      this.turn = 0;
      if (grounded && speed > 3) fx.dust(x, y, 3, 1.2, 0.5, 0.35);
    }

    if (hearts < this.lastHearts) {
      this.hitFlash = HIT_FLASH_TIME;
      if (this.shakes) fx.addShake(0.5);
    }

    this.wasGrounded = grounded;
    this.lastVy = vy;
    this.lastFacing = facing;
    this.lastHearts = hearts;
    this.lastX = x;
    this.lastY = y;
  }

  // Scales and tints the chef sprite. Call after animateChefSprite.
  animate(rig, dt, grounded, vy) {
    const base = rig.userData.config.height;
    if (this.fx.reduced) {
      rig.scale.set(base, base, 1);
    } else {
      this.squash.target = grounded ? 1 : 1 + Math.min(0.1, Math.abs(vy) * 0.006);
      const sy = stepSquash(this.squash, dt);
      const sx = 1 + (1 - sy) * 0.85;
      this.turn = Math.min(1, this.turn + dt / TURN_TIME);
      const turnScale = 0.3 + 0.7 * easeOutBack(this.turn, 2.2);
      rig.scale.set(base * sx * turnScale, base * sy, 1);
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const k = this.hitFlash / HIT_FLASH_TIME;
      this.flashColor.setRGB(1 + 2.6 * k, 1 + 0.9 * k, 1 + 0.8 * k);
      rig.material.color.copy(this.flashColor);
    } else if (rig.material.color.r !== 1) {
      rig.material.color.setRGB(1, 1, 1);
    }
  }
}
