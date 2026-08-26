import * as THREE from '../../vendor/three.module.js';
import { AABB } from '../core/aabb.js';
import { sfx } from '../audio/sfx.js';

const SPRITES = {
  meatball: 'assets/sprites/meatball_walker.png',
  flyer: 'assets/sprites/pesto_flyer.png',
  shooter: 'assets/sprites/marinara_shooter.png',
};

function makeSprite(textures, path, width, height) {
  const material = new THREE.SpriteMaterial({
    map: textures.texture(path),
    transparent: true,
    alphaTest: 0.1,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

export function spawnEnemy(context, enemy) {
  const size = enemy.t === 'meatball' ? 1.5 : enemy.t === 'flyer' ? 1.4 : 1.7;
  const sprite = makeSprite(context.textures, SPRITES[enemy.t], size, size);
  sprite.position.set(enemy.p[0], enemy.p[1] + size * 0.35, enemy.p[2]);
  context.scene.add(sprite);
  context.enemies.push({
    t: enemy.t,
    sprite,
    base: [...enemy.p],
    range: Math.max(1.5, enemy.range || 5),
    t0: Math.random() * 6,
    dead: false,
    size,
    shootT: 1.5,
    half: size * 0.42,
  });
}

function updateCoins(context) {
  const player = context.player;
  for (const coin of context.coins) {
    if (coin.taken) continue;
    coin.sprite.position.y = coin.base + Math.sin(context.elapsed * 3 + coin.base) * 0.16;
    if (player.pos.distanceTo(coin.sprite.position) < 1.4) {
      coin.taken = true;
      coin.sprite.visible = false;
      context.coinsGot += 1;
      sfx.coin();
      context.burst(coin.sprite.position, 0xff5a3c, 7, 2.5);
      context.emit('coins', context.coinsGot);
    }
  }
}

function updateItems(context, dt) {
  const player = context.player;
  for (const item of context.items) {
    if (item.taken) continue;
    item.sprite.position.y = item.base + Math.sin(context.elapsed * 2 + item.base) * 0.2;
    item.bubble.position.copy(item.sprite.position);
    if (player.pos.distanceTo(item.sprite.position) >= 1.5) continue;

    item.taken = true;
    item.sprite.visible = item.bubble.visible = false;
    sfx.power();
    context.burst(item.sprite.position, 0xb9d857, 10, 3);
    if (item.t === 'basil') {
      context.hearts = Math.min(context.maxHearts, context.hearts + 1);
      context.emit('hearts', context.hearts);
      context.emit('msg', '+1 Heart 🌿');
    } else {
      context.power = { type: item.t, t: item.t === 'shield' ? 8 : 10 };
      context.emit('power', context.power);
      const names = {
        speed: 'Speed Pasta!',
        shield: 'Parmesan Shield!',
        boost: 'Basil Boost!',
      };
      context.emit('msg', names[item.t]);
    }
  }

  if (context.power) {
    context.power.t -= dt;
    context.emit('power', context.power);
    if (context.power.t <= 0) {
      context.power = null;
      context.emit('power', null);
    }
  }

  context.glow.visible = context.power?.type === 'shield';
  if (context.glow.visible) {
    context.glow.position.copy(player.pos).y += 0.9;
    context.glow.material.opacity = 0.2 + Math.sin(context.elapsed * 8) * 0.08;
  }
}

function playerBox(player) {
  return new AABB(
    player.pos.x,
    player.pos.y + player.h / 2,
    0,
    player.w,
    player.h,
    player.d,
  );
}

function disposeMesh(context, mesh) {
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material?.dispose();
  context.scene.remove(mesh);
}

function updateEnemies(context, dt) {
  const player = context.player;
  const collider = playerBox(player);
  context.invuln = Math.max(0, context.invuln - dt);

  for (const enemy of context.enemies) {
    if (enemy.dead) continue;
    const sprite = enemy.sprite;
    if (enemy.t === 'meatball') {
      enemy.t0 += dt;
      sprite.position.x = enemy.base[0] + Math.sin(enemy.t0 * (5 / enemy.range)) * enemy.range;
      sprite.position.y = enemy.base[1] + enemy.size * 0.35
        + Math.abs(Math.sin(enemy.t0 * 7)) * 0.18;
    } else if (enemy.t === 'flyer') {
      enemy.t0 += dt;
      sprite.position.x = enemy.base[0] + Math.sin(enemy.t0 * (4 / enemy.range)) * enemy.range;
      sprite.position.y = enemy.base[1] + Math.sin(enemy.t0 * 2.4) * 1.1;
    } else if (enemy.t === 'shooter') {
      sprite.position.y = enemy.base[1] + enemy.size * 0.35
        + Math.sin(context.elapsed * 2) * 0.06;
      enemy.shootT -= dt;
      const distance = Math.abs(player.pos.x - sprite.position.x);
      if (enemy.shootT <= 0 && distance < 11 && distance > 2) {
        enemy.shootT = 3;
        const direction = player.pos.clone().sub(sprite.position);
        const flight = Math.max(0.7, direction.length() / 12);
        const velocity = new THREE.Vector3(
          direction.x / flight,
          direction.y / flight + 11 * flight * 0.5,
          0,
        );
        const projectile = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xd42a12, emissive: 0x7a0d00 }),
        );
        projectile.position.copy(sprite.position).y += 0.4;
        context.scene.add(projectile);
        context.projectiles.push({ m: projectile, v: velocity, life: 3.5 });
        sfx.blip(240, 0.12, 'square', 0.06, -80);
      }
    }

    const enemyCollider = new AABB(
      sprite.position.x,
      sprite.position.y,
      0,
      enemy.half * 2,
      enemy.half * 2,
      enemy.half * 2,
    );
    if (!collider.intersects(enemyCollider)) continue;

    const stomping = player.vel.y < -2
      && player.pos.y > sprite.position.y + enemy.half * 0.3;
    if (stomping || context.power?.type === 'shield') {
      enemy.dead = true;
      sprite.visible = false;
      if (stomping) player.vel.y = 10;
      sfx.stomp();
      context.burst(sprite.position, 0x8a4a2a, 12, 4);
      context.coinsGot += 2;
      context.emit('coins', context.coinsGot);
    } else {
      context.hurt(sprite.position);
    }
  }
}

