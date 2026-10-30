"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Button from "@/components/ui/Button";
import CategoryCards from "@/components/participant/CategoryCards";
import NicknamePicker from "@/components/participant/NicknamePicker";
import SubmissionForm from "@/components/participant/SubmissionForm";
import { readNicknameCookie, writeNicknameCookie } from "@/components/participant/cookies";

// GNWY-style reveal: short 10px travel with a long ease-out tail.
const REVEAL_EASE = [0.16, 1, 0.3, 1];

export default function JoinExperience({ session }) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState("welcome");
  const [nickname, setNickname] = useState("");
  const [category, setCategory] = useState(null);

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

  function handleNicknameContinue(value) {
    setNickname(value);
    writeNicknameCookie(session.code, value);
    setStep("category");
  }

  function handleCategorySelect(key) {
    setCategory(key);
    setStep("form");
  }

  const eyebrowText =
    status === "paused"
      ? "Submissions are paused"
      : status === "closed"
        ? "This conversation has wrapped"
        : "You're in - here's the topic";

  return (
    <section>
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
            <div className="flex flex-col gap-4">
              <motion.div {...revealProps(0)} className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                  {eyebrowText}
                </p>
                <h1 className="text-balance font-display text-3xl font-bold leading-tight text-ink">
                  {session.title}
                </h1>
              </motion.div>
              {session.welcome_message ? (
                <motion.p {...revealProps(0.08)} className="leading-relaxed text-ink">
                  {session.welcome_message}
                </motion.p>
              ) : null}
              {session.description ? (
                <motion.p {...revealProps(0.16)} className="leading-relaxed text-muted">
                  {session.description}
                </motion.p>
              ) : null}
              {status === "live" ? (
                <motion.p
                  {...revealProps(0.24)}
                  className="rounded-card border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-gold"
                >
                  No pressure. Just be real with us.
                </motion.p>
              ) : null}
              {status === "live" ? (
                <motion.div {...revealProps(0.32)}>
                  <Button
                    size="lg"
                    variant="primary"
                    className="w-full"
                    onClick={() => setStep("introduce")}
                  >
                    Let&apos;s get into it
                  </Button>
                </motion.div>
              ) : (
                <motion.div {...revealProps(0.32)} className="flex flex-col gap-3">
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
                  <Link
                    href="/"
                    className="self-start text-sm font-medium text-gold underline-offset-4 hover:underline"
                  >
                    Back to home
                  </Link>
                </motion.div>
              )}
            </div>
          ) : null}

          {step === "introduce" ? (
            <div className="flex flex-col gap-4">
              <motion.div {...revealProps(0)}>
                <h1 className="font-display text-2xl font-bold text-ink">
                  Say your mind kindly.
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Pick a nickname and say what you actually think.
                </p>
              </motion.div>
              <motion.div {...revealProps(0.1)}>
                <Button
                  size="lg"
                  variant="primary"
                  className="w-full"
                  onClick={() => setStep("nickname")}
                >
                  Let&apos;s get into it
                </Button>
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
                  onContinue={handleNicknameContinue}
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
                  selected={category}
                  onSelect={handleCategorySelect}
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
