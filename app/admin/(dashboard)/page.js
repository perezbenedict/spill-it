import Link from "next/link";
import {
  ExternalLink,
  MessageSquare,
  MonitorPlay,
  Plus,
  QrCode,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/admin/sessions/StatusBadge";
import SummaryCards from "@/components/admin/dashboard/SummaryCards";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";

const quickLinkClass =
  "inline-flex items-center gap-2 rounded-control bg-ink px-5 py-3 text-sm font-medium text-cream transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple";

async function countSubmissions(supabase, sessionId, filter = {}) {
  let query = supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  for (const [column, value] of Object.entries(filter)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`count ${JSON.stringify(filter)} failed:`, error.code, error.message);
    return 0;
  }
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: liveSession, error: liveError } = await supabase
    .from("discussion_sessions")
    .select("*")
    .eq("status", "live")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (liveError) {
    console.error("dashboard live lookup failed:", liveError.code, liveError.message);
  }

  let session = liveSession;
  if (!session) {
    const { data, error } = await supabase
      .from("discussion_sessions")
      .select("*")
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("dashboard recent lookup failed:", error.code, error.message);
    }
    session = data;
  }

  const { count: sessionCount, error: sessionCountError } = await supabase
    .from("discussion_sessions")
    .select("id", { count: "exact", head: true });
  if (sessionCountError) {
    console.error(
      "dashboard session count failed:",
      sessionCountError.code,
      sessionCountError.message
    );
  }

  if (!session && !sessionCount) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Dashboard</h1>
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="No discussions yet"
          description="Create a discussion, share the join code and watch the room spill in real time."
        >
          <Link href="/admin/sessions/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first discussion
            </Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (!session) {
    // Sessions exist but none have been published yet.
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Dashboard</h1>
        <EmptyState
          icon={<Settings className="h-10 w-10" />}
          title="Nothing published yet"
          description="Your discussions are still drafts. Publish one to start collecting submissions."
        >
          <Link href="/admin/sessions">
            <Button>Go to sessions</Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  const [total, question, opinion, challenge, pending] = await Promise.all([
    countSubmissions(supabase, session.id),
    countSubmissions(supabase, session.id, { category: "question" }),
    countSubmissions(supabase, session.id, { category: "opinion" }),
    countSubmissions(supabase, session.id, { category: "challenge" }),
    countSubmissions(supabase, session.id, { moderation_status: "pending" }),
  ]);

  const { data: recent, error: recentError } = await supabase
    .from("submissions")
    .select("id, nickname, category, moderation_status, created_at, content")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentError) {
    console.error("dashboard recent submissions failed:", recentError.code, recentError.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Dashboard</h1>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">{session.title}</h2>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-sm text-muted">
            Join code: <span className="font-mono font-semibold text-ink">{session.public_code}</span>
          </p>
        </Card>
      </div>

      <SummaryCards
        total={total}
        question={question}
        opinion={opinion}
        challenge={challenge}
        pending={pending}
      />

      <nav aria-label="Quick actions" className="flex flex-wrap gap-3">
        <Link href={`/admin/sessions/${session.id}`} className={quickLinkClass}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Manage discussion
        </Link>
        {session.status !== "draft" ? (
          <>
            <Link href={`/admin/sessions/${session.id}/live`} className={quickLinkClass}>
              <MonitorPlay className="h-4 w-4" aria-hidden="true" />
              Live moderation
            </Link>
            <Link href={`/room/${session.public_code}`} className={quickLinkClass}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Presentation room
            </Link>
          </>
        ) : null}
        <Link href={`/join/${session.public_code}`} className={quickLinkClass}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Participant view
        </Link>
      </nav>

      {total === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="Nothing has spilled yet"
          description="Once participants join and post, their submissions appear here live."
        />
      ) : (
        <RecentActivity sessionId={session.id} initialItems={recent ?? []} />
      )}
    </div>
  );
}
