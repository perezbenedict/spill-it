'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import CategoryCards from '@/components/participant/CategoryCards';
import NicknamePicker from '@/components/participant/NicknamePicker';
import SubmissionForm from '@/components/participant/SubmissionForm';
import { readNicknameCookie, writeNicknameCookie } from '@/components/participant/cookies';

export default function JoinExperience({ session }) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState('welcome');
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState(null);

  useEffect(() => {
    const saved = readNicknameCookie(session.code);
    if (saved) setNickname(saved);
  }, [session.code]);

  const transition = reducedMotion ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' };
  const stepVariants = {
    initial: { opacity: 0, x: reducedMotion ? 0 : 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reducedMotion ? 0 : -24 },
  };

  function handleNicknameContinue(value) {
    setNickname(value);
    writeNicknameCookie(session.code, value);
    setStep('category');
  }

  function handleCategorySelect(key) {
    setCategory(key);
    setStep('form');
  }

  return (
    <section>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          variants={stepVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          {step === 'welcome' ? (
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-purple">
                You&apos;re in - here&apos;s the topic
              </p>
              <h1 className="font-display text-3xl font-bold leading-tight text-ink">
                {session.title}
              </h1>
              {session.description ? (
                <p className="leading-relaxed text-muted">{session.description}</p>
              ) : null}
              {session.welcome_message ? (
                <p className="leading-relaxed text-ink">{session.welcome_message}</p>
              ) : null}
              <p className="rounded-card bg-purple/10 px-4 py-3 text-sm leading-relaxed text-purple-deep">
                No real names, ever. Pick a nickname and say what you actually think -
                honest conversations, no pressure.
              </p>
              <Button size="lg" className="w-full" onClick={() => setStep('nickname')}>
                Let&apos;s get into it
              </Button>
            </div>
          ) : null}

          {step === 'nickname' ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">
                  What should we call you?
                </h1>
                <p className="mt-1 text-sm text-muted">
                  A pseudonym for this conversation - pick one below.
                </p>
              </div>
              <NicknamePicker
                current={nickname}
                allowManual={session.configuration?.allow_manual_nickname !== false}
                onContinue={handleNicknameContinue}
              />
            </div>
          ) : null}

          {step === 'category' ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">
                  What are you bringing?
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Pick a contribution type, {nickname || 'friend'}.
                </p>
              </div>
              <CategoryCards
                available={session.available_categories || []}
                selected={category}
                onSelect={handleCategorySelect}
              />
            </div>
          ) : null}

          {step === 'form' ? (
            <SubmissionForm
              session={session}
              nickname={nickname}
              category={category}
              onBack={() => setStep('category')}
              onSuccess={() => setStep('success')}
            />
          ) : null}

          {step === 'success' ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <motion.span
                aria-hidden="true"
                initial={{ scale: reducedMotion ? 1 : 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 320, damping: 18 }
                }
                className="flex h-16 w-16 items-center justify-center rounded-pill bg-lime"
              >
                <Check className="h-9 w-9 text-ink" strokeWidth={3} />
              </motion.span>
              <h1 className="font-display text-2xl font-bold text-ink">Your thought is in.</h1>
              <p className="text-muted">No microphone required.</p>
              <p className="max-w-xs text-sm text-muted">
                It&apos;s waiting for the moderator before it shows up anywhere.
              </p>
              <Button
                size="lg"
                className="mt-2 w-full"
                onClick={() => {
                  setCategory(null);
                  setStep('category');
                }}
              >
                Submit another
              </Button>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
