"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

const MAX_ITEMS = 15;

const MODERATION_LABELS = {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
};

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
  const [connection, setConnection] = useState("reconnecting"); // live | reconnecting

  // Dedupe by id (upsert on INSERT and UPDATE), newest first, capped.
  const mergeItem = useMemo(
    () => (payload) => {
      const row = payload?.new;
      if (!row?.id) return;
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== row.id);
        next.unshift({
          id: row.id,
          nickname: row.nickname,
          category: row.category,
          moderation_status: row.moderation_status,
          created_at: row.created_at,
          content: row.content,
        });
        return next.slice(0, MAX_ITEMS);
      });
    },
    []
  );

  useEffect(() => {
    const supabase = createClient();
    let channel = null;
    let disposed = false;

    function attach() {
      channel = supabase
        .channel(`admin-recent-${sessionId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "submissions", filter: `session_id=eq.${sessionId}` },
          mergeItem
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "submissions", filter: `session_id=eq.${sessionId}` },
          mergeItem
        )
        .subscribe((status) => {
          if (disposed) return;
          setConnection(status === "SUBSCRIBED" ? "live" : "reconnecting");
        });
    }

    function ensure() {
      if (channel && channel.state === "joined") return;
      if (channel) supabase.removeChannel(channel);
      attach();
    }

    attach();

    const onOnline = () => ensure();
    const onVisibility = () => {
      if (document.visibilityState === "visible") ensure();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, mergeItem]);

  return (
    <section aria-labelledby="recent-activity-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-activity-heading" className="font-display text-lg font-semibold text-ink">
          Recent activity
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium",
            connection === "live" ? "bg-lime/40 text-success" : "bg-warning/10 text-warning"
          )}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          {connection === "live" ? "Live" : "Reconnecting..."}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-neutral-300 bg-surface px-4 py-8 text-center text-sm text-muted">
          No submissions yet. New ones appear here the moment they spill in.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-neutral-200 bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="font-medium text-ink">{item.nickname}</span>
                <span className="capitalize">{item.category}</span>
                <span>{MODERATION_LABELS[item.moderation_status] ?? item.moderation_status}</span>
                <time
                  dateTime={item.created_at}
                  title={new Date(item.created_at).toLocaleString()}
                >
                  {relativeTime(item.created_at)}
                </time>
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink">
                {item.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
