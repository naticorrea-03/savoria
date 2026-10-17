// Presentation layer for a solo GameSession: squash and stretch, dust,
// pickup pops, defeat bursts, celebrations, ambient particles, and capped
// screen shake. It reads session state after simulation and never writes
// gameplay state, so the authoritative co-op sim cannot drift because of it.

import { THEMES } from '../levels/themes.js';
import { FADE_IN_OUT, ParticlePool, SHAPE_DISC } from './particle-pool.js';
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

export class SessionFx {
  constructor({ THREE, session }) {
    this.THREE = THREE;
    this.session = session;
    this.reduced = prefersReducedMotion();
    this.amount = this.reduced ? 0.4 : 1;
    this.pool = new ParticlePool(THREE, 640);
    session.scene.add(this.pool.points);

    this.shake = createShake();
    this.squash = createSquash();
    this.turn = 1;
    this.hitFlash = 0;
    this.time = 0;
    this.dustClock = 0;
    this.moteClock = 0;
    this.petalClock = 0;
    this.steamClock = 0;
    this.flagPop = -1;
    this.flagBase = null;

    const player = session.player;
    this.wasGrounded = player.grounded;
    this.lastVy = player.vel.y;
    this.minAirVy = 0;
    this.lastFacing = player.facing;
    this.lastHearts = session.hearts;
    this.lastCheckpoint = session.passedCheckpoint;
    this.lastDoorCooldown = session.doorCooldown;
    this.lastBossHp = session.bossState?.hp ?? null;
    this.seenCoins = new WeakSet();
    this.seenEnemies = new WeakSet();

    const key = themeKey(session.level.theme);
    this.ambient = AMBIENT[key] ?? AMBIENT.default;

    this.ghosts = [];
    for (let index = 0; index < GHOST_COUNT; index += 1) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      session.scene.add(sprite);
      this.ghosts.push({ sprite, t: -1, w: 1, h: 1 });
    }
    this.ghostCursor = 0;

