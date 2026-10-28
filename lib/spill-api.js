import "server-only";
import { readEnv } from "@/lib/config";

// Small fetch client for the SPILL Cloudflare Worker (see api/worker.js).
// Every helper returns { ok, status, body } and never throws on HTTP errors;
// a network failure comes back as { ok: false, status: 0, body: null }.

async function request(path, { method = "GET", body, adminToken } = {}) {
  const env = readEnv();
  const headers = { Authorization: `Bearer ${env.SPILL_API_SECRET}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (adminToken) headers["X-Admin-Token"] = adminToken;

  let response;
  try {
    response = await fetch(env.SPILL_API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, body: null };
  }

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

/* ---------- public (participant) ---------- */

export function getPublicSession(code) {
  return request(`/sessions?code=${encodeURIComponent(code)}`);
}

// Resolve the discussion that is live right now, so participants can join
// straight from a link or QR without ever typing a session code.
export function getLiveSession() {
  return request("/live");
}

export function getRoom(code) {
  return request(`/rooms?code=${encodeURIComponent(code)}`);
}

export function createParticipantSubmission({
  sessionCode,
  participantId,
  category,
  nickname,
  content,
}) {
  return request("/submissions", {
    method: "POST",
    body: { sessionCode, participant_id: participantId, category, nickname, content },
  });
}

/* ---------- admin: auth ---------- */

export function adminLogin(password) {
  return request("/admin/auth/login", { method: "POST", body: { password } });
}

export function adminLogout(adminToken) {
  return request("/admin/auth/logout", { method: "POST", adminToken });
}

export function adminMe(adminToken) {
  return request("/admin/auth/me", { adminToken });
}

/* ---------- admin: sessions ---------- */

export function listAdminSessions(adminToken, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return request(`/admin/sessions${qs ? `?${qs}` : ""}`, { adminToken });
}

export function getAdminSession(adminToken, id) {
  return request(`/admin/sessions/${encodeURIComponent(id)}`, { adminToken });
}

export function createAdminSession(adminToken, payload) {
  return request("/admin/sessions", { method: "POST", adminToken, body: payload });
}

export function updateAdminSession(adminToken, id, payload) {
  return request(`/admin/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    adminToken,
    body: payload,
  });
}

export function setAdminSessionStatus(adminToken, id, status) {
  return request(`/admin/sessions/${encodeURIComponent(id)}/status`, {
    method: "POST",
    adminToken,
    body: { status },
  });
}

export function deleteAdminSession(adminToken, id) {
  return request(`/admin/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    adminToken,
  });
}

/* ---------- admin: submissions ---------- */

export function listAdminSubmissions(adminToken, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return request(`/admin/submissions${qs ? `?${qs}` : ""}`, { adminToken });
}

export function getAdminSubmission(adminToken, id) {
  return request(`/admin/submissions/${encodeURIComponent(id)}`, { adminToken });
}

export function patchAdminSubmission(adminToken, id, patch) {
  return request(`/admin/submissions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    adminToken,
    body: patch,
  });
}

export function deleteAdminSubmission(adminToken, id) {
  return request(`/admin/submissions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    adminToken,
  });
}

/* ---------- admin: presentation pointer ---------- */

export function getPresentation(adminToken, sessionId) {
  return request(`/admin/presentation/${encodeURIComponent(sessionId)}`, { adminToken });
}

export function setPresentation(adminToken, sessionId, currentSubmissionId) {
  return request(`/admin/presentation/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    adminToken,
    body: { current_submission_id: currentSubmissionId ?? null },
  });
}
