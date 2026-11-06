import { forwardRef, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// Keep content visible as the composer grows without animating its geometry.
const Textarea = forwardRef(function Textarea(
  { className, rows = 4, error = false, ...props },
  ref
) {
  const innerRef = useRef(null);
  const composedRef = (node) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref && typeof ref === "object") ref.current = node;
  };

  const resize = useCallback(() => {
    const textarea = innerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const textarea = innerRef.current;
    if (!textarea) return;
    resize();
    textarea.addEventListener("input", resize);
    return () => textarea.removeEventListener("input", resize);
  }, [resize]);

  return (
    <textarea
      ref={composedRef}
      rows={rows}
      aria-invalid={error || undefined}
      onInput={resize}
      className={cn(
        "min-h-11 min-w-0 w-full resize-none overflow-hidden rounded-control border bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink shadow-inner shadow-midnight/15 placeholder:text-muted sm:text-sm",
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

export default Textarea;
