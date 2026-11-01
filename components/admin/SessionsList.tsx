"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Trash2 } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Input from "@/components/ui/Input";
import StatusBadge from "@/components/admin/sessions/StatusBadge";
import { bulkDeleteSessions } from "@/lib/actions/sessions";

const linkClass =
  "inline-flex items-center justify-center rounded-control px-3 py-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SessionsList({ sessions }) {
  const router = useRouter();
  const [visibleSessions, setVisibleSessions] = useState(sessions);
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisibleSessions(sessions);
    const currentIds = new Set(sessions.map((session) => session.id));
    setSelectedIds((current) => new Set([...current].filter((id) => currentIds.has(id))));
  }, [sessions]);

  const eligibleSessions = useMemo(
    () => visibleSessions.filter((session) => session.status !== "live"),
    [visibleSessions]
  );
  const selectedSessions = useMemo(
    () => visibleSessions.filter((session) => selectedIds.has(session.id)),
    [selectedIds, visibleSessions]
  );
  const allEligibleSelected =
    eligibleSessions.length > 0 && eligibleSessions.every((session) => selectedIds.has(session.id));
  const canDelete = selectedSessions.length > 0 && confirmText === "DELETE" && password.length > 0;

  function toggleSession(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    setSelectedIds(new Set(eligibleSessions.map((session) => session.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function closeDeleteDialog() {
    if (pending) return;
    setDeleteOpen(false);
    setConfirmText("");
    setPassword("");
    setError(null);
  }

  async function handleBulkDelete(event) {
    event.preventDefault();
    if (pending || !canDelete) return;
    setPending(true);
    setError(null);
    try {
      const ids = selectedSessions.map((session) => session.id);
      const result = await bulkDeleteSessions({
        session_ids: ids,
        password,
        confirm_text: confirmText,
      });
      if (!result?.ok) {
        setError(result?.error || "Could not delete the selected discussions.");
        return;
      }

      const deletedIds = new Set(Array.isArray(result.deleted) ? result.deleted : ids);
      setVisibleSessions((current) => current.filter((session) => !deletedIds.has(session.id)));
      setSelectedIds(new Set());
      setDeleteOpen(false);
      setConfirmText("");
      setPassword("");
      router.refresh();
    } catch {
      setError("Could not delete the selected discussions. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        {eligibleSessions.length > 0 ? (
          <div className="sticky top-3 z-10 flex flex-wrap items-center gap-2 rounded-card border border-gold/20 bg-[#201238]/95 px-3 py-2.5 shadow-[0_14px_40px_-24px_rgba(167,139,250,0.8)] backdrop-blur-md">
            <p className="mr-auto text-sm font-medium text-ink" role="status">
              {selectedSessions.length} selected
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={allEligibleSelected ? clearSelection : selectAllEligible}
            >
              {allEligibleSelected ? "Deselect all" : "Select all eligible"}
            </Button>
            {selectedSessions.length > 0 ? (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setError(null);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete selected
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <ul className="flex flex-col gap-3">
        {visibleSessions.map((session, index) => {
          const opensAt = formatDate(session.opens_at);
          const closesAt = formatDate(session.closes_at);
          const lastActivity =
            formatDate(session.updated_at) ?? formatDate(session.created_at);
          return (
            <motion.li
              key={session.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: Math.min(index * 0.05, 0.4),
                ease: "easeOut",
              }}
            >
              <Card className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(session.id)}
                      disabled={session.status === "live"}
                      onChange={() => toggleSession(session.id)}
                      aria-label={
                        session.status === "live"
                          ? `${session.title} is live and must be closed before deletion`
                          : `Select ${session.title}`
                      }
                      className="h-4 w-4 rounded border-white/25 bg-surface text-gold accent-[#A78BFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-35"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="break-words font-display text-lg font-semibold text-ink">
                        {session.title}
                      </h2>
                      <StatusBadge status={session.status} />
                      <span className="rounded-pill border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-xs font-medium text-ink">
                        {session.public_code}
                      </span>
                    </div>
                    {session.status === "live" ? (
                      <p className="mt-1 text-xs leading-relaxed text-gold">
                        Close this live discussion before selecting it for deletion.
                      </p>
                    ) : null}
                  </div>
                </div>

                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    <dt className="sr-only">Last activity</dt>
                    <dd>Last activity {lastActivity ?? "unknown"}</dd>
                  </div>
                  <div>
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
                  className="flex flex-wrap gap-2 border-t border-white/10 pt-3"
                >
                  <Link
                    href={`/admin/sessions/${session.id}`}
                    className={`${linkClass} bg-gold text-midnight hover:bg-gold-light`}
                  >
                    Manage
                  </Link>
                  {session.status !== "draft" ? (
                    <>
                      <Link
                        href={`/admin/sessions/${session.id}/live`}
                        className={linkClass}
                      >
                        Live moderation
                      </Link>
                      <Link
                        href={`/room/${session.public_code}`}
                        className={linkClass}
                      >
                        Presentation room
                      </Link>
                    </>
                  ) : null}
                </nav>
              </Card>
            </motion.li>
          );
        })}
        </ul>

        <Dialog
          open={deleteOpen}
          onClose={closeDeleteDialog}
          title={`Delete ${selectedSessions.length} selected discussion${selectedSessions.length === 1 ? "" : "s"}?`}
          description="This permanent action affects only the discussions listed below."
        >
          <form onSubmit={handleBulkDelete} className="flex flex-col gap-4">
            <div className="max-h-56 overflow-y-auto rounded-control border border-crimson/30 bg-crimson/5 p-3">
              <ul className="flex flex-col gap-3 text-sm">
                {selectedSessions.map((session) => (
                  <li key={session.id} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
                    <p className="font-semibold text-ink">{session.title}</p>
                    {session.topic ? (
                      <p className="mt-0.5 break-words text-muted">{session.topic}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-xs text-muted">{session.public_code}</p>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm leading-relaxed text-crimson-bright">
              Every selected discussion, contribution, nickname reservation, and presentation reference will be permanently deleted.
            </p>

            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Type DELETE to confirm
              <Input
                value={confirmText}
                onChange={(event) => {
                  setConfirmText(event.target.value);
                  setError(null);
                }}
                placeholder="DELETE"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              Admin password
              <Input
                type="password"
                data-dialog-autofocus
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                placeholder="Admin password"
                autoComplete="current-password"
                error={Boolean(error)}
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm font-medium text-crimson-bright">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={closeDeleteDialog}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={pending} disabled={!canDelete}>
                Permanently delete selected
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </MotionConfig>
  );
}
