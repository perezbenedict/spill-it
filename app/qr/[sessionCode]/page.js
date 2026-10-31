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
    <main className="relative isolate flex min-h-screen min-w-0 flex-col items-center justify-center gap-6 overflow-hidden bg-midnight px-4 py-10 text-center sm:gap-8 sm:px-gutter sm:py-12">
      <div
        aria-hidden="true"
        className="qr-ambient-light pointer-events-none absolute -inset-[18%] -z-10 bg-[radial-gradient(50%_45%_at_28%_25%,rgba(167,139,250,0.22),transparent_70%),radial-gradient(45%_40%_at_78%_72%,rgba(109,74,184,0.2),transparent_72%)] print:hidden"
      />
      <header className="qr-stage-reveal flex w-full max-w-5xl min-w-0 flex-col items-center gap-2">
        <p className="font-display text-[clamp(1.75rem,7vw,2.5rem)] font-bold tracking-tight text-gold">
          Spill It
        </p>
        <h1 className="max-w-full break-words text-balance font-display text-[clamp(1.5rem,5vw,2.5rem)] font-semibold leading-tight text-ink">
          {session.title}
        </h1>
      </header>

      <div className="qr-premium-frame qr-stage-reveal qr-stage-reveal-delay-1 w-full max-w-[30rem] rounded-card bg-gradient-to-br from-gold/30 via-white/10 to-gold-deep/25 p-px">
        <div className="flex w-full items-center justify-center rounded-[calc(2rem-1px)] bg-white p-3 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
          <img
            src={qrDataUrl}
            alt={`QR code to join ${session.title} at ${joinUrl}`}
            className="h-auto w-full max-w-[25rem] bg-white [image-rendering:auto]"
          />
        </div>
      </div>

      <p className="qr-stage-reveal qr-stage-reveal-delay-2 text-[clamp(1.1rem,4vw,1.5rem)] font-medium leading-snug text-ink">
        Scan to join the conversation
      </p>

      {statusLine ? (
        <p
          role="status"
          className={`qr-stage-reveal qr-stage-reveal-delay-2 max-w-full rounded-pill px-4 py-1.5 text-sm font-medium sm:text-base ${
            session.status === "paused"
              ? "bg-gold/15 text-gold"
              : "bg-crimson/15 text-crimson-bright"
          }`}
        >
          {statusLine}
        </p>
      ) : null}

      <div className="qr-stage-reveal qr-stage-reveal-delay-2 w-full sm:w-auto print:hidden">
        <PrintButton />
      </div>

      <p className="qr-stage-reveal qr-stage-reveal-delay-2 max-w-2xl select-all break-all text-xs leading-relaxed text-muted sm:text-sm">
        {joinUrl}
      </p>
    </main>
  );
}
