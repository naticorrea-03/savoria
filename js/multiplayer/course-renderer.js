import * as THREE from '../../vendor/three.module.js';
import { buildChefSprite, animateChefSprite } from '../core/chef-sprite.js';
import { buildWorldScene } from '../core/world-builder.js';

export class MultiplayerCourseRenderer {
  constructor({
    container,
    level,
    textures,
    antialias = true,
    pixelRatio = Math.min(devicePixelRatio, 2),
    shadows = true,
    minimumFrameMs = 0,
  }) {
    this.container = container;
    this.level = level;
    this.textures = textures;
    this.destroyed = false;
    this.elapsed = 0;
    this.previousRenderAt = null;
    this.minimumFrameMs = minimumFrameMs;
    this.playerVisuals = new Map();
    this.projectileVisuals = new Map();

    this.renderer = new THREE.WebGLRenderer({ antialias });
    this.renderer.domElement.dataset.multiplayerCourse = 'true';
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.38;
    container.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.sceneState = buildWorldScene({
      THREE,
      scene: this.scene,
      level,
      textures,
    });
    this.movingSolids = this.sceneState.solids.filter(({ mover }) => mover);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  render(presentation, view, renderedAt = performance.now()) {
    if (this.destroyed || !presentation || !view) return;
    if (
      this.previousRenderAt !== null
      && renderedAt - this.previousRenderAt < this.minimumFrameMs
    ) return;
    const seconds = this.previousRenderAt === null
      ? 0
      : Math.min(0.05, Math.max(0, (renderedAt - this.previousRenderAt) / 1000));
    this.previousRenderAt = renderedAt;
    this.elapsed += seconds;

    this.syncPlayers(presentation.players);
    this.syncCollectibles(view.collectibles);
    this.syncEnemies(view.enemies);
    this.syncProjectiles(view.projectiles);
    this.syncMovingPlatforms(view.movingPlatforms);
    this.syncLandmarks(view);
    this.animateWorld();
    this.updateCamera(presentation.local, seconds);
    this.renderer.render(this.scene, this.camera);
  }

  syncPlayers(players) {
    const activeIds = new Set();
    for (const player of players) {
      activeIds.add(player.sessionId);
      let visual = this.playerVisuals.get(player.sessionId);
      if (!visual) {
        visual = this.createPlayerVisual(player);
        this.playerVisuals.set(player.sessionId, visual);
      }
      const previousX = visual.player.pos.x;
      visual.player.pos.set(player.position.x, player.position.y, player.position.z);
      visual.player.vel.set(
        player.velocity?.x ?? (player.position.x - previousX) * 60,
        player.velocity?.y ?? 0,
        player.velocity?.z ?? 0,
      );
      visual.player.grounded = player.grounded;
      if (Math.abs(visual.player.vel.x) > 0.05) {
        visual.player.facing = Math.sign(visual.player.vel.x);
      }
      visual.player.invuln = player.invulnerabilitySeconds;
      animateChefSprite(visual.rig, visual.player, this.elapsed);
      visual.rig.visible = player.active !== false;
      visual.shadow.position.set(player.position.x, player.position.y + 0.02, -0.05);
      visual.shadow.visible = player.active !== false;
      visual.glow.position.set(player.position.x, player.position.y + 0.85, 0.1);
      visual.glow.visible = player.power?.type === 'shield';
    }
    for (const [playerId, visual] of this.playerVisuals) {
      if (activeIds.has(playerId)) continue;
      this.disposeVisual(visual.root);
      this.playerVisuals.delete(playerId);
    }
  }

  createPlayerVisual(player) {
    const root = new THREE.Group();
    const rig = buildChefSprite(THREE, this.textures, player.characterId);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: player.isLocal ? 0.48 : 0.3,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffd84d,
        transparent: true,
        opacity: 0.28,
      }),
    );
    glow.visible = false;
    root.add(rig, shadow, glow);
    this.scene.add(root);
    return {
      root,
      rig,
      shadow,
      glow,
      player: {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        grounded: false,
        facing: 1,
        invuln: 0,
      },
    };
  }

  syncCollectibles(collectibles = []) {
    for (const collectible of collectibles) {
      const index = Number(collectible.id.split('-').at(-1));
      const visual = collectible.kind === 'tomato'
        ? this.sceneState.coins[index]
        : this.sceneState.items[index];
      if (!visual) continue;
      visual.sprite.visible = !collectible.takenBy;
      if (visual.bubble) visual.bubble.visible = !collectible.takenBy;
    }
  }

  syncEnemies(enemies = []) {
    for (const enemy of enemies) {
      const index = Number(enemy.id.split('-').at(-1));
      const visual = this.sceneState.enemies[index];
      if (!visual) continue;
      visual.sprite.position.set(
        enemy.position.x,
        enemy.position.y + (enemy.type === 'flyer' ? 0 : (visual.size ?? 1.5) * 0.35),
        enemy.position.z,
      );
      visual.sprite.visible = !enemy.dead;
    }
  }

  syncProjectiles(projectiles = []) {
    const activeIds = new Set();
    for (const projectile of projectiles) {
      activeIds.add(projectile.id);
      let mesh = this.projectileVisuals.get(projectile.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xd42a12, emissive: 0x7a0d00 }),
        );
        this.scene.add(mesh);
        this.projectileVisuals.set(projectile.id, mesh);
      }
      mesh.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
    }
    for (const [projectileId, mesh] of this.projectileVisuals) {
      if (activeIds.has(projectileId)) continue;
      this.disposeVisual(mesh);
      this.projectileVisuals.delete(projectileId);
    }
  }

  syncMovingPlatforms(platforms = []) {
    for (const platform of platforms) {
      const index = Number(platform.id.split('-').at(-1));
      this.movingSolids[index]?.mesh.position.set(
        platform.position.x,
        platform.position.y,
        platform.position.z,
      );
    }
  }

  syncLandmarks(view) {
    if (this.sceneState.checkpointFlag && view.checkpoint?.active) {
      tintObject(this.sceneState.checkpointFlag, 0xf2c14e);
    }
    if (this.sceneState.goalObject) {
      this.sceneState.goalObject.rotation.y = Math.sin(this.elapsed * 1.6) * 0.05;
    }
    if (this.sceneState.bossState && view.boss) {
      const boss = this.sceneState.bossState;
      boss.sprite.position.set(view.boss.position.x, view.boss.position.y, view.boss.position.z);
      boss.sprite.visible = view.boss.hp > 0;
      boss.ring.position.copy(boss.sprite.position);
      boss.ring.visible = view.boss.awake && view.boss.hp > 0;
    }
  }

  animateWorld() {
    for (const coin of this.sceneState.coins) {
      if (!coin.sprite.visible) continue;
      coin.sprite.position.y = coin.base + Math.sin(this.elapsed * 3 + coin.base) * 0.16;
    }
    for (const item of this.sceneState.items) {
      if (!item.sprite.visible) continue;
      item.sprite.position.y = item.base + Math.sin(this.elapsed * 2 + item.base) * 0.2;
      item.bubble.position.copy(item.sprite.position);
    }
    for (const hazard of this.sceneState.hazards) {
      hazard.mesh.position.y = hazard.baseY
        + Math.sin(this.elapsed * 2.2 + hazard.baseY) * 0.08;
      hazard.tex.offset.x = this.elapsed * 0.03;
    }
    for (const spinner of this.sceneState.decoSpins) spinner.rotation.z += 1 / 60 * 0.8;
  }

  updateCamera(local, seconds) {
    if (!local) return;
    const facing = Math.sign(local.velocity?.x || 1);
    const levelLength = this.level.length || 100;
    const cameraX = Math.max(9, Math.min(levelLength - 9, local.position.x + facing * 2.5));
    const cameraY = Math.max(3.5, local.position.y + 4);
    const alpha = seconds > 0 ? Math.min(1, seconds * 8) : 1;
    this.camera.position.lerp(new THREE.Vector3(cameraX, cameraY, 21), alpha);
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - 1.8, 0);
    this.sceneState.updateBackground?.(this.camera.position.x, this.camera.position.y);
    this.sceneState.sun.position.set(
      local.position.x + this.level.theme.sunPos[0] * 0.4,
      this.level.theme.sunPos[1],
      this.level.theme.sunPos[2],
    );
    this.sceneState.sun.target.position.set(local.position.x, 0, 0);
    this.sceneState.sun.target.updateMatrixWorld();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.sceneState.dispose();
    for (const child of [...this.scene.children]) this.disposeVisual(child);
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.playerVisuals.clear();
    this.projectileVisuals.clear();
  }

  disposeVisual(object) {
    object.traverse((child) => {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material?.dispose();
    });
    object.removeFromParent();
  }
}

function tintObject(object, color) {
  object.traverse((child) => child.material?.color?.set?.(color));
}
