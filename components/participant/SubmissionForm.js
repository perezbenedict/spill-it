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
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
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
  twocents: "Add your two cents.",
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

// Animated SVG spinner used as the button's loading indicator (no emoji).
function LoadingSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Animated SVG checkmark using path-length animation.
function AnimatedCheckmark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 52 52"
      className="h-16 w-16 text-gold"
      fill="none"
    >
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="2.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      <motion.path
        d="M15 27 L23 35 L37 19"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.3, ease: "easeOut" }}
      />
    </svg>
  );
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
  const [contentError, setContentError] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error

  const pending = status === "submitting";
  const nearLimit = content.length >= maxLength * 0.9;
  const charCount = content.length;

  function handleContentChange(event) {
    setContent(event.target.value);
    if (contentError) setContentError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending || status === "success") return;

    const parsed = submissionSchemaFactory({ minLength, maxLength }).safeParse({
      sessionCode: session.code,
      category,
      nickname,
      content,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path?.includes("content")) {
        setContentError(messageForIssue(issue, minLength, maxLength));
      } else {
        setError(messageForIssue(issue, minLength, maxLength));
      }
      return;
    }

    setContentError(null);
    setError(null);
    setStatus("submitting");
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
        setStatus("error");
        return;
      }
      // Success confirmed by the server - transition to confirmation state.
      setStatus("success");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  function handleRetry() {
    setError(null);
    setStatus("idle");
  }

  function handleSubmitAnother() {
    setContent("");
    setError(null);
    setContentError(null);
    setStatus("idle");
    onSuccess?.();
  }

  return (
    <AnimatePresence mode="wait">
      {status === "success" ? (
        <motion.div
          key="success"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-4 py-6 text-center"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="flex h-20 w-20 items-center justify-center rounded-pill bg-gold/15 text-gold"
          >
            <AnimatedCheckmark />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.45, ease: "easeOut" }}
            className="font-display text-2xl font-bold text-ink"
          >
            Your thought is with the moderator.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.55, ease: "easeOut" }}
            className="text-muted"
          >
            Thanks for adding your voice. Stay curious.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.62, ease: "easeOut" }}
            className="max-w-sm text-sm text-muted"
          >
            It is not visible to the room yet - nothing shows up until a moderator
            approves it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.7, ease: "easeOut" }}
            className="mt-2 w-full"
          >
            <Button
              size="lg"
              variant="primary"
              className="w-full"
              onClick={handleSubmitAnother}
            >
              Submit another
            </Button>
          </motion.div>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={handleSubmit}
          noValidate
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-start gap-3">
            <motion.span
              aria-hidden="true"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
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
              <motion.span
                key={`picked-${category}`}
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18, delay: 0.05, ease: "easeOut" }}
                className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-midnight shadow-[0_0_8px_rgba(167,139,250,0.4)]"
              >
                <Check aria-hidden="true" className="h-2.5 w-2.5" strokeWidth={3.5} />
              </motion.span>
            </motion.span>
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
            <Field
              label={CATEGORY_PROMPTS[category] || "What do you want to say?"}
              required
              error={contentError}
            >
              <Textarea
                value={content}
                onChange={handleContentChange}
                rows={3}
                placeholder={CATEGORY_PLACEHOLDERS[category] || "Type it out - nobody here knows who you are."}
                disabled={pending}
                error={!!contentError}
                className="text-base"
                maxLength={maxLength}
              />
            </Field>
            <div className="mt-1.5 flex items-center justify-end">
              <motion.p
                aria-live="polite"
                animate={{
                  color: nearLimit ? "rgb(109 74 184)" : "rgba(183, 173, 201, 0.9)",
                  scale: nearLimit ? 1.05 : 1,
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn(
                  "text-right text-xs tabular-nums",
                  nearLimit ? "font-semibold" : "font-normal"
                )}
              >
                <motion.span
                  key={charCount}
                  initial={{ opacity: 0.6, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {charCount}
                </motion.span>
                <span className="text-muted"> / {maxLength}</span>
              </motion.p>
            </div>
          </div>

          <div className="min-h-[3rem]">
            <AnimatePresence initial={false}>
              {error ? (
                <motion.p
                  key={error}
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="rounded-control border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm font-medium text-crimson"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              onClick={onBack}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {status === "error" ? (
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  onClick={handleRetry}
                  className="w-full sm:w-auto"
                >
                  Try again
                </Button>
              ) : null}
              <Button
                type="submit"
                size="lg"
                variant="primary"
                disabled={pending}
                aria-busy={pending || undefined}
                className="w-full sm:w-auto"
              >
                {pending ? (
                  <LoadingSpinner />
                ) : (
                  <span
                    aria-hidden="true"
                    className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  />
                )}
                <span className="relative">
                  {pending ? "Sending..." : "Spill it now!"}
                </span>
              </Button>
            </div>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
