import { describe, it, expect } from 'vitest';
import { generatePublicCode, isValidPublicCode } from '@/lib/session-code';

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

describe('generatePublicCode', () => {
  it('generates 500 valid codes', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generatePublicCode();
      expect(code).toMatch(CODE_PATTERN);
      expect(code).toHaveLength(8);
    }
  });
});

describe('isValidPublicCode', () => {
  it('accepts a generated code', () => {
    expect(isValidPublicCode(generatePublicCode())).toBe(true);
  });

  it('rejects disallowed 0/O/1/I variants and bad lengths', () => {
    expect(isValidPublicCode('short')).toBe(false);
    expect(isValidPublicCode('AAAAAAAA')).toBe(true); // no disallowed char, all A's are valid
    expect(isValidPublicCode('0AAAAAAA')).toBe(false); // 0 excluded
    expect(isValidPublicCode('IIIIIIII')).toBe(false); // I excluded
    expect(isValidPublicCode('OOOOOOOO')).toBe(false); // O excluded
    expect(isValidPublicCode('LLLLLLLL')).toBe(false); // L excluded
    expect(isValidPublicCode('ABCDEFG')).toBe(false); // too short
    expect(isValidPublicCode('ABCDEFGHJ')).toBe(false); // too long
  });

  it('accepts lowercase and rejects lowercase with invalid chars', () => {
    expect(isValidPublicCode('abcdefgh')).toBe(true);
    expect(isValidPublicCode('abcdefghi')).toBe(false);
    expect(isValidPublicCode('0aaaaaaa')).toBe(false);
  });
});
