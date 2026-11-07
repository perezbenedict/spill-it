import { cn } from "@/lib/cn";

export default function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "premium-surface min-w-0 rounded-card border border-white/10 bg-surface p-5 [overflow-wrap:anywhere] sm:p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
