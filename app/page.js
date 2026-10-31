import AnimatedBackground from "@/components/background/AnimatedBackground";
import HomePageContent from "@/components/HomePageContent";
import { getLiveSession, getPublicSession } from "@/lib/spill-api";
import { isValidPublicCode } from "@/lib/session-code";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

// Resolve the session to hand the homepage. A `?session=CODE` query param
// (from a QR code) takes priority when it is valid and available; otherwise we
// fall back to the live session. We never invent or hardcode a default.
// Returns { session, provided }:
//  - session: the session object to hand the homepage (or null)
//  - provided: true when a QR `?session=CODE` was supplied (so an invalid/closed
//    code renders a friendly state instead of silently joining the live session)
async function resolveSession(searchParams) {
  const code = typeof searchParams?.session === "string" ? searchParams.session : null;

  if (code) {
    if (isValidPublicCode(code)) {
      try {
        const result = await getPublicSession(code);
        const session = result.body?.session ?? null;
        // A valid, non-draft session is honored.
        if (session && session.status !== "draft") return { session, provided: true };
      } catch {
        // fall through to the friendly-unavailable state
      }
    }
    // A code was provided but is invalid or unavailable: do not join anything.
    return { session: null, provided: true };
  }

  // No code: preserve existing behavior (fall back to the live session).
  try {
    const result = await getLiveSession();
    if (result.ok) return { session: result.body?.session ?? null, provided: false };
  } catch {
    // fall through to null
  }

  return { session: null, provided: false };
}

export default function HomePage({ searchParams }) {
  return (
    <Suspense>
      <HomePageContentAsync searchParams={searchParams} />
    </Suspense>
  );
}

async function HomePageContentAsync({ searchParams }) {
  const { session, provided } = await resolveSession(searchParams);
  return (
    <AnimatedBackground>
      <HomePageContent session={session} provided={provided} />
    </AnimatedBackground>
  );
}
