import Link from "next/link";
import { Plus } from "lucide-react";
import { getAdminToken } from "@/lib/auth";
import { listAdminSessions } from "@/lib/spill-api";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SessionsList from "@/components/admin/SessionsList";

export default async function SessionsListPage() {
  const adminToken = await getAdminToken();

  const result = await listAdminSessions(adminToken, { limit: 50 });
  if (!result.ok) {
    console.error("sessions list failed:", result.status);
  }
  const sessions = result.body?.items ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Sessions</h1>
        <Link href="/admin/sessions/new">
          <Button variant="primary">
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
            <Button variant="primary">Create your first discussion</Button>
          </Link>
        </EmptyState>
      ) : (
        <SessionsList sessions={sessions} />
      )}
    </div>
  );
}
