"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import CategoryCards from "@/components/participant/CategoryCards";
import NicknamePicker from "@/components/participant/NicknamePicker";
import SubmissionForm from "@/components/participant/SubmissionForm";
import TopicCard from "@/components/participant/TopicCard";
import { readNicknameCookie, writeNicknameCookie } from "@/components/participant/cookies";

// GNWY-style reveal: short 10px travel with a long ease-out tail.
const REVEAL_EASE = [0.16, 1, 0.3, 1];

// Minimal step-back arrow so subsequent steps never repeat a full-width label.
function BackArrow({ onClick, label }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label || "Back"}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-white/10 text-ink/70 hover:border-gold/60 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
    </motion.button>
  );
}

// Minimal next-arrow used by steps that previously repeated "Continue".
function NextArrow({ onClick, label, disabled }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label || "Continue"}
      disabled={disabled || undefined}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-white/10 text-ink/70 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
    </motion.button>
  );
}

export default function JoinExperience({ session, usedNicknames = [] }) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState("welcome");
  const [nickname, setNickname] = useState("");
  const [category, setCategory] = useState(null);
  const [chosenCategory, setChosenCategory] = useState(null);
  const [nicknameError, setNicknameError] = useState(null);

  useEffect(() => {
    const saved = readNicknameCookie(session.code);
    if (saved) setNickname(saved);
  }, [session.code]);

  const status = session.status || "live";
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" };
  const stepVariants = {
    initial: { opacity: 0, x: reducedMotion ? 0 : 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reducedMotion ? 0 : -24 },
  };

  function revealProps(delay) {
    if (reducedMotion) return {};
    return {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.5, ease: REVEAL_EASE, delay },
    };
  }

  async function handleNicknameContinue(value) {
    const trimmed = value.trim();
    // Authoritative server-side check via the new /nickname availability
    // endpoint — the worker is the source of truth on session-scoped
    // uniqueness and excludes the caller's own prior submissions, so a
    // returning participant can keep their own nickname across submissions.
    // The picker's inline hint (from usedNicknames) is a soft visual cue only.
    try {
      const response = await fetch("/api/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode: session.code, nickname: trimmed }),
      }).catch(() => null);

      if (response && response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data && data.available === false) {
          setNicknameError("That nickname is already taken.");
          return;
        }
      }
    } catch {
      // Network error — fall through; the worker still enforces at submit.
    }

    setNicknameError(null);
    setNickname(trimmed);
    writeNicknameCookie(session.code, trimmed);
    setStep("category");
  }

  function handleCategorySelect(key) {
    // Hold the selection so the user confirms with the minimal next-arrow,
    // rather than auto-advancing and repeating the full-width "Continue".
    setChosenCategory(key);
    setCategory(key);
  }

  function handleCategoryConfirm() {
    setStep("form");
  }

  // Top-left step-back target (nothing on welcome; form owns its own Back).
  const backTarget = {
    welcome: null,
    introduce: "welcome",
    nickname: "introduce",
    category: "nickname",
    form: null,
  };
  const showBackArrow = Boolean(backTarget[step]);

  // Back to home is never hardcoded: it always links to "/", so it works for
  // every session regardless of code or state.
  const backHome = (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gold underline-offset-4 hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
      Back to home
    </Link>
  );

  const eyebrowText =
    status === "paused"
      ? "Submissions are paused"
      : status === "closed"
        ? "This conversation has wrapped"
        : "You're in - here's the topic";

  return (
    <section>
      {/* Persistent top chrome: step-back arrow (where it exists) + back-to-home. */}
      <motion.header
        {...revealProps(0)}
        className="mb-6 flex items-center justify-between"
      >
        <div className={showBackArrow ? "" : "invisible"}>
          <BackArrow onClick={() => setStep(backTarget[step])} label="Back" />
        </div>
        {backHome}
      </motion.header>

      {/* No initial={false}: the first screen must play its staggered reveal. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          {step === "welcome" ? (
            <div className="flex flex-col gap-5">
              <motion.div {...revealProps(0)} className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                  {eyebrowText}
                </p>
                <h1 className="text-balance font-display text-3xl font-bold leading-tight text-ink">
                  {session.title}
                </h1>
              </motion.div>

              {/* The topic is surfaced once, on the welcome/introduce step. */}
              <motion.div {...revealProps(0.12)}>
                <TopicCard topic={session.topic} />
              </motion.div>

              {session.welcome_message ? (
                <motion.p {...revealProps(0.16)} className="leading-relaxed text-ink">
                  {session.welcome_message}
                </motion.p>
              ) : null}
              {session.description ? (
                <motion.p {...revealProps(0.2)} className="leading-relaxed text-muted">
                  {session.description}
                </motion.p>
              ) : null}
              {status === "live" ? (
                <motion.p
                  {...revealProps(0.28)}
                  className="rounded-card border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-gold"
                >
                  No pressure. Just be real with us.
                </motion.p>
              ) : null}

              {status === "live" ? (
                <motion.div {...revealProps(0.36)}>
                  <Button
                    size="lg"
                    variant="primary"
                    className="w-full"
                    onClick={() => setStep("introduce")}
                  >
                    Join the conversation
                  </Button>
                </motion.div>
              ) : (
                <motion.div {...revealProps(0.36)} className="flex flex-col gap-3">
                  <p
                    role="status"
                    className={`rounded-card border px-4 py-3 text-sm leading-relaxed ${
                      status === "paused"
                        ? "border-gold/30 bg-gold/10 text-gold"
                        : "border-crimson/30 bg-crimson/10 text-crimson-bright"
                    }`}
                  >
                    {status === "paused"
                      ? "This discussion is paused right now - the moderator will reopen it shortly. Check back in a few."
                      : "Thanks for wanting to contribute. This discussion is closed, so no new thoughts can be added."}
                  </p>
                  <div className="self-start">{backHome}</div>
                </motion.div>
              )}
            </div>
          ) : null}

          {step === "introduce" ? (
            <div className="flex flex-col gap-5">
              <motion.div {...revealProps(0)}>
                <h1 className="font-display text-2xl font-bold text-ink">
                  Say your mind kindly.
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Pick a nickname and say what you actually think.
                </p>
              </motion.div>

              <motion.div {...revealProps(0.12)}>
                <TopicCard topic={session.topic} />
              </motion.div>

              <motion.div {...revealProps(0.2)} className="flex items-center justify-end gap-2">
                <NextArrow onClick={() => setStep("nickname")} label="Continue" />
              </motion.div>
            </div>
          ) : null}

          {step === "nickname" ? (
            <div className="flex flex-col gap-4">
              <motion.div {...revealProps(0)}>
                <h1 className="font-display text-2xl font-bold text-ink">
                  What should we call you?
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Pick a nickname for this conversation.
                </p>
              </motion.div>
              <motion.div {...revealProps(0.1)}>
                <NicknamePicker
                  current={nickname}
                  allowManual={session.configuration?.allow_manual_nickname !== false}
                  usedNames={usedNicknames}
                  onContinue={handleNicknameContinue}
                  error={nicknameError}
                />
              </motion.div>
            </div>
          ) : null}

          {step === "category" ? (
            <div className="flex flex-col gap-4">
              <motion.div {...revealProps(0)}>
                <h1 className="font-display text-2xl font-bold text-ink">
                  What are you bringing?
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Pick a contribution type, {nickname || "friend"}.
                </p>
              </motion.div>
              <motion.div {...revealProps(0.1)}>
                <CategoryCards
                  available={session.available_categories || []}
                  selected={chosenCategory}
                  onSelect={handleCategorySelect}
                />
              </motion.div>
              <motion.div
                {...revealProps(0.2)}
                className="flex items-center justify-end gap-2"
              >
                <NextArrow
                  onClick={handleCategoryConfirm}
                  label="Continue"
                  disabled={!chosenCategory}
                />
              </motion.div>
            </div>
          ) : null}

          {step === "form" ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <SubmissionForm
                session={session}
                nickname={nickname}
                category={category}
                onBack={() => setStep("category")}
                onSuccess={() => {
                  setCategory(null);
                  setChosenCategory(null);
                  setStep("category");
                }}
              />
            </motion.div>
          ) : null}

        </motion.div>
      </AnimatePresence>
    </section>
  );
}
