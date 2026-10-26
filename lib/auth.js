import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Returns { user, role } for a signed-in user with an admin_profiles row,
// or null when unauthenticated or not provisioned as admin.
export async function getAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return { user, role: profile.role };
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
