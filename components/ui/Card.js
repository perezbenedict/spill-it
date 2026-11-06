import { cn } from "@/lib/cn";

export default function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-card border border-white/10 bg-surface p-5 shadow-[0_12px_36px_-24px_rgba(0,0,0,0.65)] [overflow-wrap:anywhere] sm:p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
