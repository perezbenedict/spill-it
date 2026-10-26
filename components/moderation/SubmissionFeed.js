'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, EyeOff, Monitor, Pin, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import {
  approve,
  hide,
  removeSubmission,
  toggleDiscussed,
  togglePin,
  togglePresentationHidden,
} from '@/lib/actions/moderation';

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((entry) => [entry.key, entry.label]));
const STATUS_LABELS = {
  pending: 'Awaiting review',
  approved: 'Approved',
  hidden: 'Hidden',
};
const STATUS_VARIANTS = {
  pending: 'warning',
  approved: 'success',
  hidden: 'danger',
};
const FALLBACK_ERROR = 'Something went wrong. Please try again.';

const cardActionClassName = 'min-h-10';
const indicatorClassName =
  'inline-flex items-center gap-1 text-xs font-medium text-muted';

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
  if (sort === 'oldest') return byOldest;
  if (sort === 'pinned') {
    return (a, b) => Number(b.is_pinned) - Number(a.is_pinned) || byNewest(a, b);
  }
  return byNewest;
}

// Mirrors the server query's literal (de-wildcarded) case-insensitive match so
// realtime rows obey the filters the page was fetched with.
function matchesFilters(row, filters) {
  if (filters.status !== 'all' && row.moderation_status !== filters.status) return false;
  if (filters.category !== 'all' && row.category !== filters.category) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const inContent = String(row.content ?? '').toLowerCase().includes(needle);
    const inNickname = String(row.nickname ?? '').toLowerCase().includes(needle);
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

  const [rows, setRowsState] = useState(() => seedRows(submissions));
  const rowsRef = useRef(rows);
  const updateRows = useCallback((updater) => {
    rowsRef.current = updater(rowsRef.current);
    setRowsState(rowsRef.current);
  }, []);

  // Re-seed whenever the server sends a fresh page (filter or page change).
  useEffect(() => {
    rowsRef.current = seedRows(submissions);
    setRowsState(rowsRef.current);
  }, [submissions]);

  const [connection, setConnection] = useState('reconnecting');
  const [error, setError] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const currentIdRef = useRef(null);
  const [currentId, setCurrentIdState] = useState(null);
  const setCurrentId = useCallback((value) => {
    currentIdRef.current = value;
    setCurrentIdState(value);
  }, []);

  // Ref is the source of truth so a second click before re-render cannot start
  // a duplicate request; state copy exists to trigger the render.
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

  // --- realtime -----------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let channel = null;
    let disposed = false;
    let generation = 0;

    const onInsert = (payload) => {
      const row = payload?.new;
      if (!row?.id) return;
      updateRows((prev) => (prev.has(row.id) ? prev : new Map(prev).set(row.id, row)));
    };
    const onUpdate = (payload) => {
      const row = payload?.new;
      if (!row?.id) return;
      updateRows((prev) => new Map(prev).set(row.id, row));
    };
    const onDelete = (payload) => {
      const id = payload?.old?.id;
      if (!id) return;
      updateRows((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };

    function attach() {
      generation += 1;
      const expected = generation;
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`moderation-feed-${sessionId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'submissions', filter: `session_id=eq.${sessionId}` },
          onInsert
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'submissions', filter: `session_id=eq.${sessionId}` },
          onUpdate
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'submissions', filter: `session_id=eq.${sessionId}` },
          onDelete
        )
        .subscribe((status) => {
          // Ignore callbacks from a channel that has been replaced.
          if (disposed || expected !== generation) return;
          setConnection(status === 'SUBSCRIBED' ? 'live' : 'reconnecting');
        });
    }

    attach();

    const onOnline = () => attach();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') attach();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, updateRows]);

  // --- actions ------------------------------------------------------------
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

    // Revert the optimistic change and show the failure inline (never alert).
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
    perform({ id, actionKey: 'approve', patch: { moderation_status: 'approved' }, action: approve });

  const handleHide = (id) =>
    perform({
      id,
      actionKey: 'hide',
      patch: { moderation_status: 'hidden' },
      clearCurrent: currentIdRef.current === id,
      action: hide,
    });

  const handleDelete = (id) =>
    perform({
      id,
      actionKey: 'delete',
      remove: true,
      clearCurrent: currentIdRef.current === id,
      action: removeSubmission,
    });

  const handlePin = (row) =>
    perform({
      id: row.id,
      actionKey: 'pin',
      patch: { is_pinned: !row.is_pinned },
      action: togglePin,
    });

  const handleDiscussed = (row) =>
    perform({
      id: row.id,
      actionKey: 'discussed',
      patch: { discussed_at: row.discussed_at ? null : new Date().toISOString() },
      action: toggleDiscussed,
    });

  const handlePresentationHidden = (row) => {
    const nextHidden = !row.hidden_from_presentation;
    perform({
      id: row.id,
      actionKey: 'presentation',
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
      const response = await fetch('/api/presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode, action: 'set', submissionId: id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setCurrentId(beforeCurrent);
        setError(data?.error || 'Could not send that to the screen. Please try again.');
        return;
      }
      setCurrentId(data.currentId ?? null);
    } catch {
      setCurrentId(beforeCurrent);
      setError('Could not send that to the screen. Please try again.');
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

  // --- derived view -------------------------------------------------------
  const visible = useMemo(() => {
    const list = [];
    rows.forEach((row) => {
      if (matchesFilters(row, filters)) list.push(row);
    });
    list.sort(compareFor(sort));
    return list;
  }, [rows, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
    const statusVariant = STATUS_VARIANTS[row.moderation_status] ?? 'neutral';
    const categoryLabel = CATEGORY_LABELS[row.category] ?? row.category;
    const mayHide = row.moderation_status === 'pending' || row.moderation_status === 'approved';

    return (
      <li key={row.id}>
        <article
          aria-labelledby={`submission-${row.id}-author`}
          aria-busy={busy || undefined}
          className="rounded-card border border-neutral-200 bg-surface p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3
              id={`submission-${row.id}-author`}
              className="font-display text-base font-semibold text-ink"
            >
              {row.nickname}
            </h3>
            <Badge variant="info">{categoryLabel}</Badge>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
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
              <span className={cn(indicatorClassName, 'text-purple-deep')}>
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                On screen
              </span>
            ) : null}
          </div>

          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink">{row.content}</p>
          <time
            dateTime={row.created_at}
            suppressHydrationWarning
            className="mt-2 block text-xs text-muted"
          >
            {new Date(row.created_at).toLocaleString()}
          </time>

          <div className="mt-4 flex flex-wrap gap-2">
            {row.moderation_status === 'pending' ? (
              <Button
                size="sm"
                className={cardActionClassName}
                loading={isBusy(row.id, 'approve')}
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
                loading={isBusy(row.id, 'hide')}
                disabled={busy}
                onClick={() => handleHide(row.id)}
              >
                Hide
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              className={cardActionClassName}
              loading={isBusy(row.id, 'pin')}
              disabled={busy}
              onClick={() => handlePin(row)}
            >
              {row.is_pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={cardActionClassName}
              loading={isBusy(row.id, 'discussed')}
              disabled={busy}
              onClick={() => handleDiscussed(row)}
            >
              {row.discussed_at ? 'Mark not discussed' : 'Mark discussed'}
            </Button>
            {row.moderation_status === 'approved' && !row.hidden_from_presentation ? (
              <Button
                size="sm"
                className={cardActionClassName}
                loading={isBusy(row.id, 'screen')}
                disabled={busy}
                onClick={() => sendToScreen(row.id)}
              >
                Send to screen
              </Button>
            ) : null}
            {row.moderation_status === 'approved' ? (
              <Button
                size="sm"
                variant="ghost"
                className={cardActionClassName}
                loading={isBusy(row.id, 'presentation')}
                disabled={busy}
                onClick={() => handlePresentationHidden(row)}
              >
                {row.hidden_from_presentation ? 'Show on screen' : 'Hide from screen'}
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
      </li>
    );
  }

  function renderEmpty() {
    if (total === 0 && !hasFilters) {
      return (
        <EmptyState
          title="No contributions yet"
          description="They will appear here the moment someone submits."
        />
      );
    }
    if (total === 0) {
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
        <h2 id="feed-heading" className="font-display text-lg font-semibold text-ink">
          Contributions
        </h2>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-medium',
            connection === 'live' ? 'bg-lime/40 text-success' : 'bg-warning/10 text-warning'
          )}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          {connection === 'live' ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger/5 px-4 py-3"
        >
          <p className="text-sm text-danger">{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cardActionClassName}
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        renderEmpty()
      ) : (
        <ul className="flex flex-col gap-3">{visible.map((row) => renderCard(row))}</ul>
      )}

      {total > 0 ? (
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
            Page {page} of {totalPages} · {total} contribution{total === 1 ? '' : 's'}
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
            loading={confirmId ? isBusy(confirmId, 'delete') : false}
            onClick={confirmDelete}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
