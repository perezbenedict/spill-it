import { cn } from "@/lib/cn";

const variants = {
  neutral: "border-white/10 bg-white/10 text-muted",
  info: "border-gold/25 bg-gold/15 text-gold",
  success: "border-gold/40 bg-gold/25 text-gold",
  warning: "border-gold-deep/60 bg-gold-deep/25 text-gold-light",
  danger: "border-crimson/40 bg-crimson/20 text-crimson-bright",
};

export default function Badge({ variant = "neutral", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-current" />
      {children}
    </span>
  );
}
