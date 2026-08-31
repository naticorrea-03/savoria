export const IDENTITY_STORAGE_KEY = 'savoria3d-multiplayer-identity-v1';

const DEFAULT_GUEST_NAME = 'Guest Chef';
const MAX_GUEST_NAME_LENGTH = 24;
const MARKER_COLORS = [
  '#2f80ed',
  '#d94f70',
  '#2d9d78',
  '#9b51e0',
  '#e07a18',
  '#087e8b',
];

export function getLocalIdentity(storage, {
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) {
  const stored = readIdentity(storage);
  const identity = {
    playerId: validPlayerId(stored?.playerId) ? stored.playerId : randomUUID(),
    guestName: normalizeGuestName(stored?.guestName),
  };
  writeIdentity(storage, identity);
  return identity;
}

export function saveGuestName(storage, value) {
  const current = getLocalIdentity(storage);
  const identity = {
    playerId: current.playerId,
    guestName: normalizeGuestName(value),
  };
  writeIdentity(storage, identity);
  return identity;
}

export function normalizeGuestName(value) {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GUEST_NAME_LENGTH);
  return normalized || DEFAULT_GUEST_NAME;
}

export function playerMarkerColor(identityId, offset = 0) {
  let hash = 2166136261;
  for (const character of String(identityId)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return MARKER_COLORS[((hash >>> 0) + offset) % MARKER_COLORS.length];
}

function readIdentity(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(IDENTITY_STORAGE_KEY));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeIdentity(storage, identity) {
  storage?.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({
    playerId: identity.playerId,
    guestName: identity.guestName,
  }));
}

function validPlayerId(value) {
  return typeof value === 'string'
    && value.length >= 8
    && value.length <= 64
    && /^[A-Za-z0-9-]+$/.test(value);
}
