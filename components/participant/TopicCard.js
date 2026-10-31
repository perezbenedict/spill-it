"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

// Premium card that makes the live discussion topic feel special.
// Renders nothing when there is no topic, so empty/missing data never crashes.
export default function TopicCard({ topic }) {
  const reducedMotion = useReducedMotion();
  const text = typeof topic === "string" ? topic.trim() : "";

  if (!text) return null;

  const timing = { duration: reducedMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        // Stable key on the topic string: topic changes animate in place
        // without remounting the page or dropping unsent input.
        key={text}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 14, scale: reducedMotion ? 1 : 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reducedMotion ? 0 : -8, scale: reducedMotion ? 1 : 0.97 }}
        transition={timing}
        className="relative overflow-hidden rounded-card border border-gold/30 bg-surface/70 p-6 shadow-[0_10px_45px_-14px_rgba(167,139,250,0.55)] backdrop-blur-sm sm:p-7"
      >
        {/* Ambient glow */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px bg-[radial-gradient(120%_70%_at_50%_-15%,rgba(196,181,253,0.30),transparent_65%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
        />
        <div className="relative flex flex-col gap-3.5">
          <span className="flex w-fit items-center gap-2 rounded-pill border border-gold/25 bg-gold/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-gold">
            <Sparkles aria-hidden="true" className="h-3 w-3" />
            Current topic
          </span>
          <motion.p
            key={`topic-text-${text}`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...timing, delay: 0.06 }}
            className="font-display text-3xl leading-[1.12] text-ink sm:text-4xl"
          >
            {text}
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
