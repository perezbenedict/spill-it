import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import PosterSheet from "@/components/qr/PosterSheet";
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
  if (!isValidPublicCode(sessionCode)) return { title: "Spill It poster" };
  try {
    const session = await getSession(sessionCode);
    return { title: session ? `${session.title} - Spill It poster` : "Spill It poster" };
  } catch {
    return { title: "Spill It poster" };
  }
}

export default async function PosterPage({ params }) {
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
      <main className="flex min-h-screen items-center justify-center bg-midnight px-gutter print:bg-white">
        <div className="w-full max-w-md print:hidden">
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

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-br from-[#160D2B] via-[#24113F] to-[#6D4AB8] print:overflow-visible print:bg-white">
      <div
        aria-hidden="true"
        className="qr-ambient-light pointer-events-none absolute -inset-[18%] -z-10 bg-[radial-gradient(50%_45%_at_25%_20%,rgba(196,181,253,0.18),transparent_70%),radial-gradient(45%_42%_at_80%_78%,rgba(109,74,184,0.24),transparent_72%)] print:hidden"
      />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-left print:hidden" />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-right print:hidden" />
      <div aria-hidden="true" className="qr-event-grid pointer-events-none absolute inset-0 -z-10 print:hidden" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-gutter print:hidden">
        <p className="min-w-0 break-words text-sm leading-relaxed text-muted">
          Printable poster for{" "}
          <span className="font-display font-semibold text-ink">{topic}</span>
        </p>
        <PrintButton className="w-full shrink-0 sm:w-auto" />
      </div>
      <div className="px-4 pb-16 sm:px-gutter print:px-0 print:pb-0">
        <PosterSheet
          title={topic}
          qrDataUrl={qrDataUrl}
          sessionCode={session.public_code}
          joinUrl={joinUrl}
        />
      </div>
    </div>
  );
}
