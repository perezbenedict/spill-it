"use client";

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export default function StagePresentation({ overlay, seconds }) {
  const reduceMotion = useReducedMotion();
  if (!overlay) return null;
  return <AnimatePresence mode="wait"><motion.section
    key={`${overlay.kind}:${overlay.text}`}
    data-stage-overlay={overlay.kind}
    aria-label={overlay.kind === 'reflection' ? 'Reflection moment' : 'Spotlight prompt'}
    initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.99 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, transition: { duration: 0.18 } }}
    transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
    className="stage-message relative z-20 my-auto flex w-full shrink-0 flex-col items-center text-center"
  >
    <div aria-hidden="true" className="mb-7 h-px w-16 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
    <p className="stage-eyebrow">{overlay.kind === 'reflection' ? 'A moment to reflect' : 'In the spotlight'}</p>
    <h1 className="stage-prompt mt-6 font-display [overflow-wrap:anywhere]">{overlay.text}</h1>
    {seconds !== null && <p role="timer" aria-live="off" className="mt-8 inline-flex min-w-24 justify-center rounded-full border border-gold/15 bg-midnight/20 px-5 py-2 text-xl tabular-nums text-gold-light" aria-label="Reflection time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
  </motion.section></AnimatePresence>;
}
