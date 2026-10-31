import { MAX_NICKNAME_LENGTH } from './constants.js';

// Curated so no template combination can produce profanity, slurs, or group-directed insults.
export const TITLES = [
  'Reverend',
  'Deacon',
  'Captain',
  'Sister',
  'Minister',
  'CEO',
  'Professor',
  'Chaplain',
  'Pastor',
];

export const NOUN_PHRASES = [
  'Overthinker',
  'Plot Twist',
  'Menace',
  'Philosopher',
  'Midnight Choir',
  'Holy Ghost Typist',
  'Hot Takes',
  'Small Talk',
  'Divine Timing',
  'Group Chat',
  'Side Quest',
  'Read Receipts',
  'Voice Memo',
  'Praise Break',
];

export const ADJECTIVES = [
  'Anonymous',
  'Midnight',
  'Professional',
  'Holy',
  'Unbothered',
  'Chronically Online',
  'Certified',
  'Self-Appointed',
  'Locally Loved',
];

export const TEMPLATES = [
  'CEO of {phrase}',
  'Reverend {noun}',
  'The {adjective} {noun}',
  '{Title} of {noun}',
  'Captain {noun}',
  'Professional {noun}',
  'Holy Ghost {noun}',
  'Sister {noun} of {phrase}',
];

const PLACEHOLDER_FILLERS = {
  phrase: () => pick(NOUN_PHRASES),
  noun: () => pick(NOUN_PHRASES),
  adjective: () => pick(ADJECTIVES),
  Title: () => pick(TITLES),
};

const VARIATIONS = [' (2)', ' Jr.', ' the Second'];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomTwoDigit() {
  return String(10 + Math.floor(Math.random() * 90));
}

function fitWithin(nickname, suffix) {
  const maxBase = MAX_NICKNAME_LENGTH - suffix.length;
  const base = nickname.length > maxBase ? nickname.slice(0, maxBase) : nickname;
  return base + suffix;
}

export function generateNickname() {
  const template = pick(TEMPLATES);
  return template.replace(/\{(\w+)\}/g, (match, key) => PLACEHOLDER_FILLERS[key]());
}

export function generateSuggestions(count = 3, existing = []) {
  const taken = new Set(existing);
  const suggestions = [];
  let attempts = 0;
  const maxAttempts = count * 50 + 100;
  while (suggestions.length < count && attempts < maxAttempts) {
    attempts += 1;
    const candidate = ensureUnique(generateNickname(), [...taken, ...suggestions]);
    if (!taken.has(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
  }
  return suggestions;
}

export function ensureUnique(nickname, existing = []) {
  const taken = new Set(existing);
  if (!taken.has(nickname)) return nickname;
  for (const suffix of VARIATIONS) {
    const candidate = fitWithin(nickname, suffix);
    if (!taken.has(candidate)) return candidate;
  }
  return fitWithin(nickname, ` ${randomTwoDigit()}`);
}

// Same normalization the worker enforces uniqueness with: trim + lowercase, so
// "Captain", " captain " and "CAPTAIN" collide. The worker is authoritative;
// this is only a client-side pre-check for nicer UX.
export function normalizeNickname(nickname) {
  return String(nickname == null ? '' : nickname).trim().toLowerCase();
}

// True when `nickname` (normalized) already appears in `usedNames`. Used by the
// nickname step to warn before advancing; the worker still rejects duplicates.
export function isNicknameTaken(nickname, usedNames = []) {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return false;
  return usedNames.some((name) => normalizeNickname(name) === normalized);
}
