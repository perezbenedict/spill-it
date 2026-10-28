import Link from "next/link";
import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import JoinExperience from "@/components/participant/JoinExperience";
import { isValidPublicCode } from "@/lib/session-code";
import { getPublicSession } from "@/lib/spill-api";

export const dynamic = "force-dynamic";

async function fetchSession(code) {
  const result = await getPublicSession(code);
  if (result.status === 0 || !result.ok) {
    console.error("[join] session lookup failed:", result.status);
    return { queryError: true };
  }
  return { session: result.body.session ?? null };
}

function normalizeCode(params) {
  return String(params?.sessionCode ?? "").trim().toUpperCase();
}

export async function generateMetadata({ params }) {
  const code = normalizeCode(await params);
  if (!isValidPublicCode(code)) return { title: "Spill It" };
  const { session } = await fetchSession(code);
  return { title: session ? `${session.title} · Spill It` : "Spill It" };
}

function PageShell({ children }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-gutter py-section">
      {children}
    </main>
  );
}

export default async function JoinPage({ params }) {
  const code = normalizeCode(await params);
  if (!isValidPublicCode(code)) notFound();

  const { session, queryError } = await fetchSession(code);
  if (queryError) {
    return (
      <PageShell>
        <ErrorState
          title="We could not load this discussion"
          description="That is on us, not you. Try reloading the page."
          retry={
            <Link href={`/join/${code}`} className="font-medium text-gold underline-offset-4 hover:underline">
              Try again
            </Link>
          }
        />
      </PageShell>
    );
  }
  if (!session || session.status === "draft") notFound();

  // Live, paused and closed sessions all render JoinExperience, which shows the
  // topic plus an honest notice for the non-live states.
  return (
    <main className="mx-auto w-full max-w-lg px-gutter py-section">
      <JoinExperience
        session={{
          code: session.public_code,
          status: session.status,
          title: session.title,
          description: session.description,
          welcome_message: session.welcome_message,
          available_categories: session.available_categories,
          configuration: session.configuration,
        }}
      />
    </main>
  );
}
