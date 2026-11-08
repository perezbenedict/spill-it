"use client";

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

function announcementType(text, compact) {
  if (compact) return { fontSize: 'clamp(1.125rem, 2vw, 2rem)', maxWidth: '100%' };
  if (text.length > 500) return { fontSize: 'clamp(1.25rem, min(2.5vw, 3.5vh), 4rem)', width: '100%', maxWidth: 'min(100%, 78ch)' };
  if (text.length > 160) return { fontSize: 'clamp(1.5rem, min(3.4vw, 4.8vh), 6rem)', maxWidth: '42ch' };
  return { fontSize: 'clamp(2rem, min(5vw, 8vh), 10rem)', maxWidth: '28ch' };
}

export default function StagePresentation({ overlay, seconds, compact = false }) {
  const reduceMotion = useReducedMotion();
  if (!overlay || overlay.kind === 'voting') return null;
  const isAnnouncement = overlay.kind === 'announcement';
  const isReflection = overlay.kind === 'reflection';
  const style = overlay.style || 'statement';
  const identity = JSON.stringify([overlay.kind, overlay.heading, overlay.text, overlay.subtitle, overlay.style]);
  const Message = style === 'quote' ? 'blockquote' : style === 'notice' && overlay.heading ? 'p' : 'h1';
  return <AnimatePresence mode="wait"><motion.section
    key={identity}
    data-stage-overlay={overlay.kind}
    data-announcement-style={isAnnouncement ? style : undefined}
    aria-label={isAnnouncement ? 'Stage announcement' : isReflection ? 'Reflection moment' : 'Spotlight prompt'}
    initial={reduceMotion ? false : { opacity: 0, y: isReflection ? 4 : isAnnouncement ? 16 : 12, scale: isReflection ? 1 : 0.99 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, transition: { duration: 0.18 } }}
    transition={{ duration: reduceMotion ? 0 : isAnnouncement || isReflection ? 0.65 : 0.5, ease: [0.16, 1, 0.3, 1] }}
    className={`stage-message ${isAnnouncement ? 'stage-announcement' : ''} relative z-20 my-auto flex w-full shrink-0 flex-col items-center text-center`}
  >
    <div aria-hidden="true" className="mb-7 h-px w-16 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
    {isAnnouncement ? <>
      {style === 'quote' && <span aria-hidden="true" className="stage-quotation-mark">“</span>}
      {overlay.heading && (style === 'statement'
        ? <p className="stage-eyebrow mb-5 max-w-full [overflow-wrap:anywhere]">{overlay.heading}</p>
        : <h1 className="stage-announcement-heading mb-6 font-display [overflow-wrap:anywhere]">{overlay.heading}</h1>)}
      <Message data-announcement-text="true" className="stage-announcement-message mx-auto whitespace-pre-wrap font-display [overflow-wrap:anywhere]" style={announcementType(overlay.text, compact)}>{overlay.text}</Message>
      {overlay.subtitle && <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : .35, delay: reduceMotion ? 0 : .18 }} className="stage-announcement-subtitle mt-7 max-w-[58ch] whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{overlay.subtitle}</motion.p>}
    </> : <>
      <p className="stage-eyebrow">{isReflection ? 'A moment to reflect' : 'In the spotlight'}</p>
      <h1 className="stage-prompt mt-6 font-display [overflow-wrap:anywhere]">{overlay.text}</h1>
    </>}
    {seconds !== null && seconds !== undefined && <p role="timer" aria-live="off" className="mt-8 inline-flex min-w-24 justify-center rounded-full border border-gold/15 bg-midnight/20 px-5 py-2 text-xl tabular-nums text-gold-light" aria-label={isAnnouncement ? 'Announcement time remaining' : 'Reflection time remaining'}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>}
  </motion.section></AnimatePresence>;
}
