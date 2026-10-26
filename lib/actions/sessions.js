"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sessionSchema } from "@/lib/validation";
import { generatePublicCode } from "@/lib/session-code";
import {
  DEFAULT_MIN_CONTENT_LENGTH,
  DEFAULT_MAX_CONTENT_LENGTH,
} from "@/lib/constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIVE_CONFLICT_ERROR =
  "Another discussion is already live - pause or close it first.";
const CONCURRENT_CHANGE_ERROR =
  "This discussion changed state in another tab - refresh and try again.";
const GENERIC_ERROR = "Could not save this discussion. Please try again.";

// closed is terminal; only the transitions the UI offers are allowed.
const ALLOWED_TRANSITIONS = {
  draft: ["live"],
  live: ["paused", "closed"],
  paused: ["live", "closed"],
  closed: [],
};

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

function mentions(error, fragment) {
  return String(error?.message ?? "").includes(fragment);
}

function fieldErrorsOf(zodError) {
  const fieldErrors = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1000, Math.max(1, parsed));
}

function parsePrompts(value) {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Core fields go through the shared schema; configuration fields are pulled
// out separately, clamped and stored in the jsonb column.
function parseSessionPayload(formData) {
  const parsed = sessionSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    welcome_message: formData.get("welcome_message") ?? "",
    available_categories: formData.getAll("available_categories"),
    opens_at: formData.get("opens_at") || undefined,
    closes_at: formData.get("closes_at") || undefined,
    status: formData.get("status") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const configuration = {
    min_content_length: clampLength(
      formData.get("min_content_length"),
      DEFAULT_MIN_CONTENT_LENGTH
    ),
    max_content_length: clampLength(
      formData.get("max_content_length"),
      DEFAULT_MAX_CONTENT_LENGTH
    ),
    allow_manual_nickname:
      formData.get("allow_manual_nickname") === "on" ||
      formData.get("allow_manual_nickname") === "true",
    prompts: parsePrompts(formData.get("prompts")),
  };
  if (configuration.min_content_length > configuration.max_content_length) {
    configuration.max_content_length = configuration.min_content_length;
  }

  const { opens_at, closes_at, ...rest } = parsed.data;
  return {
    data: {
      ...rest,
      // Explicit nulls so clearing a date input clears the column.
      opens_at: opens_at ?? null,
      closes_at: closes_at ?? null,
      configuration,
    },
  };
}

async function findLiveSession(supabase, { excludeId } = {}) {
  let query = supabase
    .from("discussion_sessions")
    .select("id")
    .eq("status", "live")
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("live-session check failed:", error.code, error.message);
    return { failed: true };
  }
  return { row: data };
}

export async function createSession(prevState, formData) {
  await requireAdmin();

  const { data, fieldErrors } = parseSessionPayload(formData);
  if (fieldErrors) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { status, ...values } = data;
  const wantsLive = status === "live";

  const supabase = await createClient();

  if (wantsLive) {
    const { row, failed } = await findLiveSession(supabase);
    if (failed) return { error: GENERIC_ERROR };
    if (row) return { error: LIVE_CONFLICT_ERROR };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error } = await supabase
      .from("discussion_sessions")
      .insert({
        ...values,
        status: wantsLive ? "live" : "draft",
        public_code: generatePublicCode(),
      })
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/admin");
      revalidatePath("/admin/sessions");
      redirect(`/admin/sessions/${row.id}`);
    }

    if (isUniqueViolation(error) && mentions(error, "public_code")) {
      continue; // code collision - retry with a fresh code
    }
    if (isUniqueViolation(error) && mentions(error, "discussion_sessions_one_live")) {
      return { error: LIVE_CONFLICT_ERROR };
    }
    console.error("createSession failed:", error.code, error.message);
    return { error: GENERIC_ERROR };
  }

  console.error("createSession: public code collision on all attempts");
  return { error: GENERIC_ERROR };
}

export async function updateSession(id, prevState, formData) {
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };

  const { data, fieldErrors } = parseSessionPayload(formData);
  if (fieldErrors) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Status changes go through setSessionStatus only.
  const { status, ...values } = data;

  const supabase = await createClient();

  if (status === "live") {
    const { row, failed } = await findLiveSession(supabase, { excludeId: id });
    if (failed) return { error: GENERIC_ERROR };
    if (row) return { error: LIVE_CONFLICT_ERROR };
  }

  const { data: row, error } = await supabase
    .from("discussion_sessions")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error) && mentions(error, "discussion_sessions_one_live")) {
      return { error: LIVE_CONFLICT_ERROR };
    }
    console.error("updateSession failed:", error.code, error.message);
    return { error: GENERIC_ERROR };
  }
  if (!row) return { error: "That discussion no longer exists." };

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}`);
  return { ok: true, message: "Saved." };
}

export async function setSessionStatus(id, next) {
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };
  if (typeof next !== "string" || !(next in ALLOWED_TRANSITIONS)) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("discussion_sessions")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("setSessionStatus read failed:", readError.code, readError.message);
    return { error: GENERIC_ERROR };
  }
  if (!current) return { error: "That discussion no longer exists." };

  if (!ALLOWED_TRANSITIONS[current.status]?.includes(next)) {
    return {
      error: "That change is not available from the current status - refresh and try again.",
    };
  }

  if (next === "live") {
    const { row, failed } = await findLiveSession(supabase, { excludeId: id });
    if (failed) return { error: GENERIC_ERROR };
    if (row) return { error: LIVE_CONFLICT_ERROR };
  }

  // Conditional update: 0 rows means someone changed the status concurrently.
  // The partial unique index on live is the final guard for races the check
  // above cannot see. Closing only touches status; submissions are kept.
  const { data: row, error } = await supabase
    .from("discussion_sessions")
    .update({ status: next })
    .eq("id", id)
    .in("status", ALLOWED_TRANSITIONS[current.status])
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error) && mentions(error, "discussion_sessions_one_live")) {
      return { error: LIVE_CONFLICT_ERROR };
    }
    console.error("setSessionStatus failed:", error.code, error.message);
    return { error: GENERIC_ERROR };
  }
  if (!row) return { error: CONCURRENT_CHANGE_ERROR };

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}`);
  return { ok: true, status: next };
}
