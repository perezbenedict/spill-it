import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-y rounded-control border border-white/15 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        "disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-muted",
        "aria-[invalid=true]:border-crimson",
        className
      )}
      {...props}
    />
  );
});

export default Textarea;
