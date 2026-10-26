import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/admin/sessions/StatusBadge";

const linkClass =
  "inline-flex items-center justify-center rounded-control px-3 py-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SessionsListPage() {
  const supabase = await createClient();

  const { data: sessions, error } = await supabase
    .from("discussion_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("sessions list failed:", error.code, error.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Sessions</h1>
        <Link href="/admin/sessions/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New discussion
          </Button>
        </Link>
      </div>

      {!sessions || sessions.length === 0 ? (
        <EmptyState
          title="No discussions yet"
          description="Create a discussion, share the join code and watch the room spill in real time."
        >
          <Link href="/admin/sessions/new">
            <Button>Create your first discussion</Button>
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((session) => {
            const opensAt = formatDate(session.opens_at);
            const closesAt = formatDate(session.closes_at);
            return (
              <li key={session.id}>
                <Card className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {session.title}
                    </h2>
                    <StatusBadge status={session.status} />
                    <span className="font-mono text-sm text-muted">{session.public_code}</span>
                  </div>

                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      <dt className="sr-only">Created</dt>
                      <dd>Created {new Date(session.created_at).toLocaleDateString()}</dd>
                    </div>
                    {opensAt ? (
                      <div>
                        <dt className="sr-only">Opens</dt>
                        <dd>Opens {opensAt}</dd>
                      </div>
                    ) : null}
                    {closesAt ? (
                      <div>
                        <dt className="sr-only">Closes</dt>
                        <dd>Closes {closesAt}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <nav
                    aria-label={`Actions for ${session.title}`}
                    className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3"
                  >
                    <Link
                      href={`/admin/sessions/${session.id}`}
                      className={`${linkClass} bg-purple text-white hover:bg-purple-deep`}
                    >
                      Manage
                    </Link>
                    {session.status !== "draft" ? (
                      <>
                        <Link href={`/admin/sessions/${session.id}/live`} className={linkClass}>
                          Live moderation
                        </Link>
                        <Link href={`/room/${session.public_code}`} className={linkClass}>
                          Presentation room
                        </Link>
                      </>
                    ) : null}
                  </nav>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
