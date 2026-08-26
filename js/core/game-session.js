import * as THREE from '../../vendor/three.module.js';
import { sfx } from '../audio/sfx.js';
import { AABB } from './aabb.js';
import { buildChef, animateChefRig } from './chef-rig.js';
import { FixedStepLoop } from './fixed-step-loop.js';
import { buildWorldScene } from './world-builder.js';
import { updateBoss } from '../gameplay/boss.js';
import { updateEntities } from '../gameplay/entities.js';
import { InputState } from '../gameplay/input-state.js';
import {
  DEFAULT_MOTION,
  createPlayerMotion,
  stepPlayerMotion,
} from '../gameplay/player-motion.js';

export const INITIAL_HEARTS = 3;
const MAX_HEARTS = 5;
const BASE_ANIMATION_SPEED = 8.6;

export class GameSession {
  constructor({ container, level, characterId, textures, emit }) {
    this.container = container;
    this.level = level;
    this.characterId = characterId;
    this.textures = textures;
    this.emit = emit;
    this.running = false;
    this.destroyed = false;
    this.finished = false;
    this.previousFrame = 0;
    this.raf = 0;
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      innerWidth / innerHeight,
      0.1,
      400,
    );
    this.sceneState = buildWorldScene({
      THREE,
      scene: this.scene,
      level,
      textures,
    });
    this.solids = this.sceneState.solids;
    this.hazards = this.sceneState.hazards;
    this.coins = this.sceneState.coins;
    this.items = this.sceneState.items;
    this.enemies = this.sceneState.enemies;
    this.doors = this.sceneState.doors;
    this.decoSpins = this.sceneState.decoSpins;
    this.checkpointFlag = this.sceneState.checkpointFlag;
    this.goalObject = this.sceneState.goalObject;
    this.bossState = this.sceneState.bossState;
    this.sun = this.sceneState.sun;

    this.input = new InputState();
    this.loop = new FixedStepLoop({ step: 1 / 60, maxSteps: 5 });
    this.projectiles = [];
    this.particles = [];
    this.time = level.time;
    this.coinsGot = 0;
    this.hearts = INITIAL_HEARTS;
    this.maxHearts = MAX_HEARTS;
    this.invuln = 0;
    this.power = null;
    this.passedCheckpoint = false;
    this.doorCooldown = 0;
    this.shownTutorials = new Set();

    this.buildPlayer();
    this.attachInput();

