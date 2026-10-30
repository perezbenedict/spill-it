import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const Input = forwardRef(function Input(
  { className, type = "text", error = false, ...props },
  ref
) {
  return (
    <motion.input
      ref={ref}
      type={type}
      aria-invalid={error || undefined}
      whileFocus={{
        borderColor: error ? "rgb(220 20 60)" : "rgba(167, 139, 250, 0.55)",
        boxShadow: error
          ? "0 0 0 3px rgba(220, 20, 60, 0.25)"
          : "0 0 0 3px rgba(167, 139, 250, 0.25)",
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "w-full rounded-control border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted",
        "transition-colors duration-200 ease-out",
        !error ? "border-white/15" : "border-crimson",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-muted",
        className
      )}
      {...props}
    />
  );
});

export default Input;
