function requireValue(name, value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error(
      `${name} is missing or empty. Set it in your environment (see .env.example).`
    );
  }
  return trimmed;
}

function requireHttpUrl(name, value) {
  const trimmed = requireValue(name, value);
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be an http(s) URL.`);
  }
  return trimmed;
}

// Validates environment variables. Throws with the variable name but never echoes values.
// SUPABASE_SERVICE_ROLE_KEY is only checked server-side; it must never reach the browser.
export function readEnv() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: requireHttpUrl(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: requireValue(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
    NEXT_PUBLIC_SITE_URL: requireHttpUrl(
      "NEXT_PUBLIC_SITE_URL",
      process.env.NEXT_PUBLIC_SITE_URL
    ),
  };

  if (typeof window === "undefined") {
    env.SUPABASE_SERVICE_ROLE_KEY = requireValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return env;
}

// Used later for QR generation; always a normalized absolute URL.
export function getSiteUrl() {
  return readEnv().NEXT_PUBLIC_SITE_URL;
}
