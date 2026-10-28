"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Coins, Flame, HelpCircle, MessageSquare } from "lucide-react";
import { createSession, updateSession } from "@/lib/actions/sessions";
import { CATEGORIES, DEFAULT_MIN_CONTENT_LENGTH, DEFAULT_MAX_CONTENT_LENGTH } from "@/lib/constants";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";

const CATEGORY_KEYS = CATEGORIES.map((category) => category.key);

const emptyToUndefined = (value) => (value === "" || value == null ? undefined : value);

const formSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the discussion a title.")
      .max(200, "Keep the title under 200 characters."),
    description: z.string().max(2000, "Keep the description under 2000 characters."),
    welcome_message: z.string().max(1000, "Keep the welcome message under 1000 characters."),
    available_categories: z
      .array(z.enum(CATEGORY_KEYS))
      .min(1, "Pick at least one category."),
    opens_at: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    closes_at: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    status: z.enum(["draft", "live"]).optional(),
    min_content_length: z.coerce
      .number()
      .int("Use a whole number.")
      .min(1, "Minimum length must be at least 1.")
      .max(1000, "Minimum length must be 1000 or less."),
    max_content_length: z.coerce
      .number()
      .int("Use a whole number.")
      .min(1, "Maximum length must be at least 1.")
      .max(1000, "Maximum length must be 1000 or less."),
    allow_manual_nickname: z.boolean(),
    prompts: z.string(),
  })
  .superRefine((session, ctx) => {
    if (session.opens_at && session.closes_at && session.closes_at <= session.opens_at) {
      ctx.addIssue({
        code: "custom",
        path: ["closes_at"],
        message: "Closing time must be after the opening time.",
      });
    }
    if (session.min_content_length > session.max_content_length) {
      ctx.addIssue({
        code: "custom",
        path: ["max_content_length"],
        message: "Maximum length must be at least the minimum length.",
      });
    }
  });

const CATEGORY_ICONS = {
  question: HelpCircle,
  opinion: MessageSquare,
  challenge: Flame,
  twocents: Coins,
};

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toFormData(data) {
  const formData = new FormData();
  formData.set("title", data.title);
  formData.set("description", data.description ?? "");
  formData.set("welcome_message", data.welcome_message ?? "");
  for (const category of data.available_categories ?? []) {
    formData.append("available_categories", category);
  }
  if (data.opens_at) formData.set("opens_at", new Date(data.opens_at).toISOString());
  if (data.closes_at) formData.set("closes_at", new Date(data.closes_at).toISOString());
  formData.set("status", data.status ?? "draft");
  formData.set("min_content_length", String(data.min_content_length));
  formData.set("max_content_length", String(data.max_content_length));
  formData.set("allow_manual_nickname", data.allow_manual_nickname ? "on" : "off");
  formData.set("prompts", data.prompts ?? "");
  return formData;
}

function SubmitButton({ mode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      {pending
        ? mode === "create"
          ? "Creating..."
          : "Saving..."
        : mode === "create"
          ? "Create discussion"
          : "Save changes"}
    </Button>
  );
}

export default function SessionForm({ mode, session }) {
  const action = mode === "edit" ? updateSession.bind(null, session.id) : createSession;
  const [state, formAction, pending] = useActionState(action, { error: null });

  const configuration = session?.configuration ?? {};
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: session?.title ?? "",
      description: session?.description ?? "",
      welcome_message: session?.welcome_message ?? "",
      available_categories: session?.available_categories ?? CATEGORY_KEYS,
      opens_at: toLocalInput(session?.opens_at),
      closes_at: toLocalInput(session?.closes_at),
      status: "draft",
      min_content_length: configuration.min_content_length ?? DEFAULT_MIN_CONTENT_LENGTH,
      max_content_length: configuration.max_content_length ?? DEFAULT_MAX_CONTENT_LENGTH,
      allow_manual_nickname: configuration.allow_manual_nickname ?? true,
      prompts: (configuration.prompts ?? []).join("\n"),
    },
  });

  useEffect(() => {
    if (!state?.fieldErrors) return;
    for (const [name, message] of Object.entries(state.fieldErrors)) {
      setError(name, { type: "server", message });
    }
  }, [state, setError]);

  const onSubmit = handleSubmit((data, event) => {
    event?.preventDefault();
    formAction(toFormData(data));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Discussion
        </h2>

        <Field label="Title" required error={errors.title?.message}>
          <Input {...register("title")} placeholder="Friday product retro" />
        </Field>

        <Field
          label="Description"
          hint="Optional. Shown on the join page before participants enter."
          error={errors.description?.message}
        >
          <Textarea {...register("description")} rows={3} />
        </Field>

        <Field
          label="Welcome message"
          hint="Shown to participants when they join"
          error={errors.welcome_message?.message}
        >
          <Textarea {...register("welcome_message")} rows={2} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">
            Categories
            <span aria-hidden="true" className="ml-0.5 text-crimson">
              *
            </span>
          </legend>
          <p className="text-xs text-muted">Pick which kinds of submissions participants can make.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.key] ?? MessageSquare;
              return (
                <label
                  key={category.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-control border border-white/10 bg-surface p-3",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold"
                  )}
                >
                  <input
                    type="checkbox"
                    value={category.key}
                    className="mt-1 h-5 w-5 shrink-0 accent-gold"
                    {...register("available_categories")}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
                      {category.label}
                    </span>
                    <span className="text-xs text-muted">{category.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.available_categories ? (
            <p role="alert" className="text-xs font-medium text-crimson">
              {errors.available_categories.message}
            </p>
          ) : null}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Opens at"
            hint="Optional. Leave empty to open immediately on publish."
            error={errors.opens_at?.message}
          >
            <Input type="datetime-local" {...register("opens_at")} />
          </Field>
          <Field
            label="Closes at"
            hint="Optional. Must be after the opening time."
            error={errors.closes_at?.message}
          >
            <Input type="datetime-local" {...register("closes_at")} />
          </Field>
        </div>

        {mode === "create" ? (
          <Field
            label="Publish now?"
            hint="A discussion can only be published when no other one is live."
            error={errors.status?.message}
          >
            <select
              {...register("status")}
              className="w-full rounded-control border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <option value="draft">Save as draft</option>
              <option value="live">Publish now</option>
            </select>
          </Field>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Session settings
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Minimum content length"
            hint="1 to 1000 characters."
            error={errors.min_content_length?.message}
          >
            <Input type="number" min={1} max={1000} {...register("min_content_length")} />
          </Field>
          <Field
            label="Maximum content length"
            hint="1 to 1000 characters, at least the minimum."
            error={errors.max_content_length?.message}
          >
            <Input type="number" min={1} max={1000} {...register("max_content_length")} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-control border border-white/10 bg-surface p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-gold"
            {...register("allow_manual_nickname")}
          />
          <span className="text-sm font-medium text-ink">
            Let participants pick from suggested nicknames
          </span>
        </label>

        <Field
          label="Discussion prompts"
          hint="Optional. Enter one prompt per line - these can help spark the conversation."
          error={errors.prompts?.message}
        >
          <Textarea {...register("prompts")} rows={4} placeholder={"What went well?\nWhat should we change?"} />
        </Field>
      </Card>

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-crimson">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p role="status" className="text-sm font-medium text-gold">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton mode={mode} />
        <Link
          href="/admin/sessions"
          className="inline-flex items-center rounded-control px-5 py-3 text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Cancel
        </Link>
        {pending ? <span className="text-sm text-muted">Working...</span> : null}
      </div>
    </form>
  );
}
