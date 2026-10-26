'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import Textarea from '@/components/ui/Textarea';
import {
  CATEGORIES,
  DEFAULT_MAX_CONTENT_LENGTH,
  DEFAULT_MIN_CONTENT_LENGTH,
} from '@/lib/constants';
import { submissionSchemaFactory } from '@/lib/validation';
import { cn } from '@/lib/cn';

const CATEGORY_PROMPTS = {
  question: 'What do you want to ask the room?',
  opinion: 'What is your take? Say it with your whole chest.',
  challenge: 'What are you challenging the room with?',
  twocents: 'Got two cents? Drop them here.',
};

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 1000);
}

// Fixed friendly copy - never surface zod issues or server internals.
function messageForIssue(issue, minLength, maxLength) {
  if (issue?.path?.includes('content')) {
    return issue.code === 'too_big'
      ? `Keep it under ${maxLength} characters.`
      : `Say a little more - at least ${minLength} characters.`;
  }
  if (issue?.path?.includes('nickname')) return 'Pick a nickname before sending.';
  return 'Check your submission and try again.';
}

export default function SubmissionForm({ session, nickname, category, onBack, onSuccess }) {
  const configuration = session.configuration || {};
  const minLength = clampLength(
    configuration.min_content_length,
    DEFAULT_MIN_CONTENT_LENGTH
  );
  const maxLength = clampLength(
    configuration.max_content_length,
    DEFAULT_MAX_CONTENT_LENGTH
  );

  const [content, setContent] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const nearLimit = content.length >= maxLength * 0.9;

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;

    const parsed = submissionSchemaFactory({ minLength, maxLength }).safeParse({
      sessionCode: session.code,
      category,
      nickname,
      content,
    });
    if (!parsed.success) {
      setError(messageForIssue(parsed.error.issues[0], minLength, maxLength));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'Something went wrong and your thought was not saved. Please try again.'
        );
        return;
      }
      onSuccess();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-purple">
          {CATEGORIES.find((entry) => entry.key === category)?.label || 'Contribution'}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          What&apos;s on your mind?
        </h1>
      </div>

      <div>
        <Field label={CATEGORY_PROMPTS[category] || 'What do you want to say?'} required>
          {/* text-base (16px) stops iOS from zooming the viewport on focus */}
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Type it out - nobody here knows who you are."
            disabled={pending}
            className="text-base"
          />
        </Field>
        <p
          aria-live="polite"
          className={cn(
            'mt-1.5 text-right text-xs tabular-nums',
            nearLimit ? 'font-semibold text-coral' : 'text-muted'
          )}
        >
          {content.length} / {maxLength}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending} className="w-full sm:w-auto">
          Back
        </Button>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="w-full sm:w-auto"
        >
          Send it in
        </Button>
      </div>
    </form>
  );
}
