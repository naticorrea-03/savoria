import { AABB } from '../core/aabb.js';
import { sfx } from '../audio/sfx.js';
import { spawnEnemy } from './entities.js';
import { nextSeededRandom } from './seeded-random.js';

export function updateBoss(context, dt) {
  const boss = context.bossState;
  if (!boss) return;

  const player = context.player;
  const sprite = boss.sprite;
  const [arenaX, , , arenaWidth] = boss.arena;

  if (!boss.awake) {
    if (Math.abs(player.pos.x - sprite.position.x) < 18) {
      boss.awake = true;
      boss.mode = 'idle';
      boss.t = 1.2;
      context.emit('bossShow', { hp: boss.hp, maxHp: boss.maxHp });
      context.emit('msg', 'DON FUNGHI: "You dare enter MY kitchen?!"');
      sfx.boss();
    }
    sprite.position.y = boss.home[1] + Math.sin(context.elapsed * 1.5) * 0.2;
  } else {
    boss.t -= dt;
    if (boss.mode === 'idle') {
      sprite.position.y = boss.home[1] + Math.sin(context.elapsed * 3) * 0.3;
      if (boss.t <= 0) {
        boss.mode = 'telegraph';
        boss.t = 0.7;
        boss.chargeDir = Math.sign(player.pos.x - sprite.position.x) || 1;
      }
    } else if (boss.mode === 'telegraph') {
      sprite.position.x += (nextSeededRandom(context) - 0.5) * 0.14;
      if (boss.t <= 0) {
        boss.mode = 'charge';
        boss.t = 1.8;
        sfx.boss();
      }
    } else if (boss.mode === 'charge') {
      sprite.position.x += boss.chargeDir * boss.speed * dt;
      sprite.position.y = boss.home[1] - 0.6
        + Math.abs(Math.sin(context.elapsed * 14)) * 0.4;
      if (Math.abs(sprite.position.x - arenaX) > arenaWidth / 2 - 3 || boss.t <= 0) {
        boss.mode = 'tired';
        boss.t = 2.4;
        context.emit('msg', 'Now! Stomp him!');
      }
    } else if (boss.mode === 'tired') {
      sprite.position.y = boss.home[1] - 1 + Math.sin(context.elapsed * 2) * 0.1;
      if (boss.t <= 0) {
        boss.mode = 'idle';
        boss.t = 1 + nextSeededRandom(context);
      }
    }
  }

  boss.ring.position.set(sprite.position.x, boss.home[1] - 2.1, 0);
  boss.ring.rotation.z += dt * 2;
  boss.ring.material.color.set(boss.mode === 'tired' ? 0x8fd42a : 0xa34fc9);

  const bossCollider = new AABB(sprite.position.x, sprite.position.y, 0, 3.2, 4, 3.2);
  const playerCollider = new AABB(
    player.pos.x,
    player.pos.y + player.h / 2,
    0,
    player.w,
    player.h,
    player.d,
  );
  if (!playerCollider.intersects(bossCollider)) return;

  const stomping = player.vel.y < -2 && player.pos.y > sprite.position.y + 1;
  if (stomping && boss.mode === 'tired') {
    player.vel.y = 13;
    boss.hp -= 1;
    sfx.stomp();
    context.burst(sprite.position, 0xa34fc9, 18, 6);
    context.emit('bossHp', { hp: boss.hp, maxHp: boss.maxHp });
    if (boss.hp <= 0) {
      sprite.visible = false;
      boss.ring.visible = false;
      context.bossState = null;
      context.emit('msg', 'DON FUNGHI: "Impossible!! My empire… crumbles…"');
      sfx.goal();
      setTimeout(() => context.complete(true), 1400);
      return;
    }

    boss.mode = 'idle';
    boss.t = 0.8;
    boss.speed += 2.5;
    context.emit('msg', 'DON FUNGHI: "Minions! Get in here!"');
    spawnEnemy(context, {
      t: 'meatball',
      p: [arenaX - 8, boss.arena[1] + 0.4, 0],
      range: 5,
    });
    spawnEnemy(context, {
      t: 'meatball',
      p: [arenaX + 8, boss.arena[1] + 0.4, 0],
      range: 5,
    });
  } else if (!stomping) {
    if (context.power?.type !== 'shield') context.hurt(sprite.position);
  } else {
    player.vel.y = 11;
  }
}
