import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_STORAGE_KEY,
  getLocalIdentity,
  playerMarkerColor,
  saveGuestName,
} from '../../js/multiplayer/identity.js';
import {
  inviteUrl,
  normalizeRoomCode,
  roomCodeFromSearch,
} from '../../js/multiplayer/invite.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    snapshot: () => Object.fromEntries(values),
  };
}

test('local multiplayer identity persists one stable player ID and guest name', () => {
  const storage = memoryStorage();
  const first = getLocalIdentity(storage, {
    randomUUID: () => '12345678-1234-4234-8234-123456789abc',
  });
  const second = getLocalIdentity(storage, {
    randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });

  assert.deepEqual(first, {
    playerId: '12345678-1234-4234-8234-123456789abc',
    guestName: 'Guest Chef',
  });
  assert.deepEqual(second, first);
  assert.deepEqual(JSON.parse(storage.snapshot()[IDENTITY_STORAGE_KEY]), first);
});

test('guest names are trimmed, bounded, and saved without room credentials', () => {
  const storage = memoryStorage({
    [IDENTITY_STORAGE_KEY]: JSON.stringify({
      playerId: '12345678-1234-4234-8234-123456789abc',
      guestName: 'Old Name',
      reconnectionToken: 'must-not-survive',
      roomCode: 'ABC234',
    }),
  });

  const saved = saveGuestName(storage, '  Dinnerette the Magnificent Chef  ');

  assert.equal(saved.guestName, 'Dinnerette the Magnifice');
  assert.deepEqual(Object.keys(JSON.parse(storage.snapshot()[IDENTITY_STORAGE_KEY])).sort(), [
    'guestName',
    'playerId',
  ]);
});

test('room links accept only the six-character private alphabet', () => {
  assert.equal(normalizeRoomCode(' abc-234 '), 'ABC234');
  assert.equal(normalizeRoomCode('ABC10O'), null);
  assert.equal(normalizeRoomCode('ABC23'), null);
  assert.equal(roomCodeFromSearch('?room=abc234'), 'ABC234');
  assert.equal(roomCodeFromSearch('?room=ABC10O'), null);
  assert.equal(
    inviteUrl('https://savoria.example/play/?old=1', 'abc234'),
    'https://savoria.example/play/?room=ABC234',
  );
});

test('player marker colors are stable and distinguish different identities', () => {
  assert.equal(playerMarkerColor('player-one'), playerMarkerColor('player-one'));
  assert.notEqual(playerMarkerColor('one'), playerMarkerColor('two'));
});
