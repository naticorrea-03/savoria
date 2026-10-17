// Online Co-op adapter for the shared effects layer. Inputs are only what this
// client already draws: the presentation (local prediction plus interpolated
// remote chef) and the latest server view. It never writes room state and
// never sends anything, so the server sim stays the only authority.

import { ChefFx, FxLayer } from '../core/fx-layer.js';

const PICKUP_RADIUS = { tomato: 1.4, item: 1.5 };
// A predicted pickup the server has not confirmed in this time is dropped,
// so the collectible shows again and can still pop later.
const PREDICTION_HOLD_SECONDS = 1;
const STOMP_REACH = 3;
const ITEM_COLOR = 0xb9f07a;

function indexOf(id) {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

export class CoopFx {
  constructor({ THREE, scene, camera, level, sceneState, emit = () => {}, viewport = null }) {
    this.THREE = THREE;
    this.level = level;
    this.sceneState = sceneState;
    this.layer = new FxLayer({
      THREE,
      scene,
      camera,
      theme: level.theme,
      hazards: sceneState.hazards,
      emit,
      viewport,
    });
    this.reduced = this.layer.reduced;
    this.chefs = new Map();
    this.collectibles = new Map();
    this.enemies = new Map();
    this.checkpointActive = null;
    this.goalReached = -1;
    this.bossHp = null;
  }

  get shake() {
    return this.layer.shake;
  }

  get pool() {
    return this.layer.pool;
  }

  // True while a local pickup is predicted and the server has not answered.
  hidesCollectible(id) {
    const entry = this.collectibles.get(id);
    return Boolean(entry && entry.predictedAt >= 0);
  }

  chefFor(player) {
    let chef = this.chefs.get(player.sessionId);
    if (!chef) {
      chef = new ChefFx({ THREE: this.THREE, fx: this.layer, shakes: player.isLocal === true });
      this.chefs.set(player.sessionId, chef);
    }
    chef.shakes = player.isLocal === true;
    return chef;
  }

  updateChefs(dt, players, visuals) {
    for (const player of players) {
      const visual = visuals.get(player.sessionId);
      if (!visual) continue;
      const chef = this.chefFor(player);
      const body = visual.player;
      if (player.active === false) {
        chef.primed = false;
        continue;
      }
      chef.observe(
        body.pos.x, body.pos.y, body.vel.x, body.vel.y,
        body.grounded, body.facing, player.hearts, dt,
      );
      chef.animate(visual.rig, dt, body.grounded, body.vel.y);
    }
    if (this.chefs.size > visuals.size) {
      for (const id of this.chefs.keys()) if (!visuals.has(id)) this.chefs.delete(id);
    }
  }

  collectibleEntry(collectible) {
    let entry = this.collectibles.get(collectible.id);
    if (entry) return entry;
    const index = indexOf(collectible.id);
    const visual = collectible.kind === 'tomato'
      ? this.sceneState.coins[index]
      : this.sceneState.items[index];
    entry = {
      visual,
      tomato: collectible.kind === 'tomato',
      taken: Boolean(collectible.takenBy),
      predictedAt: -1,
      // Set when a prediction expired. Cleared once the chef steps away, so
      // standing on a pickup the server refused never pops it again.
      refused: false,
    };
    this.collectibles.set(collectible.id, entry);
    return null;
  }

  pop(entry) {
    const position = entry.visual?.sprite.position;
    if (!position) return;
    this.layer.pickupPop(position, entry.tomato ? 0xffd36b : ITEM_COLOR);
    if (entry.tomato) this.layer.flyTomato(position, 1);
  }

  updateCollectibles(collectibles, local) {
    const position = local?.position;
    const canPredict = position && local.active !== false && local.safe !== true;
    const now = this.layer.time;
    for (const collectible of collectibles) {
      const entry = this.collectibleEntry(collectible);
      if (!entry) continue;
      if (collectible.takenBy) {
        if (entry.taken) continue;
        entry.taken = true;
        // The local prediction already popped it. The confirmation is silent.
        if (entry.predictedAt < 0) this.pop(entry);
        entry.predictedAt = -1;
        continue;
      }
      entry.taken = false;
      if (entry.predictedAt >= 0) {
        if (now - entry.predictedAt > PREDICTION_HOLD_SECONDS) {
          entry.predictedAt = -1;
          entry.refused = true;
        }
        continue;
      }
      if (!canPredict) continue;
      const target = collectible.position;
      const radius = entry.tomato ? PICKUP_RADIUS.tomato : PICKUP_RADIUS.item;
      const dx = position.x - target.x;
      const dy = position.y - target.y;
      const dz = (position.z || 0) - target.z;
      if (dx * dx + dy * dy + dz * dz >= radius * radius) {
        entry.refused = false;
        continue;
      }
      if (entry.refused) continue;
      entry.predictedAt = now;
      this.pop(entry);
    }
  }

  // The server does not say who stomped. The drawn chef nearest the enemy
  // gets the credit, which is the chef the player saw land on it.
  nearestPlayer(players, visuals, x, y) {
    let best = null;
    let bestDistance = STOMP_REACH * STOMP_REACH;
    for (const player of players) {
      const body = visuals.get(player.sessionId)?.player;
      if (!body || player.active === false) continue;
      const dx = body.pos.x - x;
      const dy = body.pos.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    return best;
  }

  updateEnemies(enemies, players, visuals) {
    for (const enemy of enemies) {
      let entry = this.enemies.get(enemy.id);
      if (!entry) {
        entry = { visual: this.sceneState.enemies[indexOf(enemy.id)], dead: enemy.dead };
        this.enemies.set(enemy.id, entry);
        continue;
      }
      if (!enemy.dead) {
        entry.dead = false;
        continue;
      }
      if (entry.dead) continue;
      entry.dead = true;
      const sprite = entry.visual?.sprite;
      if (!sprite) continue;
      this.layer.defeat(sprite, enemy.type);
      this.layer.flyTomato(sprite.position, 2);
      const stomper = this.nearestPlayer(players, visuals, sprite.position.x, sprite.position.y);
      if (stomper?.isLocal) this.layer.addShake(0.38);
    }
  }

  updateLandmarks(view, players, visuals) {
    const active = view.checkpoint?.active === true;
    if (this.checkpointActive === false && active) {
      const position = view.checkpoint.position;
      this.layer.checkpoint(position.x, position.y, this.sceneState.checkpointFlag);
    }
    if (view.checkpoint) this.checkpointActive = active;

    const reached = view.goal?.reachedPlayerIds.length ?? 0;
    if (this.goalReached >= 0 && reached > this.goalReached) {
      const goal = this.sceneState.goalObject?.position ?? view.goal.position;
      this.layer.celebrate(goal);
    }
    this.goalReached = reached;

    const boss = view.boss;
    const hp = boss ? boss.hp : null;
    if (this.bossHp !== null && hp !== null && hp < this.bossHp) {
      const sprite = this.sceneState.bossState?.sprite;
      if (sprite) {
        this.layer.burst(sprite.position, 0xc54b22, 12, 6);
        const hitter = this.nearestPlayer(players, visuals, sprite.position.x, sprite.position.y + 1);
        if (hitter?.isLocal) this.layer.addShake(hp <= 0 ? 0.8 : 0.6);
      }
    }
    this.bossHp = hp;
  }

  // dt is real frame time, 0 while the room is paused.
  update(dt, presentation, view, visuals) {
    if (dt > 0 && presentation && view) {
      const players = presentation.players;
      this.updateChefs(dt, players, visuals);
      this.updateCollectibles(view.collectibles ?? [], presentation.local);
      this.updateEnemies(view.enemies ?? [], players, visuals);
      this.updateLandmarks(view, players, visuals);
    }
    this.layer.update(dt);
  }

  beginRender(renderer) {
    this.layer.beginRender(renderer);
  }

  endRender() {
    this.layer.endRender();
  }

  dispose() {
    this.layer.dispose();
  }
}
