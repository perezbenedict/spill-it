"use client";

import { Check, Flame, HelpCircle, Lightbulb, MessagesSquare } from "lucide-react";
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
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex min-h-16 w-full items-start gap-3 overflow-hidden rounded-card border bg-surface p-4 text-left transition-all duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                isSelected
                  ? "border-gold bg-gold/10 shadow-[0_0_18px_rgba(167,139,250,0.25)]"
                  : "border-white/10 hover:-translate-y-0.5 hover:border-gold/60 hover:bg-white/5"
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
                {isSelected ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gold">
                    <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                    Picked
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
