import { notFound } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import PosterSheet from "@/components/qr/PosterSheet";
import PrintButton from "@/components/qr/PrintButton";
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
  if (!isValidPublicCode(sessionCode)) return { title: "SPILL poster" };
  try {
    const session = await getSession(sessionCode);
    return { title: session ? `${session.title} - SPILL poster` : "SPILL poster" };
  } catch {
    return { title: "SPILL poster" };
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
    // Config errors from lib/config start with the variable name but never echo values.
    const isConfigError = /^NEXT_PUBLIC_[A-Z_]+ /.test(error?.message ?? "");
    if (!isConfigError) throw error;
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream px-gutter print:bg-white">
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
    <div className="min-h-screen bg-cream print:bg-white">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-gutter py-6 print:hidden">
        <p className="text-sm text-muted">Printable poster for {session.title}</p>
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
