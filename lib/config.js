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
// SPILL_API_SECRET is only checked server-side; it must never reach the browser.
export function readEnv() {
  const env = {
    NEXT_PUBLIC_SITE_URL: requireHttpUrl(
      "NEXT_PUBLIC_SITE_URL",
      process.env.NEXT_PUBLIC_SITE_URL
    ),
  };

  if (typeof window === "undefined") {
    env.SPILL_API_URL = requireHttpUrl("SPILL_API_URL", process.env.SPILL_API_URL);
    env.SPILL_API_SECRET = requireValue(
      "SPILL_API_SECRET",
      process.env.SPILL_API_SECRET
    );
  }

  return env;
}

// Used later for QR generation; always a normalized absolute URL.
export function getSiteUrl() {
  return readEnv().NEXT_PUBLIC_SITE_URL;
}
