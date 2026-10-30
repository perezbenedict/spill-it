import { cloneElement, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export default function Field({
  label,
  hint,
  error,
  required = false,
  id: idProp,
  className,
  children,
}) {
  const reactId = useId();
  const id = idProp ?? `field-${reactId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id,
    required,
    "aria-required": required || undefined,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    error: !!error,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-crimson">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <div className="min-h-[1.25rem]">
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              key={error}
              id={errorId}
              role="alert"
              className="text-xs font-medium text-crimson"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
