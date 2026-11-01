import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import QRFullscreenStage from "@/components/qr/QRFullscreenStage";
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

  return (
    <QRFullscreenStage
      topic={topic}
      status={session.status}
      publicCode={session.public_code}
      joinUrl={joinUrl}
      qrDataUrl={qrDataUrl}
    />
  );
}
