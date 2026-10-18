// Draws Don Funghi from fight state: poses, wind-up anticipation, ground
// warning markers, shockwaves, spores, hit flash, phase-change moment, the
// intro camera move, and the defeat sequence. It reads the shared fight state
// (solo) or the synced co-op view and never writes either one.
//
// Particles go through the existing ParticlePool. Every mesh here is created
// once in the constructor, so a fight allocates nothing per frame.

import { sfx } from '../audio/sfx.js';
import { BOSS_BODY } from '../gameplay/boss-fight.js';
import {
  addTrauma,
  createSquash,
  easeOutBack,
  kickSquash,
  prefersReducedMotion,
  stepSquash,
} from './motion-math.js';
import { ParticlePool, SHAPE_DISC } from './particle-pool.js';

const SPRITE_FOOT = 0.17;
const WARN = 0xff4d2e;
const SPORE = 0xc77dff;
const SPORE_WARN = 0x8a2be2;
const CAP = 0xa34fc9;
const CREAM = 0xfff1d6;
const CONFETTI = [0xd8341c, 0xf2b544, 0x5c9e2e, 0xfff3d0, 0xff8a3d, CAP];
const HAZARD_SLOTS = 8;
const HIT_FLASH = 0.22;
const HIT_STOP = 0.09;
const SLOW_MO = 0.32;
const SLOW_MO_TIME = 0.85;
const DEFEAT_POP = 1.15;

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function canvasTexture(THREE, width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function chevronTexture(THREE) {
  const texture = canvasTexture(THREE, 128, 64, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255, 90, 50, 0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 236, 200, 0.95)';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.12);
    ctx.lineTo(w * 0.62, h * 0.5);
    ctx.lineTo(w * 0.3, h * 0.88);
    ctx.stroke();
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function ringTexture(THREE) {
  return canvasTexture(THREE, 128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(0.86, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function beamTexture(THREE) {
  return canvasTexture(THREE, 16, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

export class BossPresenter {
  constructor({
    THREE,
    scene,
    visual,
    pool,
    shake = null,
    smoothing = 0,
    reduced = prefersReducedMotion(),
  }) {
    this.THREE = THREE;
    this.scene = scene;
    this.visual = visual;
    this.sprite = visual.sprite;
    this.ring = visual.ring;
    // Solo hands in the session effects pool. Co-op has no effects layer, so
    // the presenter brings a small pool of its own.
    this.ownsPool = !pool;
    this.pool = pool ?? new ParticlePool(THREE, 320);
    if (this.ownsPool) scene.add(this.pool.points);
    this.bufferSize = new THREE.Vector2();
    this.shake = shake;
    this.smoothing = smoothing;
    this.reduced = reduced;
    this.amount = reduced ? 0.4 : 1;
    this.groundY = visual.arena?.[1] ?? visual.home[1] - BOSS_BODY.restOffset;
    this.baseWidth = this.sprite.scale.x;
    this.baseHeight = this.sprite.scale.y;
    this.sprite.center.set(0.5, SPRITE_FOOT);
    this.flashColor = new THREE.Color(1, 1, 1);

    this.x = this.sprite.position.x;
    this.y = this.groundY;
    this.lastMode = 'sleep';
    this.lastHit = 0;
    this.lastImpact = 0;
    this.modeClock = 0;
    this.time = 0;
    this.hitFlash = 0;
    this.hitStop = 0;
    this.squash = createSquash();
    this.slowMo = 0;
    this.popped = false;
    this.lockWeight = 0;
    this.focusWeight = 0;
    this.focusZoom = 0;
    this.punchZoom = 0;
    this.cameraOffset = new THREE.Vector3();
    this.starClock = 0;
    this.trailClock = 0;
    this.initialized = false;

    this.textures = {
      chevron: chevronTexture(THREE),
      ring: ringTexture(THREE),
      beam: beamTexture(THREE),
    };

    // Charge lane: a strip on the floor with chevrons pointing where he goes.
    this.lane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 2.6),
      new THREE.MeshBasicMaterial({
        map: this.textures.chevron,
        transparent: true,
        depthWrite: false,
        color: WARN,
      }),
    );
    this.lane.rotation.x = -Math.PI / 2;
    this.lane.renderOrder = 3;
    this.lane.visible = false;
    scene.add(this.lane);

    // Target markers for slams and spores: a floor ring and a light beam.
    this.markers = [];
    for (let index = 0; index < HAZARD_SLOTS + 1; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.textures.ring,
          transparent: true,
          depthWrite: false,
          color: WARN,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 3;
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.textures.beam,
          transparent: true,
          depthWrite: false,
          color: WARN,
        }),
      );
      beam.renderOrder = 3;
      ring.visible = beam.visible = false;
      scene.add(ring, beam);
      this.markers.push({ ring, beam });
    }

    // Shockwave arches and falling spores, pooled by hazard id.
    this.slots = [];
    const arch = new THREE.TorusGeometry(0.62, 0.17, 8, 20, Math.PI);
    const ball = new THREE.SphereGeometry(0.55, 14, 10);
    for (let index = 0; index < HAZARD_SLOTS; index += 1) {
      const wave = new THREE.Mesh(arch, new THREE.MeshBasicMaterial({ color: 0xff6a1f }));
      const spore = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: SPORE }));
      wave.visible = spore.visible = false;
      scene.add(wave, spore);
      this.slots.push({ id: null, wave, spore, marker: this.markers[index + 1] });
    }
    this.sharedGeometries = [arch, ball];
  }

  get timeScale() {
    return this.slowMo > 0 ? SLOW_MO : 1;
  }

  // dt is real frame time (0 while paused). fight is the shared fight state
  // in solo or the synced boss view in co-op; field names match.
  update(dt, fight) {
    if (!fight) return;
    if (!this.initialized) {
      this.initialized = true;
      this.lastMode = fight.mode;
      this.lastHit = fight.hitRevision ?? 0;
      this.lastImpact = fight.impactRevision ?? 0;
    }
    if (dt <= 0) return;

    const realDt = dt;
    this.slowMo = Math.max(0, this.slowMo - realDt);
    const animDt = dt * this.timeScale;
    this.time += animDt;
    this.modeClock += animDt;

    const targetX = fight.positionX ?? fight.position?.x ?? this.x;
    const targetY = (fight.positionY ?? fight.position?.y ?? this.y + BOSS_BODY.restOffset)
      - BOSS_BODY.restOffset;
    if (this.smoothing > 0 && Math.abs(targetX - this.x) + Math.abs(targetY - this.y) < 4) {
      const blend = 1 - Math.exp(-this.smoothing * realDt);
      this.x += (targetX - this.x) * blend;
      this.y += (targetY - this.y) * blend;
    } else {
      this.x = targetX;
      this.y = targetY;
    }

    this.detect(fight);
    this.pose(animDt, fight);
    this.drawMarkers(fight);
    this.drawHazards(realDt, fight);
    this.ambient(animDt, fight);
    this.updateCameraWeight(fight, realDt);
    if (this.ownsPool) this.pool.update(animDt);
  }

  detect(fight) {
    if (fight.mode !== this.lastMode) {
      this.onMode(fight.mode, fight);
      this.lastMode = fight.mode;
      this.modeClock = 0;
    }
    const hit = fight.hitRevision ?? 0;
    if (hit > this.lastHit) {
      this.lastHit = hit;
      this.onHit();
    }
    const impact = fight.impactRevision ?? 0;
    if (impact > this.lastImpact) {
      this.lastImpact = impact;
      this.onImpact(fight);
    }
  }

  onMode(mode, fight) {
    if (mode === 'intro') {
      sfx.boss();
      if (!this.reduced) kickSquash(this.squash, 1.3);
      this.puff(this.x, this.y + 0.4, 14, CREAM, 3.5);
    } else if (mode === 'windup') {
      sfx.bossWindup();
    } else if (mode === 'charge') {
      sfx.boss();
      this.dust(this.x, this.y, 10, -fight.chargeDirection);
    } else if (mode === 'leap') {
      sfx.jump();
      this.dust(this.x, this.y, 8, 0);
    } else if (mode === 'taunt') {
      sfx.bossWindup();
      this.puff(this.x, this.y + 4.2, 12, SPORE, 2.6);
    } else if (mode === 'roar') {
      sfx.bossRoar();
      this.trauma(0.5);
      this.ringBurst(this.x, this.y + 2, CAP, 26, 7);
      this.ringBurst(this.x, this.y + 2, CREAM, 14, 4.5);
    } else if (mode === 'defeated') {
      sfx.bossDefeat();
      if (!this.reduced) this.slowMo = SLOW_MO_TIME;
      this.popped = false;
    }
  }

  onHit() {
    sfx.stomp();
    this.hitFlash = HIT_FLASH;
    if (!this.reduced) {
      this.hitStop = HIT_STOP;
      kickSquash(this.squash, 0.6);
    }
    this.puff(this.x, this.y + 3.6, 16, CAP, 6);
    this.puff(this.x, this.y + 3.6, 8, CREAM, 4);
    this.sparkle(this.x, this.y + 4.4, 0xfff3c0, 10, 5);
  }

  onImpact(fight) {
    sfx.bossSlam();
    if (!this.reduced) kickSquash(this.squash, 0.68);
    this.trauma(fight.mode === 'tired' && fight.attack === 'charge' ? 0.4 : 0.55);
    this.dust(this.x, this.y, 18, 0, 3.4);
    if (fight.attack === 'charge') this.sparkle(this.x + (fight.chargeDirection ?? 1) * 1.8, this.y + 2.6, 0xfff3c0, 8, 4);
  }

  pose(dt, fight) {
    const sprite = this.sprite;
    const mode = fight.mode;
    const clock = this.modeClock;
    const duration = Math.max(0.001, fight.duration ?? 1);
    const progress = Math.min(1, clock / duration);
    let sx = 1;
    let sy = 1;
    let lean = 0;
    let jitter = 0;
    let lift = 0;
    let tint = null;

    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
      dt = 0;
    }
    const spring = this.reduced ? 1 : stepSquash(this.squash, dt);

    switch (mode) {
      case 'sleep':
        sy = 1 + Math.sin(this.time * 1.4) * 0.025;
        lean = Math.sin(this.time * 0.7) * 0.04;
        break;
      case 'intro': {
        const grow = easeOutBack(Math.min(1, clock / 0.55), 2.4);
        sx = sy = 0.9 + 0.1 * grow;
        sy += Math.sin(this.time * 3) * 0.02;
        break;
      }
      case 'idle':
      case 'taunt':
        sy = 1 + Math.sin(this.time * 3.2) * 0.035;
        sx = 1 - (sy - 1) * 0.6;
        if (mode === 'taunt') lean = Math.sin(this.time * 9) * 0.08;
        break;
      case 'windup': {
        // Anticipation: sink and coil, shaking harder as the attack nears.
        const coil = smoothstep(0, 0.7, progress);
        const deep = fight.attack === 'slam' ? 0.24 : fight.attack === 'spores' ? -0.1 : 0.16;
        sy = 1 - deep * coil;
        sx = 1 + deep * 0.7 * coil;
        jitter = this.reduced ? 0 : 0.04 + 0.1 * progress;
        if (fight.attack === 'charge') lean = (fight.chargeDirection ?? 1) * 0.22 * coil;
        tint = 0.35 * coil;
        break;
      }
      case 'charge':
        sx = 1.1;
        sy = 0.92 + Math.abs(Math.sin(this.time * 16)) * 0.06;
        lean = -(fight.chargeDirection ?? 1) * 0.2;
        lift = Math.abs(Math.sin(this.time * 16)) * 0.25;
        break;
      case 'leap': {
        const rising = progress < 0.5;
        sy = rising ? 1.16 : 1.08;
        sx = rising ? 0.86 : 0.92;
        lean = Math.sin(progress * Math.PI) * 0.1 * Math.sign((fight.targetX ?? this.x) - this.x || 1);
        break;
      }
      case 'tired':
        sy = 0.9 + Math.sin(this.time * 2.2) * 0.02;
        sx = 1.06;
        lean = Math.sin(this.time * 2.6) * 0.14;
        break;
      case 'hurt':
        lean = Math.sin(clock * 30) * 0.18 * (1 - progress);
        break;
      case 'roar': {
        const swell = Math.sin(Math.min(1, clock / 0.9) * Math.PI);
        sx = sy = 1 + 0.18 * swell;
        jitter = this.reduced ? 0 : 0.12 * swell;
        tint = 0.6 * swell;
        break;
      }
      case 'defeated': {
        const wobble = Math.max(0, 1 - clock / DEFEAT_POP);
        lean = Math.sin(clock * 13) * 0.3 * wobble;
        sy = 0.95 - 0.08 * smoothstep(0, DEFEAT_POP, clock);
        sx = 1.04;
        if (clock >= DEFEAT_POP && !this.popped) this.pop();
        if (this.popped) {
          const shrink = smoothstep(DEFEAT_POP, DEFEAT_POP + 0.25, clock);
          sx = sy = 1.2 * (1 - shrink);
        }
        break;
      }
      default:
        break;
    }

    if (!this.reduced) {
      sy *= spring;
      sx *= 1 + (1 - spring) * 0.8;
    } else {
      lean *= 0.3;
    }

    const shakeX = jitter ? Math.sin(this.time * 71) * jitter : 0;
    sprite.position.set(this.x + shakeX, this.y + lift, sprite.position.z);
    sprite.scale.set(this.baseWidth * sx, this.baseHeight * sy, 1);
    sprite.material.rotation = lean;
    sprite.visible = mode !== 'done' && !(this.popped && sx < 0.02);

    // Hit flash is white-hot, wind-up and roar glow red.
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const k = this.hitFlash / HIT_FLASH;
      this.flashColor.setRGB(1 + 2.4 * k, 1 + 2.4 * k, 1 + 2.4 * k);
    } else if (tint) {
      this.flashColor.setRGB(1 + tint, 1 - tint * 0.35, 1 - tint * 0.35);
    } else if (mode === 'defeated' && !this.popped) {
      const blink = Math.sin(this.modeClock * 26) > 0 ? 1.6 : 1;
      this.flashColor.setRGB(blink, blink, blink);
    } else {
      this.flashColor.setRGB(1, 1, 1);
    }
    sprite.material.color.copy(this.flashColor);

    // Floor ring: purple at rest, red on wind-up, green when he can be stomped.
    const ring = this.ring;
    ring.position.set(this.x, this.groundY + 0.06, 0);
    ring.rotation.z += dt * (mode === 'tired' ? 4 : 2);
    ring.visible = fight.awake !== false && mode !== 'sleep' && mode !== 'done' && !this.popped;
    ring.material.color.set(
      mode === 'tired' ? 0x8fd42a : mode === 'windup' || mode === 'charge' || mode === 'leap' ? WARN : CAP,
    );
    const ringScale = mode === 'tired' ? 1 + Math.sin(this.time * 8) * 0.08 : 1;
    ring.scale.set(ringScale, ringScale, ringScale);
  }

  drawMarkers(fight) {
    const mode = fight.mode;
    const pulse = this.reduced ? 0.8 : 0.6 + 0.4 * Math.abs(Math.sin(this.time * (8 + 10 * Math.min(1, this.modeClock))));

    // Charge lane during the wind-up.
    const laneOn = mode === 'windup' && fight.attack === 'charge';
    this.lane.visible = laneOn;
    if (laneOn) {
      const from = this.x;
      const to = fight.targetX ?? from;
      const length = Math.max(1, Math.abs(to - from) + BOSS_BODY.width / 2);
      const direction = Math.sign(to - from) || 1;
      this.lane.position.set(from + direction * length / 2, this.groundY + 0.04, 0);
      this.lane.scale.set(length, 1, 1);
      this.textures.chevron.repeat.set(direction * length / 2.2, 1);
      this.textures.chevron.offset.x = this.reduced ? 0 : -this.time * 1.6;
      this.lane.material.opacity = pulse;
    }

    // Slam landing marker from the wind-up until he lands.
    const slamOn = (mode === 'windup' && fight.attack === 'slam') || mode === 'leap';
    const marker = this.markers[0];
    marker.ring.visible = marker.beam.visible = slamOn;
    if (slamOn) this.placeMarker(marker, fight.targetX ?? this.x, 3.6, WARN, pulse);
  }

  placeMarker(marker, x, size, color, opacity) {
    marker.ring.position.set(x, this.groundY + 0.05, 0);
    marker.ring.scale.set(size, size * 0.8, 1);
    marker.ring.material.color.set(color);
    marker.ring.material.opacity = opacity;
    marker.beam.position.set(x, this.groundY + 3, 0.2);
    marker.beam.scale.set(size * 0.55, 6, 1);
    marker.beam.material.color.set(color);
    marker.beam.material.opacity = opacity * 0.65;
  }

  drawHazards(dt, fight) {
    const hazards = fight.hazards ?? [];
    for (const slot of this.slots) slot.live = false;
    for (const hazard of hazards) {
      let slot = this.slots.find((candidate) => candidate.id === hazard.id);
      if (!slot) slot = this.slots.find((candidate) => candidate.id === null);
      if (!slot) continue;
      slot.id = hazard.id;
      slot.live = true;
      const x = hazard.positionX ?? hazard.position?.x ?? 0;
      const y = hazard.positionY ?? hazard.position?.y ?? this.groundY;
      if (hazard.kind === 'wave') {
        slot.wave.visible = true;
        slot.spore.visible = false;
        slot.marker.ring.visible = slot.marker.beam.visible = false;
        const stretch = this.reduced ? 1 : 1 + Math.sin(this.time * 20) * 0.08;
        slot.wave.position.set(x, this.groundY, 0.3);
        slot.wave.scale.set(stretch, 1 / stretch, 1);
        this.trailClock -= dt;
        if (this.trailClock <= 0) {
          this.trailClock = 0.05;
          this.dust(x, this.groundY, 1, -Math.sign(hazard.velocityX ?? 0), 1.2);
        }
      } else {
        const falling = hazard.state === 'fall';
        slot.spore.visible = falling;
        slot.wave.visible = false;
        slot.marker.ring.visible = slot.marker.beam.visible = true;
        const urgency = falling ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(this.time * 10));
        this.placeMarker(slot.marker, x, 2.4, SPORE_WARN, this.reduced ? 0.9 : urgency);
        if (falling) {
          slot.spore.position.set(x, y, 0.3);
          slot.spore.rotation.z += dt * 6;
          slot.lastX = x;
          slot.lastY = Math.max(this.groundY + 0.4, y);
        }
      }
    }
    for (const slot of this.slots) {
      if (slot.live || slot.id === null) continue;
      // A spore that hits the floor or a chef pops into a puff.
      if (slot.spore.visible) this.puff(slot.lastX, slot.lastY, 10, SPORE, 3);
      slot.id = null;
      slot.wave.visible = slot.spore.visible = false;
      slot.marker.ring.visible = slot.marker.beam.visible = false;
    }
  }

  ambient(dt, fight) {
    if (dt <= 0) return;
    // Dizzy stars circle his cap while he can be stomped.
    if (fight.mode === 'tired') {
      this.starClock -= dt;
      if (this.starClock <= 0) {
        this.starClock = 0.09;
        const angle = this.time * 5;
        this.pool.spawn(
          this.x + Math.cos(angle) * 1.4, this.y + 4.5 + Math.sin(angle) * 0.3, 0.6,
          -Math.sin(angle) * 1.2, 0.2, 0,
          { color: 0xffe066, tint: 1.3, life: 0.45, size: 0.34, sizeEnd: 0.08, alpha: 1, shape: SHAPE_DISC },
        );
      }
    }
    // Speed dust behind a charge.
    if (fight.mode === 'charge') {
      this.trailClock -= dt;
      if (this.trailClock <= 0) {
        this.trailClock = 0.045;
        this.dust(this.x - (fight.chargeDirection ?? 1) * 1.2, this.y, 2, -(fight.chargeDirection ?? 1), 1.4);
      }
    }
  }

  pop() {
    this.popped = true;
    this.trauma(0.8);
    this.ringBurst(this.x, this.y + 2.4, CAP, 36, 9);
    this.ringBurst(this.x, this.y + 2.4, CREAM, 20, 6);
    this.confetti(this.x, this.y + 3, 80, 12);
    this.sparkle(this.x, this.y + 3, 0xfff3c0, 18, 6);
  }

  updateCameraWeight(fight, dt) {
    // Arena framing: once he is awake the camera eases back and holds the
    // arena, drifting only a little with the chef, so his attacks are never
    // off screen. It is a calm, static frame, so reduced motion keeps it.
    const fighting = fight.awake !== false && fight.mode !== 'sleep' && fight.mode !== 'done';
    this.lockWeight += ((fighting ? 1 : 0) - this.lockWeight) * (1 - Math.exp(-2.2 * dt));

    this.focusWeight = 0;
    this.focusZoom = 0;
    this.punchZoom = 0;
    if (this.reduced) return;
    const clock = this.modeClock;
    if (fight.mode === 'intro') {
      const duration = fight.duration ?? 3.4;
      this.focusWeight = smoothstep(0, 0.9, clock) * (1 - smoothstep(duration - 0.9, duration, clock));
      this.focusZoom = 4;
    } else if (fight.mode === 'defeated') {
      this.focusWeight = smoothstep(0, 0.6, clock) * (1 - smoothstep(2, 2.6, clock));
      this.focusZoom = 5;
    } else if (fight.mode === 'roar') {
      this.punchZoom = 2.4 * Math.sin(Math.min(1, clock / 0.9) * Math.PI);
    }
  }

  // Frames the arena during the fight and eases in on him for the intro and
  // the defeat. Call after the follow camera is placed and before rendering;
  // restoreCamera undoes it so the follow camera never drifts.
  applyCamera(camera, renderer = null) {
    if (this.ownsPool && renderer) {
      renderer.getDrawingBufferSize(this.bufferSize);
      this.pool.setViewportScale(this.bufferSize.y, camera.fov);
    }
    const offset = this.cameraOffset;
    const base = camera.position;
    const centerX = this.visual.arena?.[0] ?? this.x;
    const lockX = centerX + Math.max(-4, Math.min(4, base.x - centerX));
    let x = (lockX - base.x) * this.lockWeight;
    let y = 1.2 * this.lockWeight;
    let z = 7 * this.lockWeight;
    if (this.focusWeight > 0) {
      // A close-up on him replaces the arena frame for the intro and defeat.
      const w = this.focusWeight;
      x += (this.x - base.x - x) * w;
      y += (this.y + 3.6 - base.y - y) * w;
      z += (-this.focusZoom - z) * w;
    }
    z -= this.punchZoom;
    offset.set(x, y, z);
    camera.position.add(offset);
  }

  restoreCamera(camera) {
    camera.position.sub(this.cameraOffset);
  }

  trauma(amount) {
    if (this.shake && !this.reduced) addTrauma(this.shake, amount);
  }

  count(n) {
    return Math.max(1, Math.round(n * this.amount));
  }

  puff(x, y, count, color, speed) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2 + index * 0.37;
      const power = speed * (0.45 + ((index * 7) % 5) / 8);
      this.pool.spawn(
        x, y, 0.5,
        Math.cos(angle) * power, Math.abs(Math.sin(angle)) * power * 0.8 + 1, 0,
        { color, tint: index % 3 === 0 ? 1.2 : 1, life: 0.55, size: 0.4, sizeEnd: 0.08, alpha: 0.95, gravity: 9, drag: 1.4, shape: SHAPE_DISC },
      );
    }
  }

  ringBurst(x, y, color, count, speed) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2;
      const power = speed * (0.55 + ((index * 5) % 7) / 12);
      this.pool.spawn(
        x, y, 0.6,
        Math.cos(angle) * power, Math.sin(angle) * power, 0,
        { color, tint: 1.2, life: 0.7, size: 0.32, sizeEnd: 0.06, alpha: 1, drag: 2.6, shape: SHAPE_DISC },
      );
    }
  }

  sparkle(x, y, color, count, speed) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = (index / total) * Math.PI * 2;
      this.pool.spawn(
        x, y, 0.7,
        Math.cos(angle) * speed, Math.sin(angle) * speed, 0,
        { color, tint: 1.3, life: 0.5, size: 0.24, sizeEnd: 0.04, alpha: 1, drag: 4.5, shape: SHAPE_DISC },
      );
    }
  }

  dust(x, y, count, direction = 0, power = 2.4) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const spread = direction === 0 ? (index % 2 === 0 ? 1 : -1) : direction;
      this.pool.spawn(
        x + spread * 0.4, y + 0.1, 0.4 + (index % 3) * 0.2,
        spread * power * (0.5 + (index % 4) / 6), 0.4 + (index % 3) * 0.35, 0,
        { color: 0xdcc08e, life: 0.5, size: 0.6, sizeEnd: 1.4, alpha: 0.6, drag: 3, gravity: -0.4 },
      );
    }
  }

  confetti(x, y, count, power) {
    const total = this.count(count);
    for (let index = 0; index < total; index += 1) {
      const angle = Math.PI * (0.18 + 0.64 * ((index * 37) % total) / total);
      const speed = power * (0.45 + ((index * 13) % 11) / 20);
      this.pool.spawn(
        x, y, 0.2 + (index % 5) * 0.15,
        Math.cos(angle) * speed, Math.sin(angle) * speed, 0,
        { color: CONFETTI[index % CONFETTI.length], life: 1.6, size: 0.34, alpha: 1, gravity: 9, drag: 1.6, sway: 1.4, shape: SHAPE_DISC },
      );
    }
  }

  dispose() {
    this.lane.geometry.dispose();
    this.lane.material.dispose();
    this.lane.removeFromParent();
    for (const marker of this.markers) {
      for (const mesh of [marker.ring, marker.beam]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.removeFromParent();
      }
    }
    for (const slot of this.slots) {
      for (const mesh of [slot.wave, slot.spore]) {
        mesh.material.dispose();
        mesh.removeFromParent();
      }
    }
    for (const geometry of this.sharedGeometries) geometry.dispose();
    if (this.ownsPool) this.pool.dispose();
    for (const texture of Object.values(this.textures)) texture.dispose();
  }
}
