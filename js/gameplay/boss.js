import { stepBossFight } from './boss-fight.js';
import { nextSeededRandom } from './seeded-random.js';

// Solo adapter for Don Funghi. The rules live in boss-fight.js, shared with
// the co-op server. This file maps the solo chef to a fighter, applies the
// contacts the fight returns, and tells the HUD what changed. Drawing lives
// in js/core/boss-presenter.js.
export function updateBoss(context, dt) {
  const boss = context.bossState;
  const fight = boss?.fight;
  if (!fight || fight.mode === 'done') return;

  const player = context.player;
  const contacts = stepBossFight(fight, [{
    id: 'solo',
    x: player.pos.x,
    y: player.pos.y,
    vy: player.vel.y,
    width: player.w,
    height: player.h,
    shielded: context.power?.type === 'shield',
    invulnerable: context.invuln > 0,
  }], dt, () => nextSeededRandom(context));

  for (const contact of contacts) {
    if (contact.kind === 'hurt') {
      // GameSession.hurt applies the same knockback and lift the server uses.
      const hearts = context.hearts;
      context.hurt({ x: contact.fromX });
      if (context.hearts < hearts) player.grounded = false;
    } else {
      player.vel.y = contact.velocityY;
      player.grounded = false;
    }
  }

  // The HUD boss bar and the existing hit shake in session-fx read these.
  if (fight.awake && !boss.shown) {
    boss.shown = true;
    context.emit('bossShow', { hp: fight.hp, maxHp: fight.maxHp });
  }
  if (boss.hp !== fight.hp) {
    boss.hp = fight.hp;
    context.emit('bossHp', { hp: fight.hp, maxHp: fight.maxHp });
  }
  if (
    boss.lastMode !== fight.mode
    || boss.lastLine !== fight.lineRevision
    || boss.lastPhase !== fight.phase
  ) {
    boss.lastMode = fight.mode;
    boss.lastLine = fight.lineRevision;
    boss.lastPhase = fight.phase;
    context.emit('boss', bossView(fight));
  }

  if (fight.mode === 'done') context.complete(true);
}

// Plain view shared with the co-op client view, for the HUD boss card.
export function bossView(fight) {
  return {
    mode: fight.mode,
    phase: fight.phase,
    hp: fight.hp,
    maxHp: fight.maxHp,
    line: fight.line,
    lineRevision: fight.lineRevision,
  };
}
