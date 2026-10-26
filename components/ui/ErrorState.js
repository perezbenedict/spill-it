import { cn } from "@/lib/cn";

export default function ErrorState({
  title = "Something went wrong",
  description,
  retry,
  className,
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-danger/30 bg-danger/5 px-6 py-12 text-center",
        className
      )}
    >
      <div aria-hidden="true" className="text-danger">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {retry ? <div className="mt-1">{retry}</div> : null}
    </div>
  );
}
