import { createPlayerMotion, stepPlayerMotion } from './player-motion.js';

export function createPlayerState({ playerId, characterId, spawn }) {
  const [positionX = 0, positionY = 0, positionZ = 0] = spawn ?? [];
  return {
    ...createPlayerMotion({
    playerId: String(playerId),
    characterId: String(characterId),
    positionX,
    positionY,
    positionZ,
    hearts: 3,
    lives: 4,
    invulnerabilitySeconds: 0,
    active: true,
    safe: false,
    reachedGoal: false,
      groundMoverId: null,
    }),
    doorCooldownSeconds: 0,
    enteredDoorId: null,
    snapRevision: 0,
    snapReason: '',
  };
}

export function applyPlayerInput(player, input = {}, world = {}, seconds = 0) {
  return stepPlayerMotion(
    player,
    {
      axis: Math.max(-1, Math.min(1, Number(input.axis) || 0)),
      running: input.running === true,
      jumpPressed: input.jumpPressed === true,
      jumpHeld: input.jumpHeld !== false,
    },
    world,
    seconds,
    world.motion,
  );
}
