import { cn } from "@/lib/cn";
import Spinner from "@/components/ui/Spinner";

const base =
  "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control text-center font-medium leading-snug [overflow-wrap:anywhere] transition-[color,background-color,border-color,box-shadow,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary:
    "relative overflow-hidden bg-[linear-gradient(135deg,#C4B5FD,#A78BFA_55%,#6D4AB8)] text-[#1B1030] shadow-[0_4px_14px_-6px_rgba(167,139,250,0.45)] hover:shadow-[0_6px_20px_-7px_rgba(167,139,250,0.55)] hover:opacity-95 active:opacity-85",
  gold:
    "relative overflow-hidden bg-[linear-gradient(135deg,#C4B5FD,#A78BFA_55%,#6D4AB8)] text-[#1B1030] shadow-[0_4px_14px_-6px_rgba(167,139,250,0.45)] hover:shadow-[0_6px_20px_-7px_rgba(167,139,250,0.55)] hover:opacity-95 active:opacity-85",
  secondary:
    "border border-white/15 bg-midnight text-ink shadow-sm hover:border-gold/35 hover:bg-white/10 active:bg-white/5",
  ghost:
    "bg-transparent text-ink hover:bg-white/10 active:bg-white/5",
  danger:
    "bg-crimson text-white hover:opacity-90 active:opacity-80",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  children,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
