import { forwardRef, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

// Auto-expanding textarea with an animated focus ring. Height grows smoothly
// as content is typed; the border glows gold on focus and crimson on error.
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
    <motion.textarea
      ref={composedRef}
      rows={rows}
      aria-invalid={error || undefined}
      whileFocus={{
        borderColor: error ? "rgb(220 20 60)" : "rgba(167, 139, 250, 0.55)",
        boxShadow: error
          ? "0 0 0 3px rgba(220, 20, 60, 0.25)"
          : "0 0 0 3px rgba(167, 139, 250, 0.25)",
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onInput={resize}
      className={cn(
        "w-full resize-none overflow-hidden rounded-control border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted",
        "transition-[border-color,box-shadow,height] duration-200 ease-out",
        !error ? "border-white/15" : "border-crimson",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-muted",
        className
      )}
      {...props}
    />
  );
});

export default Textarea;
