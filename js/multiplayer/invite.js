const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function normalizeRoomCode(value) {
  const normalized = String(value ?? '').toUpperCase().replace(/[\s-]+/g, '');
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function roomCodeFromSearch(search) {
  const params = new URLSearchParams(search);
  return normalizeRoomCode(params.get('room'));
}

export function inviteUrl(currentUrl, code) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error('A valid six-character room code is required');
  const url = new URL(currentUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', normalized);
  return url.toString();
}
