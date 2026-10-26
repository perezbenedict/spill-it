import { describe, it, expect } from 'vitest';
import {
  generateNickname,
  generateSuggestions,
  ensureUnique,
  TITLES,
  NOUN_PHRASES,
  ADJECTIVES,
  TEMPLATES,
} from '@/lib/nickname';

const BANNED_TOKENS = ['damn', 'hell', 'hate', 'stupid', 'idiot', 'sex', 'drugs'];

describe('generateNickname', () => {
  it('returns a non-empty string within 60 chars', () => {
    for (let i = 0; i < 50; i += 1) {
      const nickname = generateNickname();
      expect(typeof nickname).toBe('string');
      expect(nickname.length).toBeGreaterThan(0);
      expect(nickname.length).toBeLessThanOrEqual(60);
    }
  });

  it('never leaves empty template holes or double spaces', () => {
    for (let i = 0; i < 200; i += 1) {
      const nickname = generateNickname();
      expect(nickname).not.toContain('{');
      expect(nickname).not.toContain('  ');
    }
  });
});

describe('generateSuggestions', () => {
  it('returns the requested count, unique, excluding existing', () => {
    const existing = ['Reverend Overthinker', 'CEO of Small Talk'];
    const suggestions = generateSuggestions(5, existing);
    expect(suggestions).toHaveLength(5);
    expect(new Set(suggestions).size).toBe(5);
    for (const suggestion of suggestions) {
      expect(existing).not.toContain(suggestion);
    }
  });
});

describe('ensureUnique', () => {
  it('returns the base nickname when it is unused', () => {
    expect(ensureUnique('Midnight Philosopher', [])).toBe('Midnight Philosopher');
  });

  it('returns a different, <=60 char value when the base is taken', () => {
    const taken = ['Midnight Philosopher'];
    const result = ensureUnique('Midnight Philosopher', taken);
    expect(result).not.toBe('Midnight Philosopher');
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('stays within 60 chars for a max-length base', () => {
    const base = 'x'.repeat(60);
    const result = ensureUnique(base, [base]);
    expect(result).not.toBe(base);
    expect(result.length).toBeLessThanOrEqual(60);
  });
});

describe('curated word lists', () => {
  it('contain no banned tokens', () => {
    const entries = [...TITLES, ...NOUN_PHRASES, ...ADJECTIVES, ...TEMPLATES];
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      for (const token of BANNED_TOKENS) {
        expect(lower).not.toContain(token);
      }
    }
  });
});