function updateProjectiles(context, dt) {
  const player = context.player;
  for (const projectile of context.projectiles) {
    projectile.v.y -= 22 * dt;
    projectile.m.position.addScaledVector(projectile.v, dt);
    projectile.life -= dt;
    if (projectile.life <= 0 || projectile.m.position.y < context.level.killY) {
      projectile.dead = true;
      disposeMesh(context, projectile.m);
      continue;
    }

    const position = projectile.m.position;
    if (context.solids.some((solid) => (
      position.x > solid.aabb.minX
      && position.x < solid.aabb.maxX
      && position.y > solid.aabb.minY
      && position.y < solid.aabb.maxY
    ))) {
      projectile.dead = true;
      disposeMesh(context, projectile.m);
      context.burst(position, 0xd42a12, 5, 1.5);
      continue;
    }

    if (player.pos.distanceTo(projectile.m.position) < 1) {
      projectile.dead = true;
      disposeMesh(context, projectile.m);
      if (context.power?.type !== 'shield') context.hurt(projectile.m.position);
    }
  }
  context.projectiles = context.projectiles.filter((projectile) => !projectile.dead);
}

function updateParticles(context, dt) {
  for (const particle of context.particles) {
    particle.v.y -= 12 * dt;
    particle.m.position.addScaledVector(particle.v, dt);
    particle.life -= dt;
    particle.m.material.opacity = Math.max(0, particle.life / 0.7);
    particle.m.material.transparent = true;
    if (particle.life <= 0) {
      disposeMesh(context, particle.m);
      particle.dead = true;
    }
  }
  context.particles = context.particles.filter((particle) => !particle.dead);
  for (const spinner of context.decoSpins) spinner.rotation.z += dt * 0.8;
}

export function updateEntities(context, dt, betweenPhases) {
  updateCoins(context, dt);
  updateItems(context, dt);
  updateEnemies(context, dt);
  updateProjectiles(context, dt);
  betweenPhases();
  updateParticles(context, dt);
}
