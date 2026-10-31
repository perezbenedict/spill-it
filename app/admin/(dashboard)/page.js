import Link from "next/link";
import {
  ExternalLink,
  MessageSquare,
  Monitor,
  MonitorPlay,
  Plus,
  QrCode,
  Settings,
} from "lucide-react";
import { getAdminToken } from "@/lib/auth";
import { listAdminSessions, listAdminSubmissions } from "@/lib/spill-api";
import { buildJoinUrl } from "@/lib/qr";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/admin/sessions/StatusBadge";
import StatusControls from "@/components/admin/sessions/StatusControls";
import CopyJoinLink from "@/components/admin/dashboard/CopyJoinLink";
import PendingQueue from "@/components/admin/dashboard/PendingQueue";
import SummaryCards from "@/components/admin/dashboard/SummaryCards";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";

const quickLinkClass =
  "inline-flex items-center gap-2 rounded-control bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const STATUS_NOTICES = {
  live: "This room is open and collecting submissions.",
  paused: "Submissions are paused. Resume when the room is ready.",
  closed: "This discussion is closed. Everything already contributed is kept.",
  draft: "This discussion is still a draft. Publish it to open the room.",
};

const PENDING_PREVIEW = 5;

export default async function AdminDashboardPage() {
  const adminToken = await getAdminToken();

  const liveResult = await listAdminSessions(adminToken, { status: "live", limit: 1 });
  if (!liveResult.ok) {
    console.error("dashboard live lookup failed:", liveResult.status);
  }
  let session = liveResult.body?.items?.[0] ?? null;

  if (!session) {
    const recentResult = await listAdminSessions(adminToken, { published: 1, limit: 1 });
    if (!recentResult.ok) {
      console.error("dashboard recent lookup failed:", recentResult.status);
    }
    session = recentResult.body?.items?.[0] ?? null;
  }

  const countResult = await listAdminSessions(adminToken, { limit: 1 });
  if (!countResult.ok) {
    console.error("dashboard session count failed:", countResult.status);
  }
  const sessionCount = countResult.body?.total ?? 0;

  if (!session && !sessionCount) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Dashboard</h2>
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="No discussions yet"
          description="Create a discussion, share the join code and watch the room spill in real time."
        >
          <Link href="/admin/sessions/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first discussion
            </Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Dashboard</h2>
        <EmptyState
          icon={<Settings className="h-10 w-10" />}
          title="Nothing published yet"
          description="Your discussions are still drafts. Publish one - or create a new discussion - to start collecting submissions."
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/admin/sessions/new">
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create a discussion
              </Button>
            </Link>
            <Link href="/admin/sessions">
              <Button variant="secondary">Go to sessions</Button>
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  const summaryResult = await listAdminSubmissions(adminToken, {
    session_id: session.id,
    limit: 1,
  });
  if (!summaryResult.ok) {
    console.error("dashboard summary failed:", summaryResult.status);
  }
  const summaries = summaryResult.body?.summaries ?? {};
  const total = summaries.total ?? 0;
  const question = summaries.question ?? 0;
  const opinion = summaries.opinion ?? 0;
  const challenge = summaries.challenge ?? 0;
  const pending = summaries.pending ?? 0;

  const pendingResult = await listAdminSubmissions(adminToken, {
    session_id: session.id,
    status: "pending",
    sort: "newest",
    limit: PENDING_PREVIEW,
  });
  if (!pendingResult.ok) {
    console.error("dashboard pending queue failed:", pendingResult.status);
  }
  const pendingItems = pendingResult.body?.items ?? [];

  const recentResult = await listAdminSubmissions(adminToken, {
    session_id: session.id,
    sort: "newest",
    limit: 10,
  });
  if (!recentResult.ok) {
    console.error("dashboard recent submissions failed:", recentResult.status);
  }
  const recent = recentResult.body?.items ?? [];

  let joinUrl = null;
  try {
    joinUrl = buildJoinUrl(session.public_code);
  } catch {
    // NEXT_PUBLIC_SITE_URL is missing; the copy action simply does not render.
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="active-discussion-heading" className="flex flex-col gap-4">
        <h2
          id="active-discussion-heading"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Active discussion
        </h2>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {session.title}
            </h3>
            <StatusBadge status={session.status} />
            <span className="rounded-pill border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-xs font-medium text-ink">
              {session.public_code}
            </span>
          </div>
          <p className="text-sm text-muted">
            {STATUS_NOTICES[session.status] ?? "Manage this discussion below."}
          </p>
          <nav
            aria-label="Quick actions"
            className="flex flex-wrap gap-3 border-t border-white/10 pt-4"
          >
            <Link
              href={`/admin/sessions/${session.id}`}
              className={quickLinkClass}
              title="Manage discussion"
              aria-label="Manage discussion"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Manage discussion
            </Link>
            {session.status !== "draft" ? (
              <>
                <Link
                  href={`/admin/sessions/${session.id}/live`}
                  className={quickLinkClass}
                  title="Live moderation"
                  aria-label="Live moderation"
                >
                  <MonitorPlay className="h-4 w-4" aria-hidden="true" />
                  Live moderation
                </Link>
                <Link
                  href={`/room/${session.public_code}`}
                  className={quickLinkClass}
                  title="Presentation room"
                  aria-label="Presentation room"
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  Presentation room
                </Link>
                <Link
                  href={`/room/${session.public_code}`}
                  className={quickLinkClass}
                  title="Room view"
                  aria-label="Room view"
                >
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  Room view
                </Link>
              </>
            ) : null}
            <Link
              href={`/join/${session.public_code}`}
              className={quickLinkClass}
              title="Participant view"
              aria-label="Participant view"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Participant view
            </Link>
            {joinUrl ? <CopyJoinLink joinUrl={joinUrl} /> : null}
          </nav>
        </Card>
        <StatusControls sessionId={session.id} status={session.status} />
      </section>

      <PendingQueue
        items={pendingItems}
        pendingCount={pending}
        feedHref={`/admin/sessions/${session.id}/live?status=pending`}
      />

      <SummaryCards
        total={total}
        question={question}
        opinion={opinion}
        challenge={challenge}
        pending={pending}
      />

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
