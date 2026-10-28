"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { login } from "@/lib/actions/auth";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full">
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(login, { error: null });

  return (
    <div className="flex flex-col gap-4">
      {/* Light card keeps Field's ink labels readable against the dark panel. */}
      <Card className="p-5">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Admin Password" required>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {state.error}
            </p>
          ) : null}
          <SubmitButton />
        </form>
      </Card>
      <Link
        href="/"
        className="text-center text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Back to Spill It
      </Link>
    </div>
  );
}
