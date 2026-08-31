import { randomBytes as secureRandomBytes } from 'node:crypto';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const RESERVATIONS_KEY = 'savoria:room-codes';
const MAX_ATTEMPTS = 1024;
let reservationQueue = Promise.resolve();

export async function reserveRoomCode(
  presence,
  ownerId,
  { randomBytes = secureRandomBytes } = {},
) {
  return serializeReservation(presence, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = bytesToCode(randomBytes(ROOM_CODE_LENGTH));
      if (await presence.hget(RESERVATIONS_KEY, code) !== null) continue;
      await presence.hset(RESERVATIONS_KEY, code, String(ownerId));
      return code;
    }
    throw new Error('Unable to reserve a unique room code');
  });
}

export async function releaseRoomCode(presence, code, ownerId) {
  return serializeReservation(presence, async () => {
    const reservedBy = await presence.hget(RESERVATIONS_KEY, code);
    if (reservedBy !== String(ownerId)) return false;
    return presence.hdel(RESERVATIONS_KEY, code);
  });
}

function bytesToCode(bytes) {
  if (!bytes || bytes.length < ROOM_CODE_LENGTH) {
    throw new TypeError(`randomBytes must return at least ${ROOM_CODE_LENGTH} bytes`);
  }
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[bytes[index] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

async function serializeReservation(presence, operation) {
  const current = reservationQueue.catch(() => {}).then(operation);
  reservationQueue = current;
  try {
    return await current;
  } finally {
    if (reservationQueue === current) reservationQueue = Promise.resolve();
  }
}
