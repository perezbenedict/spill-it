import { cn } from "@/lib/cn";

const variants = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-purple/10 text-purple-deep",
  success: "bg-lime/40 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

// Status is conveyed by the text label, not color alone.
export default function Badge({ variant = "neutral", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-current" />
      {children}
    </span>
  );
}
