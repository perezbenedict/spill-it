"use client";

import { motion, useReducedMotion } from 'framer-motion';

export default function StagePresentation({ overlay, seconds }) {
  const reduceMotion = useReducedMotion();
  if (!overlay) return null;
  return <motion.section
    key={`${overlay.kind}:${overlay.text}`}
    data-stage-overlay={overlay.kind}
    aria-label={overlay.kind === 'reflection' ? 'Reflection moment' : 'Spotlight prompt'}
    initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
    className="stage-message relative z-20 my-auto flex w-full shrink-0 flex-col items-center text-center"
  >
    <p className="stage-eyebrow">{overlay.kind === 'reflection' ? 'A moment to reflect' : 'In the spotlight'}</p>
    <h1 className="stage-prompt mt-6 font-display [overflow-wrap:anywhere]">{overlay.text}</h1>
    {seconds !== null && <p className="mt-8 text-xl tabular-nums text-gold-light" aria-label="Reflection time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
  </motion.section>;
}
