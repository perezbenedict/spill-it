import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import { buildJoinUrl, generateQrDataUrl } from "@/lib/qr";
import { isValidPublicCode } from "@/lib/session-code";
import { createClient } from "@/lib/supabase/server";

async function getSession(sessionCode) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("published_sessions_by_code")
    .select("public_code, title, status")
    .eq("public_code", sessionCode.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  // RLS hides drafts; the extra check keeps the guarantee explicit.
  if (!data || data.status === "draft") return null;
  return data;
}

export async function generateMetadata({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) return { title: "SPILL" };
  try {
    const session = await getSession(sessionCode);
    return { title: session ? `${session.title} - SPILL` : "SPILL" };
  } catch {
    return { title: "SPILL" };
  }
}

export default async function QrProjectorPage({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) notFound();

  let session;
  let joinUrl;
  let qrDataUrl;
  try {
    session = await getSession(sessionCode);
    joinUrl = buildJoinUrl(sessionCode.toUpperCase());
    qrDataUrl = await generateQrDataUrl(joinUrl);
  } catch (error) {
    // Config errors from lib/config start with the variable name but never echo values.
    const isConfigError = /^NEXT_PUBLIC_[A-Z_]+ /.test(error?.message ?? "");
    if (!isConfigError) throw error;
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream px-gutter">
        <div className="w-full max-w-md">
          <ErrorState
            title="Site URL not configured"
            description={`Set NEXT_PUBLIC_SITE_URL (see .env.example) so join links and QR codes point at the real site.${
              error?.message ? ` Details: ${error.message}` : ""
            }`}
          />
        </div>
      </main>
    );
  }
  if (!session) notFound();

  const statusLine =
    session.status === "paused"
      ? "Submissions are paused"
      : session.status === "closed"
        ? "This conversation has wrapped"
        : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-ink px-gutter py-12 text-center">
      <header className="flex flex-col items-center gap-2">
        <p className="font-display text-3xl font-bold tracking-tight text-lime sm:text-4xl">
          SPILL
        </p>
        <h1 className="text-balance font-display text-2xl font-semibold text-cream sm:text-4xl">
          {session.title}
        </h1>
      </header>

      <div className="rounded-card bg-white p-4 shadow-lg sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
        <img
          src={qrDataUrl}
          alt={`QR code to join ${session.title} at ${joinUrl}`}
          className="h-auto w-[min(72vmin,28rem)]"
        />
      </div>

      <p className="font-display text-lg font-medium text-cream sm:text-2xl">
        Scan to join the conversation
      </p>

      {statusLine ? (
        <p
          role="status"
          className="rounded-pill bg-coral/15 px-4 py-1.5 text-sm font-medium text-coral sm:text-base"
        >
          {statusLine}
        </p>
      ) : null}

      <p className="select-all break-all text-xs text-neutral-400 sm:text-sm">
        {joinUrl}
      </p>
    </main>
  );
}
