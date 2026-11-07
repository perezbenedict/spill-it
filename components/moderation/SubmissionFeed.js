"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, EyeOff, Monitor, Pin, Radio, Trash2 } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import AdminPlatform from "@/components/platform/AdminPlatform";
import {
  approve,
  bulkDeleteSubmissions,
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
  hidden: "Rejected",
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
  currentId: currentIdProp,
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [rows, setRowsState] = useState(() => seedRows(submissions));
  const rowsRef = useRef(rows);
  const updateRows = useCallback((updater) => {
    rowsRef.current = updater(rowsRef.current);
    setRowsState(rowsRef.current);
  }, []);

  // Confirmation banner: a brief, understated success message after an action.
  const [confirmed, setConfirmed] = useState(null);
  const confirmTimerRef = useRef(null);
  function showConfirmation(message) {
    setConfirmed(message);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmed(null), 2500);
  }
  useEffect(() => () => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
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
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [bulkError, setBulkError] = useState(null);
  const [bulkPending, setBulkPending] = useState(false);

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const currentIdRef = useRef(currentIdProp ?? null);
  const [currentId, setCurrentIdState] = useState(currentIdProp ?? null);
  const setCurrentId = useCallback((value) => {
    currentIdRef.current = value;
    setCurrentIdState(value);
  }, []);

  const busyRef = useRef(new Set());
  const [, setBusyTick] = useState(0);
  const presentationBusyRef = useRef(false);
  const [presentationBusy, setPresentationBusy] = useState(false);
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
  function setPresentationActionBusy(value) {
    presentationBusyRef.current = value;
    setPresentationBusy(value);
  }

  // Polling replaces Supabase realtime: fetch the current filter/page window
  // every few seconds, pause while the tab is hidden, and only report a live
  // connection after a poll actually succeeds.
  useEffect(() => {
    let disposed = false;
    let timeoutId = null;
    let inFlight = false;
    let controller = null;

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
      if (disposed || inFlight) return;
      if (document.hidden) {
        schedule();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const [response, roomResponse] = await Promise.all([
          fetch(pollUrl, { cache: "no-store", signal: controller.signal }),
          fetch(`/api/room/${encodeURIComponent(sessionCode)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const [data, roomData] = await Promise.all([
          response.json().catch(() => null),
          roomResponse.json().catch(() => null),
        ]);
        if (disposed) return;
        if (!response.ok || !Array.isArray(data?.items)) throw new Error("poll failed");
        setConnection("live");
        setLiveTotal(data.total ?? 0);
        // The fetched window is authoritative for the current filters/page:
        // new and changed rows merge in, rows that left the window drop out.
        const next = new Map();
        for (const row of data.items) {
          const prefix = `${row.id}|`;
          const isBeingUpdated = [...busyRef.current].some((key) => key.startsWith(prefix));
          if (isBeingUpdated) {
            const optimistic = rowsRef.current.get(row.id);
            if (optimistic) next.set(row.id, optimistic);
          } else {
            next.set(row.id, row);
          }
        }
        updateRows(() => next);
        if (roomResponse.ok && !presentationBusyRef.current && busyRef.current.size === 0) {
          setCurrentId(roomData?.currentId ?? null);
        }
      } catch {
        if (!disposed) setConnection("reconnecting");
      } finally {
        controller = null;
        inFlight = false;
        schedule();
      }
    }

    poll();

    const onOnline = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      poll();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      poll();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutId !== null) clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [sessionId, sessionCode, filters, sort, page, pageSize, updateRows, setCurrentId]);

  async function perform({ id, actionKey, patch, remove = false, clearCurrent = false, action }) {
    if (cardBusy(id)) return { error: "That contribution is already being updated." };
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
      result = await action(id, rows.get(id)?.revision);
    } catch {
      result = { error: FALLBACK_ERROR };
    }
    endBusy(`${id}|${actionKey}`);

    if (result?.ok) {
      if (remove) {
        // A poll can race the delete request and briefly reinsert the row.
        // Treat the successful response as authoritative for the visible rows.
        updateRows((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
      const nextRow = !remove && result.row ? result.row : null;
      if (nextRow) updateRows((prev) => new Map(prev).set(id, nextRow));
      if (actionKey === "approve") showConfirmation("Approved.");
      else if (actionKey === "hide") showConfirmation("Rejected and hidden.");
      else if (actionKey === "pin")
        showConfirmation(nextRow?.is_pinned ? "Pinned." : "Unpinned.");
      else if (actionKey === "discussed")
        showConfirmation(nextRow?.discussed_at ? "Marked discussed." : "Marked not discussed.");
      else if (actionKey === "presentation")
        showConfirmation(nextRow?.hidden_from_presentation ? "Hidden from screen." : "Shown on screen.");
      else if (actionKey === "delete") showConfirmation("Deleted.");
      return result;
    }

    updateRows((prev) => {
      const next = new Map(prev);
      if (before) next.set(id, before);
      else next.delete(id);
      return next;
    });
    setCurrentId(beforeCurrent);
    if (actionKey !== "delete") setError(result?.error || FALLBACK_ERROR);
    return result;
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

  const handleDelete = (id, password) =>
    perform({
      id,
      actionKey: "delete",
      remove: true,
      clearCurrent: currentIdRef.current === id,
      action: (submissionId) => removeSubmission(submissionId, password),
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
    if (cardBusy(id) || presentationBusyRef.current) return;
    const beforeCurrent = currentIdRef.current;
    setPresentationActionBusy(true);
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
      showConfirmation("Sent to screen.");
    } catch {
      setCurrentId(beforeCurrent);
      setError("Could not send that to the screen. Please try again.");
    } finally {
      endBusy(`${id}|screen`);
      setPresentationActionBusy(false);
    }
  }

  // Clears whatever is on the presentation screen without deleting the
  // submission or changing its approval status. Mirrors sendToScreen's
  // mechanism: POSTs /api/presentation with action "clear".
  async function removeFromScreen() {
    if (currentIdRef.current == null || presentationBusyRef.current) return;
    const beforeCurrent = currentIdRef.current;
    setPresentationActionBusy(true);
    beginBusy(`${beforeCurrent}|clear`);
    setError(null);
    try {
      const response = await fetch("/api/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode, action: "clear" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCurrentId(beforeCurrent);
        setError(data?.error || "Could not remove that from the screen. Please try again.");
        return;
      }
      setCurrentId(data.currentId ?? null);
      showConfirmation("Removed from screen.");
    } catch {
      setCurrentId(beforeCurrent);
      setError("Could not remove that from the screen. Please try again.");
    } finally {
      endBusy(`${beforeCurrent}|clear`);
      setPresentationActionBusy(false);
    }
  }

  async function confirmDelete() {
    const id = confirmId;
    if (!id || !deletePassword || isBusy(id, "delete")) return;
    const password = deletePassword;
    const result = await handleDelete(id, password);
    if (result?.ok) {
      setConfirmId(null);
      setDeletePassword("");
      setDeleteError(null);
    } else {
      // Keep the dialog open so a mistyped password can be corrected without
      // making the administrator find the contribution again.
      setDeleteError(result?.error || FALLBACK_ERROR);
    }
  }

  const visible = useMemo(() => {
    const list = [];
    rows.forEach((row) => {
      if (matchesFilters(row, filters)) list.push(row);
    });
    list.sort(compareFor(sort));
    return list;
  }, [rows, filters, sort]);

  useEffect(() => {
    const allowed = new Set(visible.map((row) => row.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [visible]);

  const selectedVisibleIds = visible
    .map((row) => row.id)
    .filter((id) => selectedIds.has(id));
  const allVisibleSelected = visible.length > 0 && selectedVisibleIds.length === visible.length;
  const selectionHasBusyRow = selectedVisibleIds.some((id) => cardBusy(id));
  const bulkCanSubmit =
    selectedVisibleIds.length > 0 &&
    bulkPassword.length > 0 &&
    bulkConfirmText === "DELETE" &&
    !bulkPending;

  function closeBulkDialog() {
    if (bulkPending) return;
    setBulkOpen(false);
    setBulkPassword("");
    setBulkConfirmText("");
    setBulkError(null);
  }

  async function confirmBulkDelete() {
    const ids = [...selectedVisibleIds];
    if (!bulkCanSubmit || ids.length === 0) return;
    setBulkPending(true);
    setBulkError(null);
    for (const id of ids) beginBusy(`${id}|bulk-delete`);
    let result;
    try {
      result = await bulkDeleteSubmissions(sessionId, {
        submission_ids: ids,
        password: bulkPassword,
        confirm_text: bulkConfirmText,
      });
    } catch {
      result = { error: "Could not delete the selected contributions." };
    }

    if (result?.ok) {
      const deletedIds = new Set(result.deletedIds ?? ids);
      updateRows((prev) => {
        const next = new Map(prev);
        for (const id of deletedIds) next.delete(id);
        return next;
      });
      if (currentIdRef.current && deletedIds.has(currentIdRef.current)) setCurrentId(null);
      setLiveTotal((value) => Math.max(0, value - (result.deleted ?? deletedIds.size)));
      setSelectedIds(new Set());
      setBulkOpen(false);
      setBulkPassword("");
      setBulkConfirmText("");
      setBulkError(null);
      showConfirmation(
        `Deleted ${result.deleted ?? deletedIds.size} contribution${
          (result.deleted ?? deletedIds.size) === 1 ? "" : "s"
        }.`
      );
    } else {
      setBulkError(result?.error || "Could not delete the selected contributions.");
    }
    for (const id of ids) endBusy(`${id}|bulk-delete`);
    setBulkPending(false);
  }

  const totalPages = Math.max(1, Math.ceil(liveTotal / pageSize));
  const deleteTarget = confirmId ? rows.get(confirmId) ?? null : null;

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
    const busy = cardBusy(row.id) || bulkPending;
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
          className={cn(
            "rounded-card border bg-[linear-gradient(145deg,rgba(42,24,70,0.94),rgba(27,16,48,0.96))] p-4 shadow-[0_18px_50px_-36px_rgba(167,139,250,0.7)] transition-[border-color,box-shadow,transform] duration-200 sm:p-5",
            onScreen
              ? "border-gold/45 shadow-[0_22px_65px_-34px_rgba(167,139,250,0.9)]"
              : "border-white/10 hover:border-gold/30 hover:shadow-[0_22px_60px_-38px_rgba(167,139,250,0.7)]"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-control border border-white/10 bg-midnight/50 transition-colors hover:border-gold/50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#A78BFA]"
                checked={selectedIds.has(row.id)}
                disabled={busy}
                onChange={() => toggleSelected(row.id)}
                aria-label={`Select contribution from ${row.nickname}`}
              />
            </label>
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
                disabled={busy || presentationBusy}
                onClick={() => handleApprove(row.id)}
                title="Mark this submission as approved and eligible for presentation"
                aria-label="Approve submission"
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
                title="Reject this submission; it will no longer appear in the feed or be presented"
                aria-label="Reject submission"
              >
                Reject
              </Button>
            ) : null}
            {row.moderation_status === "approved" && !row.hidden_from_presentation && !onScreen ? (
              <Button
                size="sm"
                className={cardActionClassName}
                loading={isBusy(row.id, "screen")}
                disabled={busy}
                onClick={() => sendToScreen(row.id)}
                title="Display this approved submission on the presentation screen"
                aria-label="Send to screen"
              >
                Send to screen
              </Button>
            ) : null}
            {onScreen ? (
              <Button
                size="sm"
                variant="secondary"
                className={cardActionClassName}
                loading={isBusy(row.id, "clear")}
                disabled={busy || presentationBusy || row.moderation_status !== "approved"}
                onClick={removeFromScreen}
                title="Clear the presentation screen (keeps submission approved)"
                aria-label="Remove from screen"
              >
                Remove from screen
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
              title={row.is_pinned ? "Unpin this submission" : "Pin to the top of the feed"}
              aria-label={row.is_pinned ? "Unpin submission" : "Pin submission"}
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
              title={row.discussed_at ? "Mark as not discussed" : "Mark as discussed"}
              aria-label={row.discussed_at ? "Mark not discussed" : "Mark discussed"}
            >
              {row.discussed_at ? "Mark not discussed" : "Mark discussed"}
            </Button>
            {row.moderation_status === "approved" ? (
              <Button
                size="sm"
                variant={row.hidden_from_presentation ? "primary" : "secondary"}
                className={cardActionClassName}
                loading={isBusy(row.id, "presentation")}
                disabled={busy}
                aria-pressed={Boolean(row.hidden_from_presentation)}
                onClick={() => handlePresentationHidden(row)}
                title={row.hidden_from_presentation ? "Show on presentation screen" : "Hide from presentation screen"}
                aria-label={row.hidden_from_presentation ? "Show on screen" : "Hide from screen"}
              >
                {row.hidden_from_presentation ? "Show on screen" : "Hide from screen"}
              </Button>
            ) : null}
            <Button
              id={`delete-submission-${row.id}`}
              size="sm"
              variant="danger"
              className={cardActionClassName}
              disabled={busy}
              onClick={() => {
                setError(null);
                setDeletePassword("");
                setDeleteError(null);
                setConfirmId(row.id);
              }}
              title="Delete this submission permanently"
              aria-label="Delete submission"
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
      <AdminPlatform sessionId={sessionId} approved={Array.from(rows.values()).filter(row => row.moderation_status === 'approved' && !row.hidden_from_presentation)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="feed-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Contributions
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {currentId ? (
            <span
              className={cn(indicatorClassName, "text-gold")}
              title="Currently displayed on the presentation screen"
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              On screen{(() => {
                const r = rows.get(currentId);
                return r ? `: ${r.nickname}` : "";
              })()}
            </span>
          ) : null}
          {currentId ? (
            <Button
              size="sm"
              variant="secondary"
              className={cardActionClassName}
              loading={isBusy(currentId, "clear")}
              disabled={presentationBusy || cardBusy(currentId)}
              onClick={removeFromScreen}
              title="Clear the presentation screen without deleting the submission"
              aria-label="Remove from screen"
            >
              Remove from screen
            </Button>
          ) : null}
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

      {visible.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-card border border-white/10 bg-surface/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setSelectedIds(
                  allVisibleSelected ? new Set() : new Set(visible.map((row) => row.id))
                )
              }
              disabled={bulkPending}
            >
              {allVisibleSelected ? "Deselect all" : "Select all visible"}
            </Button>
            {selectedVisibleIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkPending}
              >
                Clear selection
              </Button>
            ) : null}
            <span role="status" aria-live="polite" className="text-sm font-medium text-muted">
              {selectedVisibleIds.length} selected on this page
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="danger"
            className="w-full sm:w-auto"
            disabled={selectedVisibleIds.length === 0 || selectionHasBusyRow || bulkPending}
            onClick={() => {
              setBulkError(null);
              setBulkOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete selected
          </Button>
        </div>
      ) : null}

      {confirmed ? (
        <p
          role="status"
          aria-live="polite"
            className="inline-flex items-center gap-2 self-start rounded-pill border border-gold/40 bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold shadow-[0_10px_30px_-22px_rgba(167,139,250,0.9)]"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {confirmed}
        </p>
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
        onClose={() => {
          if (confirmId && isBusy(confirmId, "delete")) return;
          setConfirmId(null);
          setDeletePassword("");
          setDeleteError(null);
        }}
        title="Delete this contribution?"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.nickname}'s contribution. This cannot be undone.`
            : "Permanently delete this contribution. This cannot be undone."
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            confirmDelete();
          }}
        >
          {deleteTarget ? (
            <div className="rounded-control border border-white/10 bg-midnight/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {CATEGORY_LABELS[deleteTarget.category] ?? deleteTarget.category}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink">
                {deleteTarget.content}
              </p>
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Admin password
            <Input
              type="password"
              data-dialog-autofocus
              value={deletePassword}
              onChange={(event) => {
                setDeletePassword(event.target.value);
                setDeleteError(null);
              }}
              placeholder="Admin password"
              autoComplete="current-password"
              error={undefined}
            />
          </label>
          {deleteError ? (
            <p role="alert" className="text-sm font-medium text-crimson">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className={cardActionClassName}
              disabled={confirmId ? isBusy(confirmId, "delete") : false}
              onClick={() => {
                setConfirmId(null);
                setDeletePassword("");
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              className={cardActionClassName}
              loading={confirmId ? isBusy(confirmId, "delete") : false}
              disabled={!deletePassword}
            >
              Delete
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={bulkOpen}
        onClose={closeBulkDialog}
        title="Delete selected contributions?"
        description={`Permanently delete ${selectedVisibleIds.length} selected contribution${
          selectedVisibleIds.length === 1 ? "" : "s"
        } from session ${sessionCode}. This cannot be undone.`}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (bulkCanSubmit) confirmBulkDelete();
          }}
        >
          <div className="rounded-control border border-crimson/30 bg-crimson/10 p-3">
            <p className="text-sm font-semibold text-ink">Session {sessionCode}</p>
            <p className="mt-1 text-sm text-muted">
              {selectedVisibleIds.length} selected contribution{
                selectedVisibleIds.length === 1 ? "" : "s"
              } will be permanently deleted.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Type DELETE
            <Input
              value={bulkConfirmText}
              onChange={(event) => {
                setBulkConfirmText(event.target.value);
                setBulkError(null);
              }}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Admin password
            <Input
              type="password"
              data-dialog-autofocus
              value={bulkPassword}
              onChange={(event) => {
                setBulkPassword(event.target.value);
                setBulkError(null);
              }}
              placeholder="Admin password"
              autoComplete="current-password"
            />
          </label>
          {bulkError ? (
            <p role="alert" className="rounded-control border border-crimson/25 bg-crimson/10 px-3 py-2 text-sm font-medium text-crimson-bright">
              {bulkError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" disabled={bulkPending} onClick={closeBulkDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={bulkPending}
              disabled={!bulkCanSubmit}
            >
              Delete {selectedVisibleIds.length} contribution{
                selectedVisibleIds.length === 1 ? "" : "s"
              }
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
