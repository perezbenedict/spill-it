import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminMe } from "@/lib/spill-api";

// Admin session token cookie: httpOnly so client JS can never read it. The
// worker stores the token (and its expiry) in admin_sessions; this cookie
// only forwards it.
export const ADMIN_SESSION_COOKIE = "spill_admin_session";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // matches the worker's 7-day token

function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  };
}

export async function getAdminToken() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_SESSION_COOKIE)?.value || null;
}

// Only callable from Server Actions / Route Handlers.
export async function setAdminSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, adminCookieOptions());
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
}

// Returns { user, role } for a signed-in admin with a live session token,
// or null when unauthenticated, expired or not provisioned as admin.
export async function getAdminContext() {
  const token = await getAdminToken();
  if (!token) return null;

  const result = await adminMe(token);
  if (!result.ok || !result.body?.user) return null;

  return { user: result.body.user, role: result.body.user.role };
}

// For guarded Server Components/pages: redirect to login when not admin.
export async function requireAdmin() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  return context;
}

// For Server Actions/route handlers that answer with JSON: null instead of redirect.
export async function requireAdminApi() {
  return getAdminContext();
}
