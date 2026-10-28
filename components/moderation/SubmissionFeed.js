"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, EyeOff, Monitor, Pin, Radio } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import {
  approve,
  hide,
  removeSubmission,
  toggleDiscussed,
  togglePin,
  togglePresentationHidden,
} from "@/lib/actions/moderation";

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((entry) => [entry.key, entry.label]));
const STATUS_LABELS = {
  pending: "Awaiting review",
  approved: "Approved",
  hidden: "Hidden",
};
const STATUS_VARIANTS = {
  pending: "warning",
  approved: "success",
  hidden: "danger",
};
const FALLBACK_ERROR = "Something went wrong. Please try again.";

const POLL_INTERVAL_MS = 3500;

// Rough 4-line threshold: content at least this long clamps in the feed and
// gets a Show more toggle, so long posts stay scannable without hiding review.
const CLAMP_THRESHOLD = 220;

function shortTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso ?? "";
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${date.toLocaleTimeString(
    undefined,
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

const cardActionClassName = "min-h-10";
const indicatorClassName =
  "inline-flex items-center gap-1 text-xs font-medium text-muted";

function seedRows(submissions) {
  const map = new Map();
  for (const row of submissions) map.set(row.id, row);
  return map;
}

function byNewest(a, b) {
  const diff = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (diff) return diff;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

function byOldest(a, b) {
  const diff = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (diff) return diff;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function compareFor(sort) {
  if (sort === "oldest") return byOldest;
  if (sort === "pinned") {
    return (a, b) => Number(b.is_pinned) - Number(a.is_pinned) || byNewest(a, b);
  }
  return byNewest;
}

function matchesFilters(row, filters) {
  if (filters.status !== "all" && row.moderation_status !== filters.status) return false;
  if (filters.category !== "all" && row.category !== filters.category) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const inContent = String(row.content ?? "").toLowerCase().includes(needle);
    const inNickname = String(row.nickname ?? "").toLowerCase().includes(needle);
    if (!inContent && !inNickname) return false;
  }
  return true;
}

export default function SubmissionFeed({
  sessionId,
  sessionCode,
  livePath,
  baseQuery,
  submissions,
  total,
  page,
  pageSize,
  sort,
  filters,
  hasFilters,
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [rows, setRowsState] = useState(() => seedRows(submissions));
  const rowsRef = useRef(rows);
  const updateRows = useCallback((updater) => {
    rowsRef.current = updater(rowsRef.current);
    setRowsState(rowsRef.current);
  }, []);

  // Pagination total, kept fresh from successful polls.
  const [liveTotal, setLiveTotal] = useState(total);

  useEffect(() => {
    rowsRef.current = seedRows(submissions);
    setRowsState(rowsRef.current);
    setLiveTotal(total);
  }, [submissions, total]);

  const [connection, setConnection] = useState("reconnecting");
  const [error, setError] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currentIdRef = useRef(null);
  const [currentId, setCurrentIdState] = useState(null);
  const setCurrentId = useCallback((value) => {
    currentIdRef.current = value;
    setCurrentIdState(value);
  }, []);

  const busyRef = useRef(new Set());
  const [, setBusyTick] = useState(0);
  function beginBusy(key) {
    busyRef.current.add(key);
    setBusyTick((tick) => tick + 1);
  }
  function endBusy(key) {
    busyRef.current.delete(key);
    setBusyTick((tick) => tick + 1);
  }
  const isBusy = (id, actionKey) => busyRef.current.has(`${id}|${actionKey}`);
  const cardBusy = (id) => {
    const prefix = `${id}|`;
    for (const key of busyRef.current) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  };

  // Polling replaces Supabase realtime: fetch the current filter/page window
  // every few seconds, pause while the tab is hidden, and only report a live
  // connection after a poll actually succeeds.
  useEffect(() => {
    let disposed = false;
    let timeoutId = null;
    let inFlight = false;

    const query = new URLSearchParams({ session_id: sessionId });
    if (filters.status !== "all") query.set("status", filters.status);
    if (filters.category !== "all") query.set("category", filters.category);
    if (filters.q) query.set("q", filters.q);
    query.set("sort", sort);
    query.set("page", String(page));
    query.set("limit", String(pageSize));
    const pollUrl = `/api/admin/submissions?${query.toString()}`;

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
      inFlight = true;
      try {
        const response = await fetch(pollUrl, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (disposed) return;
        if (!response.ok || !Array.isArray(data?.items)) throw new Error("poll failed");
        setConnection("live");
        setLiveTotal(data.total ?? 0);
        // The fetched window is authoritative for the current filters/page:
        // new and changed rows merge in, rows that left the window drop out.
        const next = new Map();
        for (const row of data.items) next.set(row.id, row);
        updateRows(() => next);
      } catch {
        if (!disposed) setConnection("reconnecting");
      } finally {
        inFlight = false;
        schedule();
      }
    }

    poll();

    const onOnline = () => {
      if (!disposed && !inFlight) poll();
    };
    const onVisibility = () => {
      if (!disposed && !inFlight && document.visibilityState === "visible") poll();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [sessionId, filters, sort, page, pageSize, updateRows]);

  async function perform({ id, actionKey, patch, remove = false, clearCurrent = false, action }) {
    if (cardBusy(id)) return;
    const before = rowsRef.current.get(id) ?? null;
    const beforeCurrent = currentIdRef.current;

    beginBusy(`${id}|${actionKey}`);
    setError(null);

    if (remove) {
      updateRows((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } else if (patch) {
      updateRows((prev) =>
        prev.has(id) ? new Map(prev).set(id, { ...prev.get(id), ...patch }) : prev
      );
    }
    if (clearCurrent) setCurrentId(null);

    let result = null;
    try {
      result = await action(id);
    } catch {
      result = { error: FALLBACK_ERROR };
    }
    endBusy(`${id}|${actionKey}`);

    if (result?.ok) {
      if (!remove && result.row) updateRows((prev) => new Map(prev).set(id, result.row));
      return;
    }

    updateRows((prev) => {
      const next = new Map(prev);
      if (before) next.set(id, before);
      else next.delete(id);
      return next;
    });
    setCurrentId(beforeCurrent);
    setError(result?.error || FALLBACK_ERROR);
  }

  const handleApprove = (id) =>
    perform({ id, actionKey: "approve", patch: { moderation_status: "approved" }, action: approve });

  const handleHide = (id) =>
    perform({
      id,
      actionKey: "hide",
      patch: { moderation_status: "hidden" },
      clearCurrent: currentIdRef.current === id,
      action: hide,
    });

  const handleDelete = (id) =>
    perform({
      id,
      actionKey: "delete",
      remove: true,
      clearCurrent: currentIdRef.current === id,
      action: removeSubmission,
    });

  const handlePin = (row) =>
    perform({
      id: row.id,
      actionKey: "pin",
      patch: { is_pinned: !row.is_pinned },
      action: togglePin,
    });

  const handleDiscussed = (row) =>
    perform({
      id: row.id,
      actionKey: "discussed",
      patch: { discussed_at: row.discussed_at ? null : new Date().toISOString() },
      action: toggleDiscussed,
    });

  const handlePresentationHidden = (row) => {
    const nextHidden = !row.hidden_from_presentation;
    perform({
      id: row.id,
      actionKey: "presentation",
      patch: { hidden_from_presentation: nextHidden },
      clearCurrent: nextHidden && currentIdRef.current === row.id,
      action: togglePresentationHidden,
    });
  };

  async function sendToScreen(id) {
    if (cardBusy(id)) return;
    const beforeCurrent = currentIdRef.current;
    beginBusy(`${id}|screen`);
    setError(null);
    try {
      const response = await fetch("/api/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode, action: "set", submissionId: id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCurrentId(beforeCurrent);
        setError(data?.error || "Could not send that to the screen. Please try again.");
        return;
      }
      setCurrentId(data.currentId ?? null);
    } catch {
      setCurrentId(beforeCurrent);
      setError("Could not send that to the screen. Please try again.");
    } finally {
      endBusy(`${id}|screen`);
    }
  }

  async function confirmDelete() {
    const id = confirmId;
    if (!id) return;
    await handleDelete(id);
    setConfirmId(null);
  }

  const visible = useMemo(() => {
    const list = [];
    rows.forEach((row) => {
      if (matchesFilters(row, filters)) list.push(row);
    });
    list.sort(compareFor(sort));
    return list;
  }, [rows, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(liveTotal / pageSize));

  function goPage(target) {
    const qs =
      target > 1
        ? baseQuery
          ? `${baseQuery}&page=${target}`
          : `page=${target}`
        : baseQuery;
    router.replace(qs ? `${livePath}?${qs}` : livePath, { scroll: false });
  }

  function renderCard(row) {
    const busy = cardBusy(row.id);
    const onScreen = currentId === row.id;
    const statusLabel = STATUS_LABELS[row.moderation_status] ?? row.moderation_status;
    const statusVariant = STATUS_VARIANTS[row.moderation_status] ?? "neutral";
    const categoryLabel = CATEGORY_LABELS[row.category] ?? row.category;
    const mayHide = row.moderation_status === "pending" || row.moderation_status === "approved";
    const clampable = String(row.content ?? "").length > CLAMP_THRESHOLD;
    const expanded = expandedIds.has(row.id);

    return (
      <motion.li
        key={row.id}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      >
        <article
          aria-labelledby={`submission-${row.id}-author`}
          aria-busy={busy || undefined}
          className="rounded-card border border-white/10 bg-surface p-4 shadow-sm transition hover:border-gold/30 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3
              id={`submission-${row.id}-author`}
              className="font-display text-base font-semibold text-ink"
            >
              {row.nickname}
            </h3>
            <Badge variant="info">{categoryLabel}</Badge>
            <Badge variant={statusVariant} className="font-semibold uppercase tracking-[0.12em]">
              {statusLabel}
            </Badge>
            <time
              dateTime={row.created_at}
              title={new Date(row.created_at).toLocaleString()}
              suppressHydrationWarning
              className="shrink-0 whitespace-nowrap text-xs text-muted"
            >
              {shortTimestamp(row.created_at)}
            </time>
            {row.is_pinned ? (
              <span className={indicatorClassName}>
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                Pinned
              </span>
            ) : null}
            {row.discussed_at ? (
              <span className={indicatorClassName}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Discussed
              </span>
            ) : null}
            {row.hidden_from_presentation ? (
              <span className={indicatorClassName}>
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                Hidden from screen
              </span>
            ) : null}
            {onScreen ? (
              <span className={cn(indicatorClassName, "text-gold")}>
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                On screen
              </span>
            ) : null}
          </div>

          <p
            className={cn(
              "mt-3 whitespace-pre-wrap break-words text-sm text-ink",
              clampable && !expanded ? "line-clamp-4" : null
            )}
          >
            {row.content}
          </p>
          {clampable ? (
            <button
              type="button"
              onClick={() => toggleExpanded(row.id)}
              className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {row.moderation_status === "pending" ? (
              <Button
                size="sm"
                className={cardActionClassName}
                loading={isBusy(row.id, "approve")}
                disabled={busy}
                onClick={() => handleApprove(row.id)}
              >
                Approve
              </Button>
            ) : null}
            {mayHide ? (
              <Button
                size="sm"
                variant="secondary"
                className={cardActionClassName}
                loading={isBusy(row.id, "hide")}
                disabled={busy}
                onClick={() => handleHide(row.id)}
              >
                Hide
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={row.is_pinned ? "primary" : "secondary"}
              className={cardActionClassName}
              loading={isBusy(row.id, "pin")}
              disabled={busy}
              aria-pressed={Boolean(row.is_pinned)}
              onClick={() => handlePin(row)}
            >
              {row.is_pinned ? "Unpin" : "Pin"}
            </Button>
            <Button
              size="sm"
              variant={row.discussed_at ? "primary" : "secondary"}
              className={cardActionClassName}
              loading={isBusy(row.id, "discussed")}
              disabled={busy}
              aria-pressed={Boolean(row.discussed_at)}
              onClick={() => handleDiscussed(row)}
            >
              {row.discussed_at ? "Mark not discussed" : "Mark discussed"}
            </Button>
            {row.moderation_status === "approved" && !row.hidden_from_presentation ? (
              <Button
                size="sm"
                className={cardActionClassName}
                loading={isBusy(row.id, "screen")}
                disabled={busy}
                onClick={() => sendToScreen(row.id)}
              >
                Send to screen
              </Button>
            ) : null}
            {row.moderation_status === "approved" ? (
              <Button
                size="sm"
                variant={row.hidden_from_presentation ? "primary" : "secondary"}
                className={cardActionClassName}
                loading={isBusy(row.id, "presentation")}
                disabled={busy}
                aria-pressed={Boolean(row.hidden_from_presentation)}
                onClick={() => handlePresentationHidden(row)}
              >
                {row.hidden_from_presentation ? "Show on screen" : "Hide from screen"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              className={cardActionClassName}
              disabled={busy}
              onClick={() => setConfirmId(row.id)}
            >
              Delete
            </Button>
          </div>
        </article>
      </motion.li>
    );
  }

  function renderEmpty() {
    if (liveTotal === 0 && !hasFilters) {
      return (
        <EmptyState
          title="No contributions yet"
          description="They will appear here the moment someone submits."
        />
      );
    }
    if (liveTotal === 0) {
      return (
        <EmptyState
          title="No matches"
          description="No contributions match the filters you have applied."
        >
          <Button
            type="button"
            variant="secondary"
            className={cardActionClassName}
            onClick={() => router.replace(livePath, { scroll: false })}
          >
            Clear filters
          </Button>
        </EmptyState>
      );
    }
    return (
      <EmptyState
        title="Nothing on this page"
        description="This page sits past the end of the results."
      >
        <Button
          type="button"
          variant="secondary"
          className={cardActionClassName}
          disabled={page <= 1}
          onClick={() => goPage(page - 1)}
        >
          Previous page
        </Button>
      </EmptyState>
    );
  }

  return (
    <section aria-labelledby="feed-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="feed-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Contributions
        </h2>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
            connection === "live" ? "bg-gold/40 text-gold-deep" : "bg-crimson/10 text-crimson-bright"
          )}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          {connection === "live" ? "Live" : "Reconnecting"}
        </span>
      </div>

      {error ? (
        <ErrorState
          className="gap-2 py-6"
          title="That action did not go through"
          description={error}
          retry={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cardActionClassName}
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          }
        />
      ) : null}

      {visible.length === 0 ? (
        renderEmpty()
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>{visible.map((row) => renderCard(row))}</AnimatePresence>
        </ul>
      )}

      {liveTotal > 0 ? (
        <nav aria-label="Feed pagination" className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            className={cardActionClassName}
            disabled={page <= 1}
            onClick={() => goPage(page - 1)}
          >
            Previous
          </Button>
          <p aria-live="polite" className="text-sm text-muted">
            Page {page} of {totalPages} · {liveTotal} contribution{liveTotal === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            variant="secondary"
            className={cardActionClassName}
            disabled={page >= totalPages}
            onClick={() => goPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}

      <Dialog
        open={confirmId != null}
        onClose={() => setConfirmId(null)}
        title="Delete this contribution?"
        description="This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className={cardActionClassName} onClick={() => setConfirmId(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            className={cardActionClassName}
            loading={confirmId ? isBusy(confirmId, "delete") : false}
            onClick={confirmDelete}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
