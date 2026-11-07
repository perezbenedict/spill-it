import { expect, it } from 'vitest';
import { isSameOriginRequest } from '../../lib/request-origin';

it('uses browser authority through a normalized Next proxy URL', () => {
  const request = new Request('http://localhost:3000/api/platform', { headers: { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' } });
  expect(isSameOriginRequest(request)).toBe(true);
});
it('rejects cross-origin, malformed and null origins', () => {
  for (const origin of ['https://attacker.example', 'null', 'not a URL']) {
    expect(isSameOriginRequest(new Request('https://spill.example/api', { headers: { Host: 'spill.example', Origin: origin } }))).toBe(false);
  }
});
