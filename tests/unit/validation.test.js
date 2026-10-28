import { describe, it, expect } from 'vitest';
import { submissionSchemaFactory, normalizeContent, sessionSchema, loginSchema } from '@/lib/validation';
import { generatePublicCode } from '@/lib/session-code';

const schema = submissionSchemaFactory();

const validSubmission = () => ({
  sessionCode: generatePublicCode(),
  category: 'question',
  nickname: 'Midnight Philosopher',
  content: 'What keeps you coming back to this room?',
});

describe('submissionSchemaFactory', () => {
  it('accepts a valid submission and trims output', () => {
    const result = schema.safeParse({
      ...validSubmission(),
      nickname: '  Midnight Philosopher  ',
      content: '  What keeps you coming back to this room?  ',
    });
    expect(result.success).toBe(true);
    expect(result.data.nickname).toBe('Midnight Philosopher');
    expect(result.data.content).toBe('What keeps you coming back to this room?');
  });

  it('rejects empty or whitespace-only content', () => {
    expect(schema.safeParse({ ...validSubmission(), content: '' }).success).toBe(false);
    expect(schema.safeParse({ ...validSubmission(), content: '   ' }).success).toBe(false);
  });

  it('rejects content over the default max and honors overridden maxLength', () => {
    const longContent = 'a'.repeat(1001);
    expect(schema.safeParse({ ...validSubmission(), content: longContent }).success).toBe(false);

    const lenient = submissionSchemaFactory({ maxLength: 2000 });
    expect(lenient.safeParse({ ...validSubmission(), content: longContent }).success).toBe(true);

    const stricter = submissionSchemaFactory({ minLength: 10 });
    expect(stricter.safeParse({ ...validSubmission(), content: 'too short' }).success).toBe(false);
  });

  it('rejects a bad category', () => {
    expect(schema.safeParse({ ...validSubmission(), category: 'rant' }).success).toBe(false);
    expect(schema.safeParse({ ...validSubmission(), category: 'Question' }).success).toBe(false);
  });

  it('rejects a missing sessionCode', () => {
    const withoutCode = { ...validSubmission() };
    delete withoutCode.sessionCode;
    expect(schema.safeParse(withoutCode).success).toBe(false);
  });

  it('rejects an invalid session code format', () => {
    expect(schema.safeParse({ ...validSubmission(), sessionCode: '0AAAAAAA' }).success).toBe(false);
    expect(schema.safeParse({ ...validSubmission(), sessionCode: 'short' }).success).toBe(false);
  });

  it('rejects a nickname over 60 chars', () => {
    expect(schema.safeParse({ ...validSubmission(), nickname: 'a'.repeat(61) }).success).toBe(false);
    expect(schema.safeParse({ ...validSubmission(), nickname: 'a'.repeat(60) }).success).toBe(true);
  });
});

describe('normalizeContent', () => {
  it('collapses internal whitespace runs to single spaces and trims', () => {
    expect(normalizeContent('  hello   \n  world \t !  ')).toBe('hello world !');
    expect(normalizeContent('already fine')).toBe('already fine');
    expect(normalizeContent('   ')).toBe('');
  });
});

describe('sessionSchema', () => {
  const validSession = () => ({
    title: 'Tuesday Night Room',
    description: 'A room for honest questions.',
    welcome_message: 'Say hi.',
    available_categories: ['question', 'opinion'],
    opens_at: '2026-01-01T18:00:00.000Z',
    closes_at: '2026-01-01T20:00:00.000Z',
    status: 'draft',
  });

  it('accepts a valid session and defaults optional text fields', () => {
    const result = sessionSchema.safeParse({
      title: 'Tuesday Night Room',
      available_categories: ['question'],
    });
    expect(result.success).toBe(true);
    expect(result.data.description).toBe('');
    expect(result.data.welcome_message).toBe('');
    expect(result.data.opens_at).toBeUndefined();
  });

  it('strips duplicate categories', () => {
    const result = sessionSchema.safeParse({
      ...validSession(),
      available_categories: ['question', 'opinion', 'question'],
    });
    expect(result.success).toBe(true);
    expect(result.data.available_categories).toEqual(['question', 'opinion']);
  });

  it('rejects an empty category list and bad category keys', () => {
    expect(sessionSchema.safeParse({ ...validSession(), available_categories: [] }).success).toBe(false);
    expect(
      sessionSchema.safeParse({ ...validSession(), available_categories: ['rant'] }).success,
    ).toBe(false);
  });

  it('rejects closes_at before opens_at', () => {
    expect(
      sessionSchema.safeParse({
        ...validSession(),
        opens_at: '2026-01-01T20:00:00.000Z',
        closes_at: '2026-01-01T18:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects closes_at equal to opens_at', () => {
    expect(
      sessionSchema.safeParse({
        ...validSession(),
        opens_at: '2026-01-01T18:00:00.000Z',
        closes_at: '2026-01-01T18:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('accepts missing or single-bound datetimes', () => {
    const noDates = { ...validSession() };
    delete noDates.opens_at;
    delete noDates.closes_at;
    expect(sessionSchema.safeParse(noDates).success).toBe(true);
    expect(sessionSchema.safeParse({ ...validSession(), closes_at: undefined }).success).toBe(true);
    expect(sessionSchema.safeParse({ ...validSession(), opens_at: undefined }).success).toBe(true);
  });

  it('rejects missing title, long title, and bad status', () => {
    expect(sessionSchema.safeParse({ ...validSession(), title: '' }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...validSession(), title: 'a'.repeat(201) }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...validSession(), status: 'archived' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a password-only payload', () => {
    expect(loginSchema.safeParse({ password: 'correcthorse' }).success).toBe(true);
  });

  it('rejects an empty or oversized password', () => {
    expect(loginSchema.safeParse({ password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'x'.repeat(201) }).success).toBe(false);
  });
});
