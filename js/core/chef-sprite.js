const GRID_SIZE = 5;
const FRAME_COUNT = GRID_SIZE * GRID_SIZE;
const CELL_SIZE = 1 / GRID_SIZE;

const CHEF_SPRITES = {
  fatsio: {
    path: 'assets/characters/fatsio/run-sheet.png',
    fps: 24,
    height: 2.85,
  },
  dinnerette: {
    path: 'assets/characters/dinnerette/run-sheet.png',
    fps: 24,
    height: 3,
  },
  chefno: {
    path: 'assets/characters/chefno/run-sheet.png',
    fps: 12,
    height: 2.9,
  },
};

export function chefSpriteConfig(id) {
  return CHEF_SPRITES[id] || CHEF_SPRITES.fatsio;
}

export function chefFrameState(config, {
  elapsed,
  speed,
  grounded,
  facing,
}) {
  const moving = Math.abs(speed) > 0.15 || !grounded;
  const frame = moving
    ? Math.floor(elapsed * config.fps) % FRAME_COUNT
    : 0;
  const column = frame % GRID_SIZE;
  const row = Math.floor(frame / GRID_SIZE);
  const mirrored = facing < 0;

  return {
    frame,
    offsetX: (column + (mirrored ? 1 : 0)) * CELL_SIZE,
    offsetY: 1 - (row + 1) * CELL_SIZE,
    repeatX: mirrored ? -CELL_SIZE : CELL_SIZE,
  };
}

export function buildChefSprite(THREE, textures, id) {
  const config = chefSpriteConfig(id);
  const texture = textures.clone(config.path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(CELL_SIZE, CELL_SIZE);
  texture.offset.set(0, 1 - CELL_SIZE);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set(config.height, config.height, 1);
  sprite.userData = { config, texture, frame: -1, facing: 0 };
  return sprite;
}

export function animateChefSprite(sprite, player, elapsed) {
  const { config, texture } = sprite.userData;
  const state = chefFrameState(config, {
    elapsed,
    speed: player.vel.x,
    grounded: player.grounded,
    facing: player.facing,
  });

  sprite.position.set(player.pos.x, player.pos.y, 0.2);
  if (
    state.frame !== sprite.userData.frame
    || player.facing !== sprite.userData.facing
  ) {
    texture.repeat.set(state.repeatX, CELL_SIZE);
    texture.offset.set(state.offsetX, state.offsetY);
    sprite.userData.frame = state.frame;
    sprite.userData.facing = player.facing;
  }
  sprite.visible = player.invuln > 0 ? Math.sin(elapsed * 30) > 0 : true;
}
