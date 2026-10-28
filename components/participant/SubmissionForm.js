"use client";

import dynamic from 'next/dynamic';

// Dynamically load Lucide icons on the client only to avoid SSR manifest errors.
const IconMap = {
  question: dynamic(() => import('lucide-react').then(mod => ({ default: mod.HelpCircle })), { ssr: false }),
  opinion: dynamic(() => import('lucide-react').then(mod => ({ default: mod.Lightbulb })), { ssr: false }),
  challenge: dynamic(() => import('lucide-react').then(mod => ({ default: mod.Flame })), { ssr: false }),
  twocents: dynamic(() => import('lucide-react').then(mod => ({ default: mod.MessagesSquare })), { ssr: false }),
};

import { useState } from "react";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Textarea from "@/components/ui/Textarea";
import { CATEGORIES, DEFAULT_MAX_CONTENT_LENGTH, DEFAULT_MIN_CONTENT_LENGTH } from "@/lib/constants";
import { submissionSchemaFactory } from "@/lib/validation";
import { cn } from "@/lib/cn";


const CATEGORY_HEADINGS = {
  question: "What are you wondering?",
  opinion: "State your take.",
  challenge: "Bring something worth arguing about.",
  twocents: "Join the conversation.",
};

const CATEGORY_PROMPTS = {
  question: "What do you want to ask the room?",
  opinion: "What is your take? Say it with your whole chest.",
  challenge: "What are you challenging the room with?",
  twocents: "Got two cents? Drop them here.",
};

const CATEGORY_PLACEHOLDERS = {
  question:
    "Ask anything - what's something you genuinely want to know?",
  opinion: "Say where you stand and why you feel that way.",
  challenge: "Bring an idea or viewpoint that gets people talking.",
  twocents: "Jump in and share your perspective.",
};

const CATEGORY_ACCENTS = {
  question: "bg-gold/20 text-gold",
  opinion: "bg-gold/25 text-gold-deep",
  challenge: "bg-crimson/20 text-crimson-bright",
  twocents: "bg-gold/15 text-gold-light",
};

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 1000);
}

function messageForIssue(issue, minLength, maxLength) {
  if (issue?.path?.includes("content")) {
    return issue.code === "too_big"
      ? `Keep it under ${maxLength} characters.`
      : `Say a little more - at least ${minLength} characters.`;
  }
  if (issue?.path?.includes("nickname")) return "Pick a nickname before sending.";
  return "Check your submission and try again.";
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

  const [content, setContent] = useState("");
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
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === "string" && data.error
            ? data.error
            : "Something went wrong and your thought was not saved. Please try again."
        );
        return;
      }
      onSuccess();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
            CATEGORY_ACCENTS[category] || "bg-gold/20 text-gold"
          )}
        >
          {category === "challenge" ? (
            <IconMap.challenge className="h-5 w-5" />
          ) : category === "opinion" ? (
            <IconMap.opinion className="h-5 w-5" />
          ) : category === "twocents" ? (
            <IconMap.twocents className="h-5 w-5" />
          ) : (
            <IconMap.question className="h-5 w-5" />
          )}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">
            {CATEGORIES.find((entry) => entry.key === category)?.label || "Contribution"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">
            {CATEGORY_HEADINGS[category] || "What's on your mind?"}
          </h1>
        </div>
      </div>

      <div>
        <Field label={CATEGORY_PROMPTS[category] || "What do you want to say?"} required>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder={CATEGORY_PLACEHOLDERS[category] || "Type it out - nobody here knows who you are."}
            disabled={pending}
            className="text-base"
          />
        </Field>
        <p
          aria-live="polite"
          className={cn(
            "mt-1.5 text-right text-xs tabular-nums transition-colors",
            nearLimit ? "font-semibold text-gold-deep" : "text-muted"
          )}
        >
          {content.length} / {maxLength}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm font-medium text-crimson"
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
          variant="primary"
          loading={pending}
          className="w-full sm:w-auto"
        >
          <span
            aria-hidden="true"
            className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
          <span className="relative">{pending ? "Sending..." : "Send"}</span>
        </Button>
      </div>
    </form>
  );
}
