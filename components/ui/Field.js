import { cloneElement, useId } from "react";
import { cn } from "@/lib/cn";

// Wraps a form control (Input, Textarea, ...) wiring label, hint and error.
// Usage: <Field label="Name" hint="..." error="..."><Input /></Field>
export default function Field({
  label,
  hint,
  error,
  required = false,
  id: idProp,
  className,
  children,
}) {
  const reactId = useId();
  const id = idProp ?? `field-${reactId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id,
    required,
    "aria-required": required || undefined,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-coral">
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
