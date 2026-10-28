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

  return (
    <div className="min-h-screen bg-midnight print:bg-white">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-gutter py-6 print:hidden">
        <p className="min-w-0 text-sm text-muted">
          Printable poster for{" "}
          <span className="font-display font-semibold text-ink">{session.title}</span>
        </p>
        <PrintButton />
      </div>
      <div className="px-gutter pb-16 print:px-0 print:pb-0">
        <PosterSheet
          title={session.title}
          qrDataUrl={qrDataUrl}
          sessionCode={session.public_code}
          joinUrl={joinUrl}
        />
      </div>
    </div>
  );
}
