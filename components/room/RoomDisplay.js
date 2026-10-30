"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import RoomControls from "@/components/room/RoomControls";
import Badge from "@/components/ui/Badge";
import { CATEGORIES } from "@/lib/constants";

const POLL_INTERVAL_MS = 3500;
const REVEAL_EASE = [0.16, 1, 0.3, 1];

function isVisible(row) {
  return Boolean(row && row.moderation_status === "approved" && !row.hidden_from_presentation);
}

function categoryLabel(key) {
  return CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

// Long contributions shrink and widen so a full quote still fits a 1080p
// projector without scrolling (submissions can run to 1000 characters).
function quoteStyle(content) {
  const length = content?.length ?? 0;
  if (length > 800) return { fontSize: "clamp(1.25rem, 2.2vw, 1.875rem)", lineHeight: 1.35, maxWidth: "48ch" };
  if (length > 550) return { fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)", lineHeight: 1.35, maxWidth: "42ch" };
  if (length > 300) return { fontSize: "clamp(1.75rem, 3.2vw, 2.75rem)", lineHeight: 1.3, maxWidth: "36ch" };
  if (length > 160) return { fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.25, maxWidth: "28ch" };
  return { fontSize: "clamp(2rem, 5vw, 4.5rem)", lineHeight: 1.2, maxWidth: "24ch" };
}

export default function RoomDisplay({
  session,
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
  const sessionCode = session.public_code;
  const pollUrl = `/api/room/${sessionCode}`;

  const [currentId, setCurrentId] = useState(initialCurrentId);
  const [currentRow, setCurrentRow] = useState(() =>
    isVisible(initialCurrentSubmission) ? initialCurrentSubmission : null
  );
  const [connection, setConnection] = useState("connecting");
  const currentIdRef = useRef(currentId);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const handleCurrentChange = useCallback(
    (nextId) => {
      if (!nextId) {
        setCurrentId(null);
        return;
      }
      if (nextId === currentIdRef.current) {
        // Same pointer: refresh the row in place (e.g. after a pin toggle).
        fetch(pollUrl, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            const row = data?.submission ?? null;
            if (row) rowsRef.current.set(row.id, row);
            else rowsRef.current.delete(nextId);
            if (nextId === currentIdRef.current) setCurrentRow(isVisible(row) ? row : null);
          })
          .catch(() => {});
        return;
      }
      setCurrentId(nextId);
    },
    [pollUrl]
  );

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
    fetch(pollUrl, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const row = data?.submission ?? null;
        if (row) rowsRef.current.set(row.id, row);
        setCurrentRow(isVisible(row) ? row : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentId, pollUrl]);

  // Polling replaces Supabase realtime: the pointer plus its submission are
  // refetched every few seconds, paused while the tab is hidden. The
  // "Reconnecting…" line only shows after a poll actually fails.
  useEffect(() => {
    let disposed = false;
    let timeoutId = null;
    let inFlight = false;

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
        const data = response.ok ? await response.json() : null;
        if (disposed || !data) throw new Error("poll failed");
        setConnection("live");
        const nextId = data.currentId ?? null;
        const row = data.submission ?? null;
        if (row) rowsRef.current.set(row.id, row);
        setCurrentId(nextId);
        if (!nextId) setCurrentRow(null);
        else if (row && row.id === nextId) setCurrentRow(isVisible(row) ? row : null);
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
  }, [pollUrl]);

  const isClosed = session.status === "closed";
  const statusLine =
    session.status === "paused"
      ? "Submissions paused"
      : isClosed
        ? "This conversation has wrapped"
        : null;

  return (
    <div ref={screenRef} className="relative flex h-dvh w-full flex-col overflow-hidden bg-midnight text-ink">
      <header className="grid grid-cols-[1fr_auto_1fr] items-start gap-8 px-10 pt-8">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">Spill It</span>
          <span className="inline-flex h-7 w-7" aria-label="Spill It">
            <svg
              viewBox="0 0 120 120"
              xmlns="http://www.w3.org/2000/svg"
              className="h-full w-full"
            >
              <defs>
                <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#C4B5FD" />
                  <stop offset="55%" stopColor="#A78BFA" />
                  <stop offset="100%" stopColor="#6D4AB8" />
                </linearGradient>
                <linearGradient id="crimson" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D8324C" />
                  <stop offset="100%" stopColor="#B3223A" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="56" fill="none" stroke="url(#gold)" strokeWidth="1.6" />
              <circle cx="60" cy="60" r="50.5" fill="none" stroke="url(#gold)" strokeWidth="0.8" opacity="0.65" />
              <circle cx="60" cy="60" r="38" fill="#121722" />
              <path
                d="M60 30 C 72 48, 82 56, 78 68 C 75 79, 68 86, 60 88 C 52 86, 45 79, 42 68 C 38 56, 48 48, 60 30 Z"
                fill="url(#crimson)"
              />
              <path
                d="M60 48 C 65 56, 70 60, 68 67 C 66 73, 63 76, 60 77 C 57 76, 54 73, 52 67 C 50 60, 55 56, 60 48 Z"
                fill="url(#gold)"
                opacity="0.95"
              />
            </svg>
          </span>
        </div>
        {/* Middle grid cell always renders so the status column stays right-anchored */}
        <div className="max-w-[42ch] text-center">
          {currentRow ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-gold">
                Now discussing
              </p>
              <p className="mt-2 font-display text-[clamp(1.25rem,2vw,1.75rem)] leading-snug text-gold-light">
                {session.title}
              </p>
            </>
          ) : null}
        </div>
        <div className="justify-self-end text-right">
          {statusLine ? <p className="text-base text-muted">{statusLine}</p> : null}
          {connection === "reconnecting" ? (
            <p role="status" className="mt-1 inline-flex items-center justify-end gap-2 text-base text-ink">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-pill bg-crimson-bright motion-safe:animate-pulse"
              />
              Reconnecting…
            </p>
          ) : null}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-10 pb-28 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence mode="wait">
          {currentRow ? (
            <motion.div
              key={currentRow.id}
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: REVEAL_EASE }}
              className="flex w-full flex-col items-center text-center"
            >
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Badge variant="info" className="px-3 py-1 text-sm uppercase tracking-[0.2em]">
                  {categoryLabel(currentRow.category)}
                </Badge>
                {currentRow.is_pinned ? (
                  <span className="inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.2em] text-gold">
                    <Pin className="h-4 w-4" aria-hidden="true" />
                    Pinned for discussion
                  </span>
                ) : null}
              </div>
              <p className="mt-6 text-[clamp(0.9375rem,1.4vw,1.25rem)] font-semibold uppercase tracking-[0.24em] text-gold">
                {currentRow.nickname}
              </p>
              <blockquote
                className="mt-8 text-balance font-display text-ink"
                style={quoteStyle(currentRow.content)}
              >
                {currentRow.content}
              </blockquote>
            </motion.div>
          ) : (
            <motion.div
              key={isClosed ? "ended" : "waiting"}
              initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: REVEAL_EASE }}
              className="relative flex w-full flex-col items-center text-center"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[min(72vh,40rem)] w-[min(110vw,60rem)] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(167,139,250,0.13), rgba(167,139,250,0.05) 45%, transparent 75%)",
                }}
              />
              <div className="relative flex flex-col items-center">
                {isClosed ? (
                  <>
                    <p className="text-sm font-semibold uppercase tracking-[0.28em] text-gold">
                      Session closed
                    </p>
                    <p className="mt-6 font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.15] text-ink">
                      That&apos;s a wrap.
                    </p>
                    <p className="mt-5 text-xl text-muted">
                      Thanks for sharing your thinking with the room.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.2] text-ink">
                      {session.title}
                    </p>
                    <p className="mt-5 text-2xl text-muted">Waiting for the next thought…</p>
                  </>
                )}
              </div>
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
