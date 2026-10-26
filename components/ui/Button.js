import { cn } from "@/lib/cn";
import Spinner from "@/components/ui/Spinner";

const variants = {
  primary: "bg-purple text-white hover:bg-purple-deep active:bg-purple-deep",
  secondary: "bg-ink text-cream hover:bg-neutral-800 active:bg-neutral-800",
  ghost: "bg-transparent text-ink hover:bg-neutral-100 active:bg-neutral-200",
  danger: "bg-danger text-white hover:opacity-90 active:opacity-80",
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
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple",
        "disabled:cursor-not-allowed disabled:opacity-50",
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
