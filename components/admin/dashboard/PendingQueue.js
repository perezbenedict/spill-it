"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function shortTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso ?? "";
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${date.toLocaleTimeString(
    undefined,
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

// Dashboard review queue: the first pending submissions with one-click
// decisions. Approving/hiding calls the same server actions as the full feed;
// rows leave the queue optimistically and router.refresh() re-syncs counts.
export default function PendingQueue({ items, pendingCount, feedHref }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [handled, setHandled] = useState(() => new Set());

  async function run(id, action) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const result = await action(id);
      if (!result?.ok) {
        setError(result?.error || FALLBACK_ERROR);
        return;
      }
      setHandled((prev) => new Set(prev).add(id));
      router.refresh();
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  const visible = items.filter((item) => !handled.has(item.id));

  return (
    <section aria-labelledby="needs-review-heading" className="flex flex-col gap-3">
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
                  title={new Date(item.created_at).toLocaleString()}
                  className="shrink-0 whitespace-nowrap text-xs text-muted"
                >
                  {shortTimestamp(item.created_at)}
                </time>
              </div>
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-ink">
                {item.content}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={busyId === item.id}
                  disabled={busyId != null}
                  onClick={() => run(item.id, approve)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId != null}
                  onClick={() => run(item.id, hide)}
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
