import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const Input = forwardRef(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full rounded-control border border-neutral-300 bg-surface px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-neutral-400",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
        "aria-[invalid=true]:border-danger",
        className
      )}
      {...props}
    />
  );
});

export default Input;
