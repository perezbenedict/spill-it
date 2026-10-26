import { cn } from "@/lib/cn";

export default function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-card border border-neutral-200 bg-surface p-6 shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
