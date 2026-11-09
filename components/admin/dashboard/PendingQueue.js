"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moderationTimestamp } from "@/lib/moderation-time";
import { ArrowRight } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { approve, hide } from "@/lib/actions/moderation";

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.map((entry) => [entry.key, entry.label])
);

const FALLBACK_ERROR = "Something went wrong. Please try again.";



// Dashboard review queue: the first pending submissions with one-click
// decisions. Approving/hiding calls the same server actions as the full feed;
// rows leave only after confirmation, and router.refresh() re-syncs counts.
export default function PendingQueue({ items, pendingCount, feedHref }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);
  const [error, setError] = useState(null);
  const [handled, setHandled] = useState(() => new Set());

  async function run(item, action) {
    if (inFlight.current || refreshing) return;
    inFlight.current = true;
    const { id, revision } = item;
    setBusyId(id);
    setError(null);
    try {
      const result = await action(id, revision);
      if (!result?.ok) {
        setError(result?.error || FALLBACK_ERROR);
        if (result?.refreshRequired) startRefresh(() => router.refresh());
        return;
      }
      setHandled((prev) => new Set(prev).add(id));
      startRefresh(() => router.refresh());
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  const visible = items.filter((item) => !handled.has(item.id));

  return (
    <section aria-busy={refreshing || undefined} aria-labelledby="needs-review-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="needs-review-heading"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Needs review
          <span className="ml-2 rounded-pill border border-gold/40 bg-gold/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gold">
            {pendingCount}
          </span>
        </h2>
        <Link
          href={feedHref}
          className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Open the full feed
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="New submissions land here the moment they spill in, ready for a one-click decision."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li
              key={item.id}
              aria-busy={busyId === item.id || undefined}
              className="rounded-card border border-white/10 bg-surface p-4 shadow-sm transition hover:border-gold/30"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-medium text-ink">{item.nickname}</span>
                <Badge variant="info">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </Badge>
                <time
                  dateTime={item.created_at}
                  title={item.created_at}
                  className="shrink-0 whitespace-nowrap text-xs text-muted"
                >
                  {moderationTimestamp(item.created_at)}
                </time>
              </div>
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-ink">
                {item.content}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={busyId === item.id}
                  disabled={busyId != null || refreshing}
                  onClick={() => run(item, approve)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId != null || refreshing}
                  onClick={() => run(item, hide)}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
