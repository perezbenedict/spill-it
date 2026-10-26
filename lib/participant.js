import { cookies } from 'next/headers';
import { nicknameCookieName, participantCookieName } from '@/components/participant/cookies';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function baseCookieOptions() {
  return {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: THIRTY_DAYS_SECONDS,
  };
}

// Session-scoped pseudonymous id. Every identity cookie is namespaced by
// session code so the same browser is a different participant per discussion.
export async function getOrCreateParticipantId(sessionCode) {
  const cookieStore = await cookies();
  const name = participantCookieName(sessionCode);
  const existing = cookieStore.get(name)?.value;
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const participantId = crypto.randomUUID();
  cookieStore.set(name, participantId, { ...baseCookieOptions(), httpOnly: true });
  return participantId;
}

export async function getNickname(sessionCode) {
  const cookieStore = await cookies();
  return cookieStore.get(nicknameCookieName(sessionCode))?.value || null;
}

export async function setNickname(sessionCode, value) {
  const cookieStore = await cookies();
  cookieStore.set(nicknameCookieName(sessionCode), value, {
    ...baseCookieOptions(),
    httpOnly: false,
  });
}
