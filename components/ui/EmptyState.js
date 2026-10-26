import { cn } from "@/lib/cn";

export default function EmptyState({ icon, title, description, className, children }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-neutral-300 bg-surface px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-purple">
          {icon}
        </div>
      ) : null}
      {title ? <h3 className="font-display text-lg font-semibold text-ink">{title}</h3> : null}
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {children}
    </div>
  );
}
