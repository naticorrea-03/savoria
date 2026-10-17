// Solo adapter for the shared effects layer. It reads GameSession state after
// simulation and turns changes into effects. It never writes gameplay state.
// Online Co-op uses the same FxLayer and ChefFx through js/multiplayer/coop-fx.js.

import { ChefFx, FxLayer } from './fx-layer.js';

export class SessionFx {
  constructor({ THREE, session }) {
    this.session = session;
    this.layer = new FxLayer({
      THREE,
      scene: session.scene,
      camera: session.camera,
      theme: session.level.theme,
      hazards: session.hazards,
      emit: (type, data) => session.emit(type, data),
    });
    this.reduced = this.layer.reduced;
    this.chef = new ChefFx({ THREE, fx: this.layer, shakes: true });

    const player = session.player;
    this.chef.reset(player.grounded, player.vel.y, player.facing, session.hearts, player.pos.x, player.pos.y);
    this.lastCheckpoint = session.passedCheckpoint;
    this.lastDoorCooldown = session.doorCooldown;
    this.lastBossHp = session.bossState?.hp ?? null;
    this.seenCoins = new WeakSet();
    this.seenEnemies = new WeakSet();
  }

  get pool() {
    return this.layer.pool;
  }

  get shake() {
    return this.layer.shake;
  }

  // Drop-in for GameSession.burst used by entities and the boss.
  burst(position, color, count = 10, spread = 4) {
    this.layer.burst(position, color, count, spread);
  }

  celebrate() {
    const goal = this.session.goalObject?.position ?? this.session.player.pos;
    this.layer.celebrate(goal);
    this.layer.addShake(0.25);
  }

  detect(dt) {
    const session = this.session;
    const layer = this.layer;
    const player = session.player;

    this.chef.observe(
      player.pos.x, player.pos.y, player.vel.x, player.vel.y,
      player.grounded, player.facing, session.hearts, dt,
    );

    for (const coin of session.coins) {
      if (!coin.taken || this.seenCoins.has(coin)) continue;
      this.seenCoins.add(coin);
      layer.pickupPop(coin.sprite.position);
      layer.flyTomato(coin.sprite.position, 1);
    }

    for (const enemy of session.enemies) {
      if (!enemy.dead || this.seenEnemies.has(enemy)) continue;
      this.seenEnemies.add(enemy);
      layer.defeat(enemy.sprite, enemy.t);
      layer.addShake(0.38);
      layer.flyTomato(enemy.sprite.position, 2);
    }

    if (session.passedCheckpoint && !this.lastCheckpoint && session.level.checkpoint) {
      const [x, y] = session.level.checkpoint;
      layer.checkpoint(x, y, session.checkpointFlag);
    }

    if (session.doorCooldown > this.lastDoorCooldown + 0.5) {
      layer.sparkle(player.pos.x, player.pos.y + 1, 0.4, 0xffe9a0, 18, 4.5);
      layer.addShake(0.15);
    }

    const bossHp = session.bossState?.hp ?? null;
    if (this.lastBossHp !== null && (bossHp === null || bossHp < this.lastBossHp)) {
      layer.addShake(bossHp === null ? 0.8 : 0.6);
    }

    this.lastCheckpoint = session.passedCheckpoint;
    this.lastDoorCooldown = session.doorCooldown;
    this.lastBossHp = bossHp;
  }

  // Called once per rendered frame with real frame time (0 while paused).
  update(dt) {
    if (dt > 0) {
      this.detect(dt);
      const player = this.session.player;
      this.chef.animate(this.session.rig, dt, player.grounded, player.vel.y);
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
