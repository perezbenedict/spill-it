"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, getAdminToken } from "@/lib/auth";
import {
  createAdminSession,
  bulkDeleteAdminSessions,
  deleteAdminSession,
  setAdminSessionStatus,
  reopenAdminSession,
  updateAdminSession,
  getAdminSession,
} from "@/lib/spill-api";
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
const NOT_FOUND_ERROR = "That discussion no longer exists.";
const DELETE_ERROR = "Could not delete this discussion. Please try again.";
const BULK_DELETE_LIMIT = 50;

// Closed can be reopened with an explicit Reopen action (closed -> live).
const ALLOWED_TRANSITIONS = {
  draft: ["live"],
  live: ["paused", "closed"],
  paused: ["live", "closed"],
  closed: ["live"],
};

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
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
// out separately, clamped and stored as JSON in the configuration column.
function parseSessionPayload(formData) {
  const parsed = sessionSchema.safeParse({
    title: formData.get("title") ?? "",
    topic: formData.get("topic") ?? "",
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
  if (!parsed.data.topic) {
    return { fieldErrors: { topic: "Add the topic participants will discuss." } };
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

  const publicCode = formData.get("public_code");
  if (configuration.min_content_length > configuration.max_content_length) {
    configuration.max_content_length = configuration.min_content_length;
  }

  const { opens_at, closes_at, ...rest } = parsed.data;
  return {
    data: {
      ...rest,
      public_code: publicCode || undefined,
      // Explicit nulls so clearing a date input clears the column.
      opens_at: opens_at ? opens_at.toISOString() : null,
      closes_at: closes_at ? closes_at.toISOString() : null,
      configuration,
    },
  };
}

// Maps worker error bodies onto the action-facing copy the UI expects.
function errorFromBody(result, fallback) {
  const code = result.body?.code;
  if (code === "live_conflict") return LIVE_CONFLICT_ERROR;
  if (code === "concurrent_change") return CONCURRENT_CHANGE_ERROR;
  if (code === "duplicate_code") return "That join code is already in use. Pick another.";
  if (result.status === 404) return NOT_FOUND_ERROR;
  return fallback;
}

export async function createSession(prevState, formData) {
  await requireAdmin();

  const { data, fieldErrors } = parseSessionPayload(formData);
  if (fieldErrors) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { status, ...values } = data;
  const adminToken = await getAdminToken();

  // The worker enforces the single-live rule (and retries public-code
  // collisions) atomically before inserting.
  const result = await createAdminSession(adminToken, {
    ...values,
    status: status === "live" ? "live" : "draft",
  });

  if (!result.ok || !result.body?.session?.id) {
    console.error("createSession failed:", result.status);
    return { error: errorFromBody(result, GENERIC_ERROR) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  redirect(`/admin/sessions/${result.body.session.id}`);
}

export async function updateSession(id, prevState, formData) {
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };

  const { data, fieldErrors } = parseSessionPayload(formData);
  if (fieldErrors) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Status changes go through setSessionStatus only.
  const values = { ...data, expectedRevision: Number(formData.get("expectedRevision")) };
  delete values.status;
  const adminToken = await getAdminToken();

  const result = await updateAdminSession(adminToken, id, values);

  if (!result.ok) {
    console.error("updateSession failed:", result.status);
    return { error: errorFromBody(result, GENERIC_ERROR) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}`);
  return { ok: true, message: "Saved.", revision: result.body?.session?.revision };
}

export async function setSessionStatus(id, next) {
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };
  if (typeof next !== "string" || !(next in ALLOWED_TRANSITIONS)) {
    return { error: GENERIC_ERROR };
  }

  const adminToken = await getAdminToken();
  const result = await setAdminSessionStatus(adminToken, id, next);

  if (!result.ok) {
    console.error("setSessionStatus failed:", result.status);
    return { error: errorFromBody(result, GENERIC_ERROR) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}`);
  return { ok: true, status: next };
}

export async function reopenSession(id) {
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };

  const adminToken = await getAdminToken();
  const result = await reopenAdminSession(adminToken, id);

  if (!result.ok) {
    console.error("reopenSession failed:", result.status);
    return { error: errorFromBody(result, GENERIC_ERROR) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  revalidatePath(`/admin/sessions/${id}`);
  return { ok: true, status: "live" };
}

export async function regeneratePublicCode(id) {
  "use server";
  await requireAdmin();
  if (!isUuid(id)) return { error: GENERIC_ERROR };

  const adminToken = await getAdminToken();
  const current = await getAdminSession(adminToken, id);
  if (!current.ok) return { error: GENERIC_ERROR };
  let newCode;
  for (let attempts = 5; attempts > 0; attempts -= 1) {
    newCode = generatePublicCode();
    // Check uniqueness. The PATCH handler enforces this server-side too, but we
    // pre-check here to avoid clobbering a shared code unnecessarily.
    const result = await updateAdminSession(adminToken, id, { public_code: newCode, expectedRevision: current.body.session.revision });
    if (result.ok) {
      revalidatePath("/admin");
      revalidatePath("/admin/sessions");
      revalidatePath(`/admin/sessions/${id}`);
      return { ok: true, public_code: newCode };
    }
    if (result.body?.code === "duplicate_code") continue;
    return { error: errorFromBody(result, GENERIC_ERROR) };
  }
  return { error: "Could not generate a unique join code. Please try again." };
}

export async function deleteSession(id, payload) {
  await requireAdmin();
  if (!isUuid(id)) return { error: DELETE_ERROR };

  const password = typeof payload?.password === "string" ? payload.password : "";
  const confirmText =
    typeof payload?.confirm_text === "string" ? payload.confirm_text.trim() : "";

  if (!password) return { error: "Admin password is required." };
  if (confirmText !== "DELETE") return { error: "Type DELETE to confirm." };

  const adminToken = await getAdminToken();
  const result = await deleteAdminSession(adminToken, id, {
    password,
    confirm_text: confirmText,
  });

  if (!result.ok) {
    console.error("deleteSession failed:", result.status);
    return {
      error: result.body?.error || errorFromBody(result, DELETE_ERROR),
      code: result.body?.code,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  return { ok: true };
}

export async function bulkDeleteSessions(payload) {
  await requireAdmin();

  const rawIds = Array.isArray(payload?.session_ids) ? payload.session_ids : [];
  const sessionIds = [...new Set(rawIds.filter((id) => typeof id === "string"))];
  const password = typeof payload?.password === "string" ? payload.password : "";
  const confirmText =
    typeof payload?.confirm_text === "string" ? payload.confirm_text.trim() : "";

  if (
    sessionIds.length === 0 ||
    sessionIds.length > BULK_DELETE_LIMIT ||
    sessionIds.some((id) => !isUuid(id))
  ) {
    return { error: "Select valid discussions and try again." };
  }
  if (!password) return { error: "Admin password is required." };
  if (confirmText !== "DELETE") return { error: "Type DELETE to confirm." };

  const adminToken = await getAdminToken();
  const result = await bulkDeleteAdminSessions(adminToken, {
    session_ids: sessionIds,
    password,
    confirm_text: confirmText,
  });

  if (!result.ok) {
    console.error("bulkDeleteSessions failed:", result.status);
    return {
      error: result.body?.error || "Could not delete the selected discussions. Please try again.",
      code: result.body?.code,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sessions");
  return {
    ok: true,
    deleted: Array.isArray(result.body?.deleted_ids) ? result.body.deleted_ids : sessionIds,
  };
}
