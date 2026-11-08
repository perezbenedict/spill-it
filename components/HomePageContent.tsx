"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import Emblem from "@/components/Emblem";
import { AnimatedSection } from "@/components/motion/AnimatedSection";
import { MagneticButton } from "@/components/motion/MagneticButton";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface HomePageSession {
  id: string;
  public_code: string;
  title: string;
  description?: string;
  welcome_message?: string;
  status: string;
  available_categories?: string[];
  configuration?: Record<string, unknown>;
  opens_at?: string | null;
  closes_at?: string | null;
  topic?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HomePageContentProps {
  session: HomePageSession | null;
  provided: boolean;
}

export default function HomePageContent({ session, provided }: HomePageContentProps) {
  // The homepage receives the session object directly (see app/page.js).
  // Standardize on that shape here instead of unwrapping session.session.
  const sessionObj = session ?? null;
  const joinHref =
    sessionObj && typeof sessionObj.public_code === "string" && sessionObj.public_code.length > 0
      ? `/join/${sessionObj.public_code}`
      : null;

  // Interactive background glow — pointer position tracked as motion values
  // (no React state on every move), smoothed with a spring.
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const glowX = useSpring(pointerX, { stiffness: 80, damping: 24, mass: 0.4 });
  const glowY = useSpring(pointerY, { stiffness: 80, damping: 24, mass: 0.4 });
  const reducedMotion = useReducedMotion();

  const lineEntrance = (delay: number) => ({
    initial: reducedMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reducedMotion ? 0 : 0.65,
      delay: reducedMotion ? 0 : delay,
      ease: EASE,
    },
  });

  function handlePointerMove(e) {
    if (reducedMotion || e.pointerType !== "mouse") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerX.set(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    pointerY.set(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)));
  }

  return (
    <main
      className="hero-page relative mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center overflow-x-clip px-gutter py-10 sm:px-8"
      style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
      onPointerMove={handlePointerMove}
    >
      {/* Ambient purple background movement + pointer-following glow (behind text) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        {/* Slow-drifting purple layers */}
        <span className="absolute -left-24 top-[8%] h-[32rem] w-[32rem] animate-ambient-a rounded-full bg-[radial-gradient(circle,rgba(124,92,200,0.18),transparent_70%)]" />
        <span className="absolute -right-28 bottom-[10%] h-[28rem] w-[28rem] animate-ambient-b rounded-full bg-[radial-gradient(circle,rgba(196,181,253,0.14),transparent_70%)]" />
        <span className="absolute left-[18%] top-[38%] h-[24rem] w-[24rem] animate-ambient-c rounded-full bg-[radial-gradient(circle,rgba(109,74,184,0.12),transparent_68%)]" />
        {/* Pointer-following glow, desktop only */}
        <motion.span
          className="glow-pointer absolute top-0 left-0 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.16),transparent_65%)]"
          style={{
            x: glowX,
            y: glowY,
            marginLeft: "-20rem",
            marginTop: "-20rem",
            left: "50%",
            top: "50%",
          }}
        />

        {/* Decorative orbital accents — thin, very low-opacity rings */}
        <svg
          className="animate-orbit-slow absolute top-1/2 left-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]"
          viewBox="0 0 400 400"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="200" cy="200" r="150" stroke="url(#orbit-gold)" strokeWidth="1" />
          <circle cx="200" cy="200" r="205" stroke="url(#orbit-lav)" strokeWidth="1" strokeDasharray="2 10" />
          <defs>
            <linearGradient id="orbit-gold" x1="0" y1="0" x2="400" y2="400">
              <stop offset="0" stopColor="#C4B5FD" />
              <stop offset="1" stopColor="#A78BFA" />
            </linearGradient>
            <linearGradient id="orbit-lav" x1="0" y1="400" x2="400" y2="0">
              <stop offset="0" stopColor="#6D4AB8" />
              <stop offset="1" stopColor="#C4B5FD" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Rotating emblem watermark (behind content) */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
        >
          <span
            className="block h-[28vmin] w-[28vmin] opacity-[0.025] motion-safe:animate-rotate-slow sm:h-[32vmin] sm:w-[32vmin]"
            style={{ animationDuration: "120s" }}
          >
            <Emblem className="h-full w-full" />
          </span>
        </div>

        {/* Emblem / Logo */}
        <motion.div
          className="flex justify-center"
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.8, ease: EASE }}
        >
          <span
            className="mb-2 inline-flex h-20 w-20 drop-shadow-[0_6px_18px_rgba(167,139,250,0.18)] sm:h-24 sm:w-24"
            role="img" aria-label="Spill It"
          >
            <Emblem className="h-full w-full" />
          </span>
        </motion.div>

        {/* Brand signature — uppercase Manrope eyebrow with champagne-gold accent line */}
        <motion.div
          className="flex w-full max-w-full items-center justify-center gap-2 sm:gap-3"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.8, ease: EASE }}
        >
          <span
            className="h-px w-5 shrink-0 bg-gradient-to-r from-transparent via-gold to-transparent opacity-60 sm:w-8"
            aria-hidden="true"
          />
          <p className="hero-eyebrow font-sans font-semibold uppercase tracking-[0.18em] text-gold">
            Grace Nation Wealthy Youths
          </p>
          <span
            className="h-px w-5 shrink-0 bg-gradient-to-r from-transparent via-gold to-transparent opacity-60 sm:w-8"
            aria-hidden="true"
          />
        </motion.div>

        {/*
         * Each headline line owns a stable row in normal flow. The row keeps
         * its final geometry while only its child translates inside a padded
         * reveal mask, so the entrance cannot move or collide with siblings.
         */}
        <h1
          className="hero-headline w-full px-1 sm:px-2"
          style={{ gap: "clamp(0.45rem, 1.4vw, 0.85rem)" }}
        >
          <span
            className="flex w-full items-center justify-center overflow-hidden px-[0.35em] py-[0.14em]"
            style={{ minHeight: "clamp(2.65rem, 6.2vw, 3.75rem)" }}
            data-home-headline-row="thoughts"
          >
            <motion.span className="thought-line block" {...lineEntrance(0.28)}>
              Your thoughts.
            </motion.span>
          </span>
          <span
            className="flex w-full items-center justify-center overflow-hidden px-[0.4em] py-[0.14em]"
            style={{ minHeight: "clamp(2.55rem, 5.9vw, 3.55rem)" }}
            data-home-headline-row="voice"
          >
            <motion.span className="voice-line block" {...lineEntrance(0.44)}>
              Your voice.
            </motion.span>
          </span>
          <span
            className="flex w-full items-center justify-center overflow-hidden px-[0.55em] py-[0.18em]"
            style={{ minHeight: "clamp(2.7rem, 5.7vw, 3.5rem)" }}
            data-home-headline-row="wordmark"
          >
            <motion.span className="wordmark-line block" {...lineEntrance(0.6)}>
              <span className="spill-wordmark">Spill it</span>
            </motion.span>
          </span>
        </h1>
      </div>

      {/* Subtitle */}
      <AnimatedSection className="relative z-10 mt-8 flex justify-center" delay={0.76}>
        <p className="max-w-md text-center text-[clamp(16px,2vw,18px)] leading-[1.65] text-muted">
          {sessionObj
            ? "No pressure. Just be real with us."
            : provided
              ? "This discussion isn’t open right now. Check back soon, or join a live one."
              : "No discussion is open right now. Check back soon."}
        </p>
      </AnimatedSection>

      {/* Join CTA */}
      {joinHref ? (
        <AnimatedSection className="relative z-10 mt-8 flex justify-center" delay={0.92}>
          <MagneticButton
            href={joinHref}
            className="hero-cta group inline-flex w-full items-center justify-center gap-2 rounded-control bg-gold px-6 py-3 text-base font-medium text-midnight transition-[background-color,box-shadow] duration-200 ease-out hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto"
          >
            Join the Conversation
            <motion.span
              className="inline-block"
              aria-hidden="true"
              initial={false}
              whileHover={reducedMotion ? undefined : { x: 3 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              →
            </motion.span>
          </MagneticButton>
        </AnimatedSection>
      ) : null}

      {/* Developer credit — low-priority, understated */}
      <footer className="relative z-10 mt-12 flex justify-center">
        <p className="developer-credit text-center">Developed by Perez Benedict</p>
      </footer>
    </main>
  );
}
