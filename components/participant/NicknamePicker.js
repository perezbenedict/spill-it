"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Shuffle } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ensureUnique, generateNickname, generateSuggestions, isNicknameTaken } from "@/lib/nickname";

export default function NicknamePicker({
  current = "",
  allowManual = true,
  usedNames = [],
  onContinue,
  error,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState("");
  const [manualValue, setManualValue] = useState("");

  useEffect(() => {
    setSuggestions(generateSuggestions(3, current ? [current] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive the active value: manual input takes precedence, then picked, then current, then first suggestion.
  const activeManual = manualValue.trim() || "";
  const active = activeManual || picked || current || suggestions[0] || "";
  const options = [...new Set(current ? [current, ...suggestions] : suggestions)];

  // Check if the active suggestion is technically valid but already taken (soft UX hint).
  // The worker is authoritative, this just hints before submit.
  const activeSuggestion = picked || (current ? null : suggestions[0] || "");
  const isActiveTaken =
    (activeSuggestion && isNicknameTaken(activeSuggestion, usedNames)) ||
    (activeManual && isNicknameTaken(activeManual, usedNames));

  function regenerate() {
    if (allowManual) {
      const next = generateSuggestions(3, options);
      setSuggestions(next);
      setPicked(next[0] || active);
      setManualValue("");
    } else {
      setPicked(ensureUnique(generateNickname(), active ? [active] : []));
      setManualValue("");
    }
  }

  // When user types in manual input, clear the picked suggestion.
  const handleManualChange = (event) => setManualValue(event.target.value);

  // Pass the trimmed manual input if the user typed something, otherwise the
  // picked suggestion (or the pre-filled current nickname). The parent
  // (JoinExperience) performs the authoritative server-side uniqueness check
  // before advancing; this callback is synchronous so the picker stays
  // self-contained and animation-friendly.
  function handleContinue() {
    onContinue(activeManual || picked || current || "");
  }

  const disabled = !active;
  const hasError = !!error || isActiveTaken;

  return (
    <div className="flex flex-col gap-4">
      {allowManual && (
        <div>
          <label htmlFor="nickname-input" className="mb-1 block text-sm font-medium text-ink">
            Your nickname
          </label>
          <div className="relative">
            <input
              id="nickname-input"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="false"
              placeholder="Type your name (or click suggestions below)"
              value={manualValue}
              onChange={handleManualChange}
              maxLength={60}
              className={cn(
                "w-full rounded-control border bg-surface px-4 py-3 text-base font-medium text-ink",
                "transition-colors duration-200",
                "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                hasError
                  ? "border-crimson bg-crimson/5 focus-visible:outline-crimson"
                  : "border-white/20 focus-within:border-gold/70"
              )}
            />
            {activeManual && (
              <Check
                aria-hidden="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex-shrink-0 text-gold"
                strokeWidth={activeManual && !hasError ? 3 : 1.5}
              />
            )}
          </div>
        </div>
      )}

      {!allowManual && current && (
        <div className="flex items-center justify-between gap-3 rounded-card border-2 border-gold bg-gold/10 px-4 py-3">
          <span className="text-base font-semibold text-ink">{active}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gold">
            <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
            Picked
          </span>
        </div>
      )}

      {allowManual && (
        <div role="group" aria-label="Nickname suggestions" className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {options.map((option) => {
              const isSelected = option === active && !activeManual;
              return (
                <motion.button
                  key={option}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setPicked(option);
                    setManualValue("");
                  }}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -2 }}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-control border-2 bg-surface px-4 py-3 text-left text-base font-medium text-ink transition-colors duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                    isSelected
                      ? "border-gold bg-gold/10 shadow-[0_0_14px_rgba(167,139,250,0.2)]"
                      : "border-white/10 hover:border-gold/70 hover:bg-white/5"
                  )}
                >
                  <span className="truncate">{option}</span>
                  <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.span
                        key="picked"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-gold"
                      >
                        <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                        Picked
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {hasError && (
        <motion.p
          key={error || "taken"}
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="rounded-control border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm font-medium text-crimson"
        >
          {error || "That nickname is already taken."}
        </motion.p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="secondary"
          onClick={regenerate}
          className="w-full sm:w-auto"
        >
          <Shuffle aria-hidden="true" className="h-4 w-4" />
          {allowManual ? "Generate another" : "Another one"}
        </Button>
        <Button
          size="lg"
          variant="primary"
          disabled={disabled}
          onClick={handleContinue}
          className="w-full sm:w-auto"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}