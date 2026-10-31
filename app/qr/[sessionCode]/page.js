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

  const topic = session.topic?.trim() || session.title;

  const statusLine =
    session.status === "paused"
      ? "Submissions are paused"
      : session.status === "closed"
        ? "This conversation has wrapped"
        : null;

  return (
    <main className="qr-event-stage relative isolate flex min-h-screen min-w-0 items-center overflow-hidden bg-midnight px-4 py-10 text-center sm:px-gutter sm:py-12">
      <div
        aria-hidden="true"
        className="qr-ambient-light pointer-events-none absolute -inset-[18%] -z-20 bg-[radial-gradient(48%_42%_at_24%_20%,rgba(196,181,253,0.26),transparent_68%),radial-gradient(46%_42%_at_82%_78%,rgba(109,74,184,0.3),transparent_70%)] print:hidden"
      />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-left print:hidden" />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-right print:hidden" />
      <div aria-hidden="true" className="qr-event-grid pointer-events-none absolute inset-0 -z-10 print:hidden" />

      <section className="mx-auto grid w-full max-w-7xl min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(24rem,1.14fr)] lg:gap-14 xl:gap-20">
        <div className="flex min-w-0 flex-col items-center lg:items-start lg:text-left">
          <p className="qr-stage-reveal text-sm font-semibold uppercase tracking-[0.28em] text-gold/80">
            Live conversation
          </p>
          <p className="qr-stage-reveal qr-stage-reveal-delay-1 mt-3 font-display text-[clamp(3rem,9vw,6.5rem)] font-semibold leading-[0.86] tracking-[-0.045em] text-gold">
            Spill it
          </p>
          <h1 className="qr-stage-reveal qr-stage-reveal-delay-2 mt-5 max-w-3xl break-words text-balance font-display text-[clamp(1.8rem,4vw,3.35rem)] font-medium leading-[1.04] tracking-[-0.025em] text-ink">
            Scan to join the conversation
          </h1>
          <p className="qr-topic-reveal mt-5 max-w-2xl break-words text-balance text-[clamp(1.05rem,2vw,1.35rem)] font-medium leading-snug text-gold-light">
            {topic}
          </p>
          <p className="qr-stage-reveal qr-stage-reveal-delay-3 mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Scan the code, pick a nickname, and share your thoughts.
          </p>

          {statusLine ? (
            <p
              role="status"
              className={`qr-stage-reveal qr-stage-reveal-delay-3 mt-5 max-w-full rounded-pill px-4 py-1.5 text-sm font-medium sm:text-base ${
                session.status === "paused"
                  ? "bg-gold/15 text-gold"
                  : "bg-crimson/15 text-crimson-bright"
              }`}
            >
              {statusLine}
            </p>
          ) : null}

          <div className="qr-stage-reveal qr-stage-reveal-delay-3 mt-6 w-full sm:w-auto print:hidden">
            <PrintButton />
          </div>
        </div>

        <div className="qr-card-shell relative mx-auto w-full max-w-[35rem] min-w-0 p-3 sm:p-5">
          <div aria-hidden="true" className="qr-orbit qr-orbit-one print:hidden" />
          <div aria-hidden="true" className="qr-orbit qr-orbit-two print:hidden" />
          <div className="qr-premium-frame relative rounded-[2.4rem] border border-white/15 bg-gradient-to-br from-white/15 via-gold/10 to-gold-deep/25 p-2 shadow-[0_38px_110px_-42px_rgba(167,139,250,0.9)] sm:p-3">
            <div className="rounded-[1.9rem] border border-white/10 bg-[#160D2B]/95 p-4 shadow-inner sm:p-6">
              <div className="qr-static-code flex w-full items-center justify-center rounded-[1.45rem] bg-white p-3 shadow-[0_22px_60px_-28px_rgba(0,0,0,0.92)] sm:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
                <img
                  src={qrDataUrl}
                  alt={`QR code to join ${topic} at ${joinUrl}`}
                  className="h-auto w-full max-w-[27rem] bg-white [image-rendering:auto]"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-white/55 sm:text-sm">
                <span>Session {session.public_code}</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold/65" />
                <span>Anonymous by design</span>
              </div>
            </div>
          </div>
          <p className="mt-4 max-w-full select-all break-all text-center text-[0.68rem] leading-relaxed text-white/40 sm:text-xs">
            {joinUrl}
          </p>
        </div>
      </section>
    </main>
  );
}
