import Emblem from "@/components/Emblem";
import { getLiveSession } from "@/lib/spill-api";
import { RevealLine } from "@/components/motion/Reveal";
import { StaggerText } from "@/components/motion/StaggerText";
import { AnimatedSection } from "@/components/motion/AnimatedSection";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { motion } from "framer-motion";
import AnimatedBackground from "@/components/background/AnimatedBackground";


export const dynamic = "force-dynamic";

const EASE = [0.22, 1, 0.36, 1];

export default async function HomePage() {
  let session = null;
  try {
    const result = await getLiveSession();
    if (result.ok) session = result.body?.session ?? null;
  } catch {
    session = null;
  }

  const joinHref = session ? `/join/${session.public_code}` : null;

  return (
    <AnimatedBackground>
      <main
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center overflow-x-clip px-gutter py-10 sm:px-8"
        style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
      >
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

        <div className="relative z-10 flex flex-col items-center gap-5">
          {/* Emblem / Logo */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span
              className="mb-2 inline-flex h-20 w-20 drop-shadow-[0_0_18px_rgba(167,139,250,0.25)] sm:h-24 sm:w-24 animate-emblem-drift"
              aria-label="Spill It"
            >
              <Emblem className="h-full w-full" />
            </span>
          </motion.div>

          {/* Brand signature — uppercase Manrope eyebrow with champagne-gold accent line */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          >
            <span
              className="h-px w-8 bg-gradient-to-r from-transparent via-gold to-transparent opacity-60"
              aria-hidden="true"
            />
            <p className="hero-eyebrow font-sans font-semibold uppercase tracking-[0.22em] text-gold">
              Grace Nation Wealthy Youths
            </p>
            <span
              className="h-px w-8 bg-gradient-to-r from-transparent via-gold to-transparent opacity-60"
              aria-hidden="true"
            />
          </motion.div>

          {/* Headline — two independent reveal lines */}
          <h1 className="hero-title font-sans font-semibold text-ink text-center leading-[0.96] tracking-[-0.055em]">
            <RevealLine delay={0.3}>
              <span className="block">Your thoughts.</span>
            </RevealLine>
            <RevealLine delay={0.45}>
              <span className="display-accent block text-gold-light">
                Your voice.
              </span>
            </RevealLine>
          </h1>

          {/* Golden divider */}
          <motion.div
            className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent opacity-40"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.7, ease: EASE }}
            aria-hidden="true"
          />

          {/* Product identity — subordinate */}
          <AnimatedSection delay={0.85} className="flex justify-center">
            <StaggerText
              text="Spill It!"
              className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
            />
          </AnimatedSection>
        </div>

        {/* Subtitle */}
        <AnimatedSection className="relative z-10 mt-8 flex justify-center" delay={0.9}>
          <p className="max-w-md text-center text-[clamp(16px,2vw,18px)] leading-[1.65] text-muted">
            {session
              ? "No pressure. Just be real with us."
              : "No discussion is open right now. Check back soon."}
          </p>
        </AnimatedSection>

        {/* Join CTA */}
        {session ? (
          <AnimatedSection className="relative z-10 mt-8 flex justify-center" delay={1.0}>
            <MagneticButton
              href={joinHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-gold px-6 py-3 text-base font-medium text-midnight shadow-[0_0_18px_rgba(167,139,250,0.3)] transition-colors hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto"
            >
              Join the conversation
            </MagneticButton>
          </AnimatedSection>
        ) : null}
      </main>
    </AnimatedBackground>
  );
}
