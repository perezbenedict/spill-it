// Client-safe cookie naming/IO for participant identity. Shared by the server
// helpers in lib/participant.js so names can never drift between the two sides.

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function participantCookieName(sessionCode) {
  return `spill_p_${String(sessionCode).toUpperCase()}`;
}

export function nicknameCookieName(sessionCode) {
  return `spill_n_${String(sessionCode).toUpperCase()}`;
}

// The nickname cookie is httpOnly: false so the client can read it back.
export function readNicknameCookie(sessionCode) {
  if (typeof document === 'undefined') return null;
  const prefix = `${nicknameCookieName(sessionCode)}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

export function writeNicknameCookie(sessionCode, value) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${nicknameCookieName(sessionCode)}=${encodeURIComponent(value)}; path=/; max-age=${THIRTY_DAYS_SECONDS}; samesite=lax${secure}`;
}
