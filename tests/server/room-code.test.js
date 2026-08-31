import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPresence } from 'colyseus';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  releaseRoomCode,
  reserveRoomCode,
} from '../../server/room-code.js';

test('presence-backed room codes stay unique when generators collide', async () => {
  const presence = new LocalPresence();
  const firstRoomPresence = Object.create(presence);
  const secondRoomPresence = Object.create(presence);
  const samples = [
    Buffer.alloc(ROOM_CODE_LENGTH, 0),
    Buffer.alloc(ROOM_CODE_LENGTH, 0),
    Buffer.alloc(ROOM_CODE_LENGTH, 1),
  ];
  const randomBytes = () => samples.shift();

  const [first, second] = await Promise.all([
    reserveRoomCode(firstRoomPresence, 'room-one', { randomBytes }),
    reserveRoomCode(secondRoomPresence, 'room-two', { randomBytes }),
  ]);

  assert.equal(first, ROOM_CODE_ALPHABET[0].repeat(ROOM_CODE_LENGTH));
  assert.equal(second, ROOM_CODE_ALPHABET[1].repeat(ROOM_CODE_LENGTH));
  assert.equal(first.length, 6);
  assert.match(first, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(await presence.hget('savoria:room-codes', first), 'room-one');
  assert.equal(await presence.hget('savoria:room-codes', second), 'room-two');

  await releaseRoomCode(presence, first, 'room-one');
  assert.equal(await presence.hget('savoria:room-codes', first), null);
  assert.equal(await presence.hget('savoria:room-codes', second), 'room-two');
});
