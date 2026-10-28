"use client";

import { useEffect, useState } from "react";
import { Check, Shuffle } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ensureUnique, generateNickname, generateSuggestions } from "@/lib/nickname";

export default function NicknamePicker({ current = "", allowManual = true, onContinue }) {
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    setSuggestions(generateSuggestions(3, current ? [current] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = picked || current || suggestions[0] || "";
  const options = [...new Set(current ? [current, ...suggestions] : suggestions)];
  const disabled = !active;

  function regenerate() {
    if (allowManual) {
      const next = generateSuggestions(3, options);
      setSuggestions(next);
      setPicked(next[0] || active);
    } else {
      setPicked(ensureUnique(generateNickname(), active ? [active] : []));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {allowManual ? (
        <div role="group" aria-label="Nickname suggestions" className="flex flex-col gap-2">
          {options.map((option) => {
            const isSelected = option === active;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setPicked(option)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-control border-2 bg-surface px-4 py-3 text-left text-base font-medium text-ink transition-all duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                  isSelected
                    ? "border-gold bg-gold/10 shadow-[0_0_14px_rgba(167,139,250,0.2)]"
                    : "border-white/10 hover:-translate-y-0.5 hover:border-gold/70 hover:bg-white/5"
                )}
              >
                <span className="truncate">{option}</span>
                {isSelected ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gold">
                    <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                    Picked
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-card border-2 border-gold bg-gold/10 px-4 py-3">
          <span className="text-base font-semibold text-ink">{active}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gold">
            <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
            Picked
          </span>
        </div>
      )}


      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={regenerate} className="w-full sm:w-auto">
          <Shuffle aria-hidden="true" className="h-4 w-4" />
          {allowManual ? "Generate another" : "Another one"}
        </Button>
        <Button
          size="lg"
          variant="primary"
          disabled={disabled}
          onClick={() => onContinue(active)}
          className="w-full sm:w-auto"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
