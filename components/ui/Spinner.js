import { cn } from "@/lib/cn";

export default function Spinner({ className, label = "Loading", ...props }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-gold",
        className
      )}
      {...props}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
