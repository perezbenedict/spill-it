// Next can normalize request.url to localhost behind a reverse proxy. The Host
// header is the browser-visible authority; do not trust forwarded-host overrides.
export function isSameOriginRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['https:', 'http:'].includes(url.protocol) && url.host === request.headers.get('host');
  } catch { return false; }
}