    this.screen = new THREE.Vector3();
    this.bufferSize = new THREE.Vector2();
    this.flashColor = new THREE.Color(1, 1, 1);
  }

  random(min, max) {
    return min + Math.random() * (max - min);
  }

  count(n) {
    return Math.max(1, Math.round(n * this.amount));
  }

  // Drop-in for GameSession.burst used by entities and the boss.
  burst(position, color, count = 10, spread = 4) {
    const total = this.count(count * 1.4);
    for (let index = 0; index < total; index += 1) {
      const angle = this.random(0, Math.PI * 2);
      const speed = this.random(0.35, 1) * spread;
      this.pool.spawn(
        position.x, position.y, position.z + 0.3,
        Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * 0.9 + 1.2, this.random(-0.5, 0.5),
        {
          color,
          tint: index % 3 === 0 ? 1.25 : 1,
          life: this.random(0.45, 0.8),
          size: this.random(0.26, 0.42),
          sizeEnd: 0.06,
          alpha: 0.95,
          gravity: 14,
          drag: 1.2,
          shape: SHAPE_DISC,
        },
      );
    }
  }

  dust(x, y, count, { spreadX = 1.6, up = 1.2, size = 0.62, color = 0xdcc08e, alpha = 0.62 } = {}) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      this.pool.spawn(
        x + this.random(-0.25, 0.25), y + 0.08, this.random(-0.2, 0.4),
        this.random(-spreadX, spreadX), this.random(0.2, up), 0,
        { color, life: this.random(0.35, 0.6), size: size * this.random(0.6, 1), sizeEnd: size * 1.9, alpha, drag: 3.2, gravity: -0.4 },
      );
    }
  }

  sparkle(x, y, z, color, count, speed = 3.2) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2 + this.random(-0.2, 0.2);
      this.pool.spawn(
        x, y, z,
        Math.cos(angle) * speed, Math.sin(angle) * speed, 0,
        { color, tint: 1.3, life: 0.5, size: 0.36, sizeEnd: 0.04, alpha: 1, drag: 4.5, shape: SHAPE_DISC },
      );
    }
  }

  confetti(x, y, count, power = 9) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = this.random(Math.PI * 0.18, Math.PI * 0.82);
      const speed = this.random(0.45, 1) * power;
      this.pool.spawn(
        x + this.random(-0.4, 0.4), y, this.random(-0.3, 0.6),
        Math.cos(angle) * speed, Math.sin(angle) * speed, this.random(-0.6, 0.6),
        {
          color: CONFETTI[index % CONFETTI.length],
          life: this.random(1.1, 1.8),
          size: this.random(0.26, 0.4),
          alpha: 1,
          gravity: 9,
          drag: 1.6,
          sway: 1.4,
          shape: SHAPE_DISC,
        },
      );
    }
  }

  spawnGhost(enemy) {
    const ghost = this.ghosts[this.ghostCursor];
    this.ghostCursor = (this.ghostCursor + 1) % GHOST_COUNT;
    ghost.sprite.material.map = enemy.sprite.material.map;
    ghost.sprite.material.needsUpdate = true;
    ghost.sprite.position.copy(enemy.sprite.position);
    ghost.w = enemy.sprite.scale.x;
    ghost.h = enemy.sprite.scale.y;
    ghost.t = 0;
    ghost.sprite.visible = true;
  }

  celebrate() {
    const goal = this.session.goalObject?.position ?? this.session.player.pos;
    this.confetti(goal.x, goal.y + 1.5, 90, 12);
    this.sparkle(goal.x, goal.y + 2, 0.5, 0xfff3c0, 16, 5);
    if (!this.reduced) addTrauma(this.shake, 0.25);
  }

  flyTomato(position, count = 1) {
    if (this.reduced) return;
    this.screen.copy(position).project(this.session.camera);
    const x = (this.screen.x + 1) * 0.5 * innerWidth;
    const y = (1 - this.screen.y) * 0.5 * innerHeight;
    this.session.emit('fx', { type: 'tomato', x, y, count });
  }

  detect(dt) {
    const session = this.session;
    const player = session.player;
    const reduced = this.reduced;
    const footX = player.pos.x;
    const footY = player.pos.y;

    // Jumps, double jumps, landings.
    if (!player.grounded) this.minAirVy = Math.min(this.minAirVy, player.vel.y);
    if (this.wasGrounded && !player.grounded && player.vel.y > 4) {
      if (!reduced) kickSquash(this.squash, 1.28);
      this.dust(footX, footY, 6, { spreadX: 2, up: 0.8 });
    } else if (!player.grounded && player.vel.y - this.lastVy > 6 && player.vel.y > 4) {
      if (!reduced) kickSquash(this.squash, 1.22);
      const total = this.count(10);
      for (let index = 0; index < total; index += 1) {
        const angle = (index / total) * Math.PI * 2;
        this.pool.spawn(
          footX, footY + 0.1, 0.3,
          Math.cos(angle) * 3.2, Math.sin(angle) * 0.9 - 0.6, Math.sin(angle) * 1.2,
          { color: 0xffffff, life: 0.38, size: 0.34, sizeEnd: 0.6, alpha: 0.55, drag: 5 },
        );
      }
    }
    if (!this.wasGrounded && player.grounded) {
      const impact = Math.min(1, Math.max(0, (-this.minAirVy - 3) / 20));
      if (impact > 0.05) {
        if (!reduced) kickSquash(this.squash, 1 - 0.34 * impact);
        this.dust(footX, footY, 4 + Math.round(10 * impact), { spreadX: 2.4 + impact * 2, up: 0.9 });
        if (impact > 0.8 && !reduced) addTrauma(this.shake, 0.12);
      }
      this.minAirVy = 0;
    }

    // Run dust and skids.
    const speed = Math.abs(player.vel.x);
    if (player.grounded && speed > 6.5) {
      this.dustClock -= dt;
      if (this.dustClock <= 0) {
        this.dustClock = speed > 9.5 ? 0.06 : 0.14;
        this.dust(footX - Math.sign(player.vel.x) * 0.35, footY, 1, {
          spreadX: 0.6, up: 0.6, size: speed > 9.5 ? 0.6 : 0.42, alpha: 0.5,
        });
      }
    }

    // Eased facing flip.
    if (player.facing !== this.lastFacing) {
      this.turn = 0;
      if (player.grounded && speed > 3) this.dust(footX, footY, 3, { spreadX: 1.2, up: 0.5, size: 0.35 });
    }

    // Hurt and heal.
    if (session.hearts < this.lastHearts) {
      this.hitFlash = HIT_FLASH_TIME;
      if (!reduced) addTrauma(this.shake, 0.5);
    }

    // Tomatoes.
    for (const coin of session.coins) {
      if (!coin.taken || this.seenCoins.has(coin)) continue;
      this.seenCoins.add(coin);
      const p = coin.sprite.position;
      this.sparkle(p.x, p.y, p.z + 0.3, 0xffd36b, 8, 3.6);
      this.pool.spawn(p.x, p.y, p.z + 0.2, 0, 0, 0, {
        color: 0xffe9a8, life: 0.32, size: 0.8, sizeEnd: 2.6, alpha: 0.65,
      });
      this.flyTomato(p, 1);
    }

    // Enemy defeats.
    for (const enemy of session.enemies) {
      if (!enemy.dead || this.seenEnemies.has(enemy)) continue;
      this.seenEnemies.add(enemy);
      const p = enemy.sprite.position;
      const [a, b] = SAUCE[enemy.t] ?? SAUCE.meatball;
      this.burst(p, a, 6, 5);
      this.burst(p, b, 4, 3.5);
      this.pool.spawn(p.x, p.y, p.z + 0.4, 0, 0, 0, {
        color: 0xffffff, life: 0.2, size: 0.8, sizeEnd: 3, alpha: 0.7,
      });
      if (!reduced) {
        this.spawnGhost(enemy);
        addTrauma(this.shake, 0.38);
      }
      this.flyTomato(p, 2);
    }

    // Checkpoint.
    if (session.passedCheckpoint && !this.lastCheckpoint && session.level.checkpoint) {
      const [x, y] = session.level.checkpoint;
      this.confetti(x, y + 3, 46, 8);
      this.sparkle(x, y + 3.2, 0.8, 0xfff0b0, 12, 4);
      this.flagPop = 0;
    }

    // Doors.
    if (session.doorCooldown > this.lastDoorCooldown + 0.5) {
      this.sparkle(player.pos.x, player.pos.y + 1, 0.4, 0xffe9a0, 18, 4.5);
      if (!reduced) addTrauma(this.shake, 0.15);
    }

    // Boss hits.
    const bossHp = session.bossState?.hp ?? null;
    if (this.lastBossHp !== null && (bossHp === null || bossHp < this.lastBossHp)) {
      if (!reduced) addTrauma(this.shake, bossHp === null ? 0.8 : 0.6);
    }

    this.wasGrounded = player.grounded;
    this.lastVy = player.vel.y;
    this.lastFacing = player.facing;
    this.lastHearts = session.hearts;
    this.lastCheckpoint = session.passedCheckpoint;
    this.lastDoorCooldown = session.doorCooldown;
    this.lastBossHp = bossHp;
  }

  ambientStep(dt) {
    if (this.reduced || dt <= 0) return;
    const camera = this.session.camera;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const ambient = this.ambient;

    this.moteClock -= dt;
    while (this.moteClock <= 0) {
      this.moteClock += 1 / ambient.moteRate;
      this.pool.spawn(
        cx + this.random(-17, 17), cy + this.random(-9, 6), this.random(-7, 3),
        this.random(-0.35, 0.35), this.random(0.1, 0.45), 0,
        { color: ambient.mote, life: this.random(3.5, 6), size: this.random(0.06, 0.13), alpha: 0.75, sway: 0.25, fade: FADE_IN_OUT, shape: SHAPE_DISC },
      );
    }

    if (ambient.petal) {
      this.petalClock -= dt;
      while (this.petalClock <= 0) {
        this.petalClock += 1 / ambient.petalRate;
        this.pool.spawn(
          cx + this.random(-15, 19), cy + 8, this.random(-5, 2),
          this.random(-1.4, -0.5), this.random(-1.3, -0.8), 0,
          { color: ambient.petal, life: this.random(6, 9), size: this.random(0.16, 0.24), alpha: 0.9, sway: 1.2, fade: FADE_IN_OUT, shape: SHAPE_DISC },
        );
      }
    }

    // Steam rising off sauce rivers and hot hazards in view.
    this.steamClock -= dt;
    while (this.steamClock <= 0) {
      this.steamClock += 1 / ambient.steamRate;
      for (const hazard of this.session.hazards) {
        const minX = Math.max(hazard.aabb.minX, cx - 16);
        const maxX = Math.min(hazard.aabb.maxX, cx + 16);
        if (maxX <= minX) continue;
        this.pool.spawn(
          this.random(minX, maxX), hazard.aabb.maxY - 0.1, this.random(-0.6, 0.8),
          this.random(-0.15, 0.15), this.random(0.9, 1.5), 0,
          { color: ambient.steam, life: this.random(1.6, 2.4), size: 0.5, sizeEnd: 1.9, alpha: 0.22, sway: 0.45, fade: FADE_IN_OUT, drag: 0.4 },
        );
      }
    }
  }

  animateRig(dt) {
    const session = this.session;
    const rig = session.rig;
    const player = session.player;
    const base = rig.userData.config.height;

    if (this.reduced) {
      rig.scale.set(base, base, 1);
    } else {
      // Gentle stretch in fast vertical motion, springs for impacts.
      this.squash.target = player.grounded
        ? 1
        : 1 + Math.min(0.1, Math.abs(player.vel.y) * 0.006);
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

    const flag = this.session.checkpointFlag;
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

  // Called once per rendered frame with real frame time (0 while paused).
  update(dt) {
    this.time += dt;
    if (dt > 0) {
      this.detect(dt);
      this.ambientStep(dt);
      this.animateProps(dt);
      this.animateRig(dt);
    }
    stepShake(this.shake, dt);
    this.pool.update(dt);
  }

  beginRender(renderer) {
    renderer.getDrawingBufferSize(this.bufferSize);
    this.pool.setViewportScale(this.bufferSize.y, this.session.camera.fov);
    if (this.shake.trauma > 0) {
      this.session.camera.position.x += this.shake.x;
      this.session.camera.position.y += this.shake.y;
    }
  }

  endRender() {
    if (this.shake.trauma > 0) {
      this.session.camera.position.x -= this.shake.x;
      this.session.camera.position.y -= this.shake.y;
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
