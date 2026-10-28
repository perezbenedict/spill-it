"use server";

import { redirect } from "next/navigation";
import {
  clearAdminSessionCookie,
  getAdminToken,
  setAdminSessionCookie,
} from "@/lib/auth";
import { adminLogin, adminLogout } from "@/lib/spill-api";
import { loginSchema } from "@/lib/validation";

// Generic errors only: never echo worker messages/codes or say which
// field was wrong.
export async function login(prevState, formData) {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter the admin password." };
  }

  const result = await adminLogin(parsed.data.password);

  if (!result.ok) {
    if (result.status === 401) {
      return { error: "Incorrect password." };
    }
    if (result.status === 429) {
      return { error: "Too many attempts. Try again shortly." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  await setAdminSessionCookie(result.body.token);
  redirect("/admin");
}

export async function logout() {
  const token = await getAdminToken();
  if (token) {
    try {
      await adminLogout(token);
    } catch {
      // Best effort; the cookie is cleared regardless.
    }
  }
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
