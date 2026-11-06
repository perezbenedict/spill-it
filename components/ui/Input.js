import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const Input = forwardRef(function Input(
  { className, type = "text", error = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={error || undefined}
      className={cn(
        "min-h-11 min-w-0 w-full rounded-control border bg-surface px-3.5 py-2.5 text-base text-ink shadow-inner shadow-midnight/15 placeholder:text-muted sm:text-sm",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        !error
          ? "border-white/15 hover:border-gold/35 focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(167,139,250,0.16)]"
          : "border-crimson-bright focus:border-crimson-bright focus:shadow-[0_0_0_3px_rgba(216,50,76,0.18)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-muted disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});

export default Input;
