"use client";

import { useState, useEffect, useRef } from "react";
import { Radio } from "lucide-react";
import { cn } from "@/lib/cn";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

const MODERATION_LABELS = {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
};

const MODERATION_VARIANTS = {
  pending: "warning",
  approved: "success",
  hidden: "danger",
};

const POLL_INTERVAL_MS = 3500;

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = then - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(diffMs / 1_000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  return rtf.format(Math.round(diffMs / 86_400_000), "day");
}

export default function RecentActivity({ sessionId, initialItems = [] }) {
  const [items, setItems] = useState(initialItems);
  const [connection, setConnection] = useState("reconnecting");
  const inFlightRef = useRef(false);

  // Polling replaces Supabase realtime: refresh the newest submissions every
  // few seconds, paused while the tab is hidden. "Reconnecting..." only shows
  // after a poll actually fails.
  useEffect(() => {
    let disposed = false;
    let timeoutId = null;

    const pollUrl = `/api/admin/submissions?session_id=${encodeURIComponent(
      sessionId
    )}&sort=newest&limit=10`;

    function schedule() {
      if (disposed || timeoutId !== null) return;
      timeoutId = setTimeout(() => {
        timeoutId = null;
        poll();
      }, POLL_INTERVAL_MS);
    }

    async function poll() {
      if (disposed) return;
      if (document.hidden) {
        schedule();
        return;
      }
      inFlightRef.current = true;
      try {
        const response = await fetch(pollUrl, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (disposed) throw new Error("poll failed");
        if (!response.ok || !Array.isArray(data?.items)) throw new Error("poll failed");
        setConnection("live");
        setItems(data.items.slice(0, 15));
      } catch {
        if (!disposed) setConnection("reconnecting");
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    }

    poll();

    const onOnline = () => {
      if (!disposed && !inFlightRef.current) poll();
    };
    const onVisibility = () => {
      if (!disposed && !inFlightRef.current && document.visibilityState === "visible") poll();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [sessionId]);

  return (
    <section aria-labelledby="recent-activity-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="recent-activity-heading"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Recent activity
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
            connection === "live" ? "bg-gold/40 text-gold-deep" : "bg-crimson/10 text-crimson-bright"
          )}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          {connection === "live" ? "Live" : "Reconnecting..."}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="New ones appear here the moment they spill in."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-white/10 bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-medium text-ink">{item.nickname}</span>
                <Badge
                  variant={MODERATION_VARIANTS[item.moderation_status] ?? "neutral"}
                  className="font-semibold uppercase tracking-[0.12em]"
                >
                  {MODERATION_LABELS[item.moderation_status] ?? item.moderation_status}
                </Badge>
                <span className="rounded-pill border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted">
                  {item.category}
                </span>
                <time
                  dateTime={item.created_at}
                  title={new Date(item.created_at).toLocaleString()}
                  className="text-xs text-muted"
                >
                  {relativeTime(item.created_at)}
                </time>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink">
                {item.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
