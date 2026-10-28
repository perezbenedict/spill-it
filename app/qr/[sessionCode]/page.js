import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import PrintButton from "@/components/qr/PrintButton";
import { buildJoinUrl, generateQrDataUrl } from "@/lib/qr";
import { isValidPublicCode } from "@/lib/session-code";
import { getPublicSession } from "@/lib/spill-api";

async function getSession(sessionCode) {
  const result = await getPublicSession(sessionCode.toUpperCase());
  if (result.status === 0 || !result.ok) {
    if (result.status === 404) return null;
    throw new Error("session lookup failed");
  }
  return result.body.session ?? null;
}

export async function generateMetadata({ params }) {
  const { sessionCode } = await params;
  if (!isValidPublicCode(sessionCode)) return { title: "Spill It" };
  try {
    const session = await getSession(sessionCode);
    return { title: session ? `${session.title} - Spill It` : "Spill It" };
  } catch {
    return { title: "Spill It" };
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
    const isConfigError = /^NEXT_PUBLIC_[A-Z_]+ /.test(error?.message ?? "");
    if (!isConfigError) throw error;
    return (
      <main className="flex min-h-screen items-center justify-center bg-midnight px-gutter">
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-midnight px-gutter py-12 text-center">
      <header className="flex flex-col items-center gap-2">
        <p className="font-display text-3xl font-bold tracking-tight text-gold sm:text-4xl">
          Spill It
        </p>
        <h1 className="text-balance font-display text-2xl font-semibold text-ink sm:text-4xl">
          {session.title}
        </h1>
      </header>

      <div className="rounded-card bg-surface p-4 shadow-lg sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
        <img
          src={qrDataUrl}
          alt={`QR code to join ${session.title} at ${joinUrl}`}
          className="h-auto w-[min(72vmin,28rem)]"
        />
      </div>

      <p className="text-lg font-medium text-ink sm:text-2xl">
        Scan to join the conversation
      </p>

      {statusLine ? (
        <p
          role="status"
          className={`rounded-pill px-4 py-1.5 text-sm font-medium sm:text-base ${
            session.status === "paused"
              ? "bg-gold/15 text-gold"
              : "bg-crimson/15 text-crimson-bright"
          }`}
        >
          {statusLine}
        </p>
      ) : null}

      <div className="print:hidden">
        <PrintButton />
      </div>

      <p className="select-all break-all text-xs text-muted sm:text-sm">
        {joinUrl}
      </p>
    </main>
  );
}
