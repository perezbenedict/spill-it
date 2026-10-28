import { z } from 'zod';
import {
  CATEGORIES,
  SESSION_STATUSES,
  DEFAULT_MIN_CONTENT_LENGTH,
  DEFAULT_MAX_CONTENT_LENGTH,
  MAX_NICKNAME_LENGTH,
} from './constants.js';
import { isValidPublicCode } from './session-code.js';

const CATEGORY_KEYS = CATEGORIES.map((category) => category.key);

export function submissionSchemaFactory({
  minLength = DEFAULT_MIN_CONTENT_LENGTH,
  maxLength = DEFAULT_MAX_CONTENT_LENGTH,
} = {}) {
  return z.object({
    sessionCode: z
      .string()
      .refine((code) => isValidPublicCode(code), { message: 'Invalid session code' }),
    category: z.enum(CATEGORY_KEYS),
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH),
    content: z.string().trim().min(minLength).max(maxLength),
  });
}

export function normalizeContent(content) {
  return content.replace(/\s+/g, ' ').trim();
}

export const sessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional().default(''),
    welcome_message: z.string().max(1000).optional().default(''),
    available_categories: z
      .array(z.enum(CATEGORY_KEYS))
      .min(1)
      .transform((categories) => [...new Set(categories)]),
    opens_at: z.coerce.date().optional(),
    closes_at: z.coerce.date().optional(),
    topic: z.string().max(200).optional(),
  })
  .superRefine((session, ctx) => {
    if (session.opens_at && session.closes_at && session.closes_at <= session.opens_at) {
      ctx.addIssue({
        code: 'custom',
        path: ['closes_at'],
        message: 'closes_at must be after opens_at',
      });
    }
  });

export const loginSchema = z.object({
  password: z.string().min(1).max(200),
});
