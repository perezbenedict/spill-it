import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MonitorPlay, QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/admin/sessions/StatusBadge";
import SessionForm from "@/components/admin/sessions/SessionForm";
import StatusControls from "@/components/admin/sessions/StatusControls";
import QrPanel from "@/components/admin/sessions/QrPanel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const linkClass =
  "inline-flex items-center gap-2 rounded-control bg-ink px-5 py-3 text-sm font-medium text-cream transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple";

export default async function SessionDetailPage({ params }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("discussion_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("session lookup failed:", error.code, error.message);
  }
  if (!session) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/sessions"
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Back to sessions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            {session.title}
          </h1>
          <StatusBadge status={session.status} />
        </div>
        <p className="text-sm text-muted">
          Join code:{" "}
          <span className="font-mono text-base font-semibold text-ink">
            {session.public_code}
          </span>
        </p>
      </div>

      <StatusControls sessionId={session.id} status={session.status} />

      <section aria-labelledby="session-details-heading" className="flex flex-col gap-4">
        <h2 id="session-details-heading" className="font-display text-lg font-semibold text-ink">
          Details
        </h2>
        <SessionForm mode="edit" session={session} />
      </section>

      <QrPanel publicCode={session.public_code} />

      {session.status !== "draft" ? (
        <nav aria-label="Session links" className="flex flex-wrap gap-3">
          <Link href={`/admin/sessions/${session.id}/live`} className={linkClass}>
            <MonitorPlay className="h-4 w-4" aria-hidden="true" />
            Live moderation
          </Link>
          <Link href={`/room/${session.public_code}`} className={linkClass}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Presentation room
          </Link>
          <Link href={`/join/${session.public_code}`} className={linkClass}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Participant view
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