    this.onResize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this.onResize);
  }

  buildPlayer() {
    this.rig = buildChef(this.characterId);
    this.scene.add(this.rig);
    this.rig.rotation.y = 1.15;
    this.player = {
      pos: new THREE.Vector3(...this.level.spawn),
      vel: new THREE.Vector3(),
      w: 0.8,
      h: 1.55,
      d: 0.8,
      grounded: false,
      coyote: 0,
      facing: 1,
      groundMover: null,
    };

    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
      }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.scene.add(this.blob);

    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffd84d,
        transparent: true,
        opacity: 0.28,
      }),
    );
    this.glow.visible = false;
    this.scene.add(this.glow);
  }

  attachInput() {
    const preventDefaultCodes = new Set([
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
    ]);
    this.onKeyDown = (event) => {
      if (preventDefaultCodes.has(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.input.press(event.code);
      if (event.code === 'Escape') this.emit('pause');
      sfx.ensure();
    };
    this.onKeyUp = (event) => {
      this.input.release(event.code);
    };
    this.onBlur = () => this.input.clear();

    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
  }

  detachInput() {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
  }

  start() {
    if (this.destroyed || this.raf) return;
    this.running = true;
    this.previousFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  frame = (now) => {
    if (this.destroyed) return;
    const seconds = Math.min(0.1, (now - this.previousFrame) / 1000);
    this.previousFrame = now;
    this.loop.advance(
      seconds,
      (dt) => {
        if (this.running && !this.finished) this.simulate(dt);
      },
      () => this.renderer.render(this.scene, this.camera),
    );
    this.raf = requestAnimationFrame(this.frame);
  };

  pause() {
    this.running = false;
    this.input.clear();
  }

  resume() {
    if (this.destroyed || this.finished) return;
    this.running = true;
    this.input.clear();
  }

  simulate(dt) {
    const player = this.player;
    this.elapsed += dt;
    this.time -= dt;
    if (this.time <= 0) {
      this.time = 0;
      this.killPlayer(true);
      return;
    }
    this.emit('timer', this.time);

    this.updateMovers(dt);

    if (player.groundMover?.mover?.delta) {
      const delta = player.groundMover.mover.delta;
      player.pos.x += delta[0];
      player.pos.y += delta[1];
    }

    const motion = createPlayerMotion({
      positionX: player.pos.x,
      positionY: player.pos.y,
      positionZ: 0,
      velocityX: player.vel.x,
      velocityY: player.vel.y,
      velocityZ: 0,
      width: player.w,
      height: player.h,
      depth: player.d,
      grounded: player.grounded,
      coyote: player.coyote,
      jumpBuffer: 0,
      facing: player.facing,
    });
    const hadJumpBuffer = this.input.jumpBuffer > 0;
    const jumpSpeed = DEFAULT_MOTION.jumpSpeed
      * (this.power?.type === 'boost' ? 1.28 : 1);
    const speedMultiplier = this.power?.type === 'speed' ? 1.55 : 1;
    const next = stepPlayerMotion(
      motion,
      {
        axis: this.input.axis,
        running: this.input.running,
        jumpPressed: hadJumpBuffer,
        jumpHeld: this.input.jumpHeld,
      },
      { solids: this.solids },
      dt,
      {
        walkSpeed: DEFAULT_MOTION.walkSpeed * speedMultiplier,
        runSpeed: DEFAULT_MOTION.runSpeed * speedMultiplier,
        jumpSpeed,
      },
    );
    const jumped = next.velocityY > motion.velocityY
      && next.velocityY > DEFAULT_MOTION.jumpCutSpeed;
    if (jumped) {
      this.input.consumeJump();
      sfx.jump();
    } else {
      this.input.tick(dt);
    }
    this.applyMotion(next);
    this.findGroundMover();
    this.updateTutorials();

    const playerCollider = this.getPlayerBox();
    if (!this.updateHazards(playerCollider)) return;
    this.updateDoors(dt);
    if (this.updateCheckpointAndGoal(dt)) return;

    updateEntities(this, dt, () => updateBoss(this, dt));
    player.invuln = this.invuln;
    animateChefRig(this.rig, player, this.elapsed, dt, BASE_ANIMATION_SPEED);
    this.updateShadow();
    this.updateCamera(dt);
  }

  applyMotion(motion) {
    const player = this.player;
    player.pos.set(motion.positionX, motion.positionY, 0);
    player.vel.set(motion.velocityX, motion.velocityY, 0);
    player.grounded = motion.grounded;
    player.coyote = motion.coyote;
    player.facing = motion.facing;
  }

  updateMovers() {
    for (const solid of this.solids) {
      if (!solid.mover) continue;
      const mover = solid.mover;
      const phase = (
        Math.sin((this.elapsed / mover.period) * Math.PI * 2 - Math.PI / 2) + 1
      ) / 2;
      const nextX = mover.base[0] + mover.to[0] * phase;
      const nextY = mover.base[1] + mover.to[1] * phase;
      const nextZ = mover.base[2] + mover.to[2] * phase;
      mover.delta = [
        nextX - solid.mesh.position.x,
        nextY - solid.mesh.position.y,
        nextZ - solid.mesh.position.z,
      ];
      solid.mesh.position.set(nextX, nextY, nextZ);
      solid.aabb.set(nextX, nextY, nextZ, ...mover.size);
    }
  }

  findGroundMover() {
    const player = this.player;
    player.groundMover = null;
    if (!player.grounded) return;
    for (const solid of this.solids) {
      if (!solid.mover) continue;
      const standing = player.pos.x > solid.aabb.minX - player.w / 2
        && player.pos.x < solid.aabb.maxX + player.w / 2
        && Math.abs(player.pos.y - solid.aabb.maxY) < 0.05;
      if (standing) {
        player.groundMover = solid;
        return;
      }
    }
  }

  updateTutorials() {
    for (const tutorial of this.level.tutorials || []) {
      if (
        this.player.pos.x < tutorial.x
        || this.shownTutorials.has(tutorial.id)
      ) {
        continue;
      }
      this.shownTutorials.add(tutorial.id);
      this.emit('msg', tutorial.text);
    }
  }

  getPlayerBox() {
    const player = this.player;
    return new AABB(
      player.pos.x,
      player.pos.y + player.h / 2,
      0,
      player.w,
      player.h,
      player.d,
    );
  }

  updateHazards(playerCollider) {
    const player = this.player;
    if (player.pos.y < this.level.killY) {
      this.killPlayer();
      return false;
    }
    for (const hazard of this.hazards) {
      hazard.mesh.position.y = hazard.baseY
        + Math.sin(this.elapsed * 2.2 + hazard.baseY) * 0.08;
      hazard.tex.offset.x = this.elapsed * 0.03;
      if (!playerCollider.intersects(hazard.aabb)) continue;
      if (this.power?.type === 'shield') {
        player.vel.y = 11;
        continue;
      }
      this.killPlayer();
      return false;
    }
    return true;
  }

  updateDoors(dt) {
    const player = this.player;
    this.doorCooldown = Math.max(0, this.doorCooldown - dt);
    for (const door of this.doors) {
      door.glow.material.opacity = 0.4 + Math.sin(this.elapsed * 4) * 0.15;
      if (
        this.doorCooldown > 0
        || Math.abs(player.pos.x - door.at[0]) >= 1.1
        || Math.abs(player.pos.y - door.at[1]) >= 1.6
      ) {
        continue;
      }
      this.burst(player.pos.clone().setY(player.pos.y + 1), 0xffe9a0, 12, 3);
      player.pos.set(door.to[0], door.to[1] + 0.5, 0);
      player.vel.set(0, 0, 0);
      player.grounded = false;
      player.coyote = 0;
      this.doorCooldown = 1.4;
      sfx.power();
      this.burst(player.pos.clone().setY(player.pos.y + 1), 0xffe9a0, 12, 3);
      this.camera.position.set(player.pos.x, player.pos.y + 4, 21);
    }
  }

  updateCheckpointAndGoal(dt) {
    const player = this.player;
    if (
      this.level.checkpoint
      && !this.passedCheckpoint
      && Math.abs(player.pos.x - this.level.checkpoint[0]) < 2.2
      && Math.abs(player.pos.y - this.level.checkpoint[1]) < 3.5
    ) {
      this.passedCheckpoint = true;
      this.checkpointFlag.material.color.set(0xf2c14e);
      this.emit('msg', 'Checkpoint! 🚩');
      sfx.power();
    }
    if (!this.goalObject) return false;
    this.goalObject.userData.fork.rotation.y += dt * 1.6;
    if (player.pos.distanceTo(this.goalObject.position) < 2.6) {
      this.complete();
      return true;
    }
    return false;
  }

  burst(position, color, count = 10, spread = 4) {
    for (let index = 0; index < count; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.22),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.9 + 1,
        (Math.random() - 0.5) * spread,
      );
      this.scene.add(mesh);
      this.particles.push({ m: mesh, v: velocity, life: 0.7 });
    }
  }

  hurt(fromPosition) {
    if (this.invuln > 0) return;
    this.hearts -= 1;
    this.invuln = 1.6;
    sfx.hurt();
    this.emit('hearts', this.hearts);
    const player = this.player;
    player.vel.x = (Math.sign(player.pos.x - fromPosition.x) || 1) * 5.5;
    player.vel.y = 6;
    this.burst(player.pos.clone().setY(player.pos.y + 1), 0xff4444, 8, 3);
    this.emit('msg', 'Ouch! 💔');
    this.emit('flash');
    if (this.hearts <= 0) this.die();
  }

  killPlayer(timeout = false) {
    if (this.invuln > 0 && !timeout) {
      this.respawn();
      return;
    }
    this.hearts -= 1;
    sfx.hurt();
    this.emit('hearts', this.hearts);
    this.emit('flash');
    if (timeout) {
      this.emit('msg', "Time's up! ⏰");
      this.time = this.level.time;
      this.emit('timer', this.time);
    } else {
      this.emit(
        'msg',
        this.player.pos.y < this.level.killY ? 'Fell! 💔' : 'Too hot! 💔',
      );
    }
    if (this.hearts <= 0) {
      this.die();
      return;
    }
    this.respawn();
  }

  respawn() {
    const player = this.player;
    const spawn = this.passedCheckpoint && this.level.checkpoint
      ? this.level.checkpoint
      : this.level.spawn;
    player.pos.set(spawn[0], spawn[1] + 1, 0);
    player.vel.set(0, 0, 0);
    player.grounded = false;
    player.coyote = 0;
    player.groundMover = null;
    this.input.clearTransient();
    this.invuln = 2;
  }

  die() {
    this.finished = true;
    this.emit('died');
  }

  complete(isBoss = false) {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    sfx.goal();
    this.emit('complete', {
      coins: this.coinsGot,
      totalCoins: this.level.coins.length,
      time: Math.round(this.level.time - this.time),
      hearts: this.hearts,
      isBoss,
    });
  }

  updateShadow() {
    const player = this.player;
    let groundY = this.level.killY;
    for (const solid of this.solids) {
      if (
        player.pos.x > solid.aabb.minX - 0.2
        && player.pos.x < solid.aabb.maxX + 0.2
        && solid.aabb.maxY <= player.pos.y + 0.1
        && solid.aabb.maxY > groundY
      ) {
        groundY = solid.aabb.maxY;
      }
    }
    this.blob.position.set(player.pos.x, groundY + 0.03, 0);
    this.blob.scale.setScalar(
      Math.max(0.5, Math.min(1, 1 - (player.pos.y - groundY) * 0.07)),
    );
    this.blob.visible = groundY > this.level.killY;
  }

  updateCamera(dt) {
    const player = this.player;
    const levelLength = this.level.length || 100;
    let cameraX = player.pos.x + player.facing * 2.5;
    cameraX = Math.max(9, Math.min(levelLength - 9, cameraX));
    const cameraY = Math.max(3.5, player.pos.y + 4);
    this.camera.position.lerp(
      new THREE.Vector3(cameraX, cameraY, 21),
      Math.min(1, dt * 5),
    );
    this.camera.lookAt(
      this.camera.position.x,
      this.camera.position.y - 1.8,
      0,
    );
    this.sun.position.set(
      player.pos.x + this.level.theme.sunPos[0] * 0.4,
      this.level.theme.sunPos[1],
      this.level.theme.sunPos[2],
    );
    this.sun.target.position.set(player.pos.x, 0, 0);
    this.sun.target.updateMatrixWorld();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pause();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    removeEventListener('resize', this.onResize);
    this.detachInput();
    this.sceneState.dispose();
    for (const child of [...this.scene.children]) this.disposeObject(child);
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.emit = () => {};
  }

  disposeObject(object) {
    if (!object) return;
    object.traverse((child) => {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) material?.dispose();
    });
    object.removeFromParent();
  }
}
