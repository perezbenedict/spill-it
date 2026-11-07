"use client";

import { Check, Flame, HelpCircle, Lightbulb, MessagesSquare } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/cn";

const ICONS = {
  question: HelpCircle,
  opinion: Lightbulb,
  challenge: Flame,
  twocents: MessagesSquare,
};

const ACCENTS = {
  question: "bg-gold/20 text-gold",
  opinion: "bg-gold/25 text-gold-deep",
  challenge: "bg-crimson/20 text-crimson-bright",
  twocents: "bg-white/10 text-muted",
};

export default function CategoryCards({ available = [], selected = null, onSelect }) {
  const reducedMotion = useReducedMotion();
  const categories = CATEGORIES.filter((category) => available.includes(category.key));

  if (categories.length === 0) {
    return (
      <p
        role="alert"
        className="rounded-card border border-white/10 bg-surface px-4 py-6 text-center text-sm text-muted"
      >
        No contribution types are open for this discussion right now.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {categories.map(({ key, label, hint }) => {
        const Icon = ICONS[key];
        const isSelected = key === selected;
        return (
          <motion.li
            key={key}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : categories.findIndex((entry) => entry.key === key) * 0.055, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.button
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              whileHover={reducedMotion ? undefined : { y: -2, scale: 1.006 }}
              whileTap={reducedMotion ? undefined : { scale: 0.985 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={cn(
                "category-choice relative flex min-h-16 w-full items-start gap-3 overflow-hidden rounded-card border bg-surface p-4 text-left transition-[border-color,background-color,box-shadow] duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                isSelected
                  ? "border-gold/70 bg-gold/10 shadow-[inset_0_1px_0_rgba(196,181,253,0.14),0_10px_26px_-18px_rgba(167,139,250,0.4)]"
                  : "border-white/10 hover:border-gold/45 hover:bg-white/5"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
                  ACCENTS[key]
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <span>
                  <span className="block font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 block text-sm text-muted">{hint}</span>
                </span>
                <AnimatePresence initial={false}>
                  {isSelected ? (
                    <motion.span
                      initial={{ opacity: 0, x: reducedMotion ? 0 : 5, scale: reducedMotion ? 1 : 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: reducedMotion ? 0 : 5, scale: reducedMotion ? 1 : 0.9 }}
                      transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
                      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gold"
                    >
                      <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                      Picked
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </motion.button>
          </motion.li>
        );
      })}
    </ul>
  );
}
