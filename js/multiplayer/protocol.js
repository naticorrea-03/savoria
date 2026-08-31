export const PROTOCOL_VERSION = 1;
export const ROOM_NAME = 'savoria';

export const MESSAGE = Object.freeze({
  READY: 'ready',
  SELECT_LEVEL: 'select-level',
  START: 'start',
  INPUT: 'input',
  PAUSE: 'pause',
  RESUME: 'resume',
  RECONNECT: 'reconnect',
  LEAVE: 'leave',
  TEST_CONTROL: 'test-control',
});

export const ACTION_RATE_LIMIT_PER_SECOND = 12;
export const INPUT_RATE_LIMIT_PER_SECOND = 90;
export const MAX_MESSAGES_PER_SECOND = 120;

export function isValidInput(value) {
  return hasExactKeys(value, ['axis', 'jumpHeld', 'jumpPressed', 'running'])
    && [-1, 0, 1].includes(value.axis)
    && typeof value.running === 'boolean'
    && typeof value.jumpPressed === 'boolean'
    && typeof value.jumpHeld === 'boolean';
}

export function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}
