'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import RoomControls from '@/components/room/RoomControls';
import Badge from '@/components/ui/Badge';
import { CATEGORIES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';

// moderation_status/hidden_from_presentation are selected even though anon RLS
// only returns approved rows: a signed-in admin's browser client bypasses that
// filter, and the display must enforce the rule itself either way.
const SUBMISSION_FIELDS =
  'id, nickname, category, content, moderation_status, is_pinned, hidden_from_presentation, created_at';

function isVisible(row) {
  return Boolean(row && row.moderation_status === 'approved' && !row.hidden_from_presentation);
}

function categoryLabel(key) {
  return CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

export default function RoomDisplay({
  session,
  sessionId,
  currentId: initialCurrentId,
  currentSubmission: initialCurrentSubmission,
  isAdmin,
}) {
  const reduceMotion = useReducedMotion();
  const screenRef = useRef(null);
  const rowsRef = useRef(null);
  if (rowsRef.current === null) {
    rowsRef.current = new Map();
    if (isVisible(initialCurrentSubmission)) {
      rowsRef.current.set(initialCurrentSubmission.id, initialCurrentSubmission);
    }
  }

  const [currentId, setCurrentId] = useState(initialCurrentId);
  const [currentRow, setCurrentRow] = useState(() =>
    isVisible(initialCurrentSubmission) ? initialCurrentSubmission : null
  );
  const [connection, setConnection] = useState('connecting');
  const currentIdRef = useRef(currentId);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  // Controls report the server's currentId back here. A changed id flows
  // through the resolve effect below; an unchanged id means the row itself
  // changed (pin/hide), so refetch it even while realtime is down.
  const handleCurrentChange = useCallback((nextId) => {
    if (!nextId) {
      setCurrentId(null);
      return;
    }
    if (nextId === currentIdRef.current) {
      const supabase = createClient();
      supabase
        .from('submissions')
        .select(SUBMISSION_FIELDS)
        .eq('id', nextId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) rowsRef.current.set(data.id, data);
          else rowsRef.current.delete(nextId);
          if (nextId === currentIdRef.current) setCurrentRow(isVisible(data) ? data : null);
        });
      return;
    }
    setCurrentId(nextId);
  }, []);

  // Resolve the pointed-at row: cache first, direct fetch otherwise. A null
  // fetch result means the row is no longer approved/visible -> cleared.
  useEffect(() => {
    let cancelled = false;
    if (!currentId) {
      setCurrentRow(null);
      return undefined;
    }
    const cached = rowsRef.current.get(currentId);
    if (cached) {
      setCurrentRow(isVisible(cached) ? cached : null);
      return undefined;
    }
    const supabase = createClient();
    supabase
      .from('submissions')
      .select(SUBMISSION_FIELDS)
      .eq('id', currentId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) rowsRef.current.set(data.id, data);
        setCurrentRow(isVisible(data) ? data : null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  useEffect(() => {
    const supabase = createClient();
    const applyRow = (row) => {
      if (!row?.id) return;
      if (row.moderation_status === 'approved') rowsRef.current.set(row.id, row);
      else rowsRef.current.delete(row.id);
      if (row.id === currentIdRef.current) setCurrentRow(isVisible(row) ? row : null);
    };
    const channel = supabase
      .channel(`room-display-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'presentation_state', filter: `session_id=eq.${sessionId}` },
        (payload) => setCurrentId(payload.new?.current_submission_id ?? null)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'presentation_state', filter: `session_id=eq.${sessionId}` },
        (payload) => setCurrentId(payload.new?.current_submission_id ?? null)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (!oldId) return;
            rowsRef.current.delete(oldId);
            if (oldId === currentIdRef.current) setCurrentRow(null);
            return;
          }
          applyRow(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Keep the last known contribution on screen while realtime is down.
          setConnection('reconnecting');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const statusLine =
    session.status === 'paused'
      ? 'Submissions paused'
      : session.status === 'closed'
        ? 'This conversation has wrapped'
        : null;

  return (
    <div ref={screenRef} className="flex h-dvh w-full flex-col overflow-hidden bg-ink text-cream">
      <header className="flex items-start justify-between gap-8 px-8 pt-8">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold tracking-tight">SPILL</span>
          {/* Logo has a dark background baked in: ink surfaces only. */}
          <img src="/gnwy-logo.png" alt="GNWY" className="h-8 w-auto" />
        </div>
        <div className="text-right">
          <p className="text-xl text-cream/60">{session.title}</p>
          {statusLine ? <p className="mt-1 text-base text-cream/50">{statusLine}</p> : null}
          {connection === 'reconnecting' ? (
            <p className="mt-1 text-base text-cream/50" role="status">
              Reconnecting…
            </p>
          ) : null}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-8 pb-32">
        <AnimatePresence mode="wait">
          {currentRow ? (
            <motion.div
              key={currentRow.id}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
              className="flex w-full max-w-5xl flex-col items-center text-center"
            >
              <div className="flex flex-wrap items-center justify-center gap-3">
                <h1 className="text-4xl font-bold">{currentRow.nickname}</h1>
                <Badge className="px-3 py-1 text-base">{categoryLabel(currentRow.category)}</Badge>
              </div>
              {currentRow.is_pinned ? (
                <p className="mt-3 inline-flex items-center gap-2 text-base text-lime">
                  <Pin className="h-4 w-4" aria-hidden="true" />
                  Pinned for discussion
                </p>
              ) : null}
              <p
                className="mt-10 text-cream"
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 4rem)',
                  lineHeight: 1.35,
                  maxWidth: '60ch',
                }}
              >
                {currentRow.content}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
              className="text-center"
            >
              <p className="text-5xl font-bold">Nothing on screen yet</p>
              <p className="mt-5 text-2xl text-cream/70">
                The moderator will pull a contribution up in a moment.
              </p>
              <p className="mt-8 text-base text-cream/50">{session.title}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <RoomControls
        isAdmin={isAdmin}
        sessionCode={session.public_code}
        currentId={currentId}
        current={currentRow}
        onCurrentChange={handleCurrentChange}
        targetRef={screenRef}
      />
    </div>
  );
}
