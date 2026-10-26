// Unambiguous alphabet: no 0/O, 1/I/L. 31 chars.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

const ALPHABET_SIZE = CODE_ALPHABET.length;
// Largest multiple of ALPHABET_SIZE <= 256; bytes >= this are rejected to avoid modulo bias.
const ACCEPT_LIMIT = Math.floor(256 / ALPHABET_SIZE) * ALPHABET_SIZE;

function randomByteBelow(limit) {
  const bytes = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    if (bytes[0] < limit) return bytes[0];
  }
}

export function generatePublicCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomByteBelow(ACCEPT_LIMIT) % ALPHABET_SIZE];
  }
  return code;
}

export function isValidPublicCode(code) {
  if (typeof code !== 'string') return false;
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/i.test(code);
}
