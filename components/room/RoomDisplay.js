"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Pin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import RoomControls from "@/components/room/RoomControls";
import RoomEngagement from "@/components/platform/RoomEngagement";
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
  const contentRef = useRef(null);
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
  // `currentRow` is the latest server-confirmed pointer target. `displayedRow`
  // is deliberately separate so a short exit/anticipation/reveal sequence can
  // run without delaying or mutating the underlying presentation state.
  const [displayedRow, setDisplayedRow] = useState(() =>
    isVisible(initialCurrentSubmission) ? initialCurrentSubmission : null
  );
  const [presentationPhase, setPresentationPhase] = useState("settled");
  const [transitionVersion, setTransitionVersion] = useState(0);
  const [connection, setConnection] = useState("connecting");
  const [sessionStatus, setSessionStatus] = useState(session.status);
  const [pollPresented, setPollPresented] = useState(false);
  const currentIdRef = useRef(currentId);
  const displayedIdRef = useRef(displayedRow?.id ?? null);
  const transitionRef = useRef({ version: 0, timers: [] });

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  useEffect(() => {
    displayedIdRef.current = displayedRow?.id ?? null;
  }, [displayedRow]);

  const displayedRowId = displayedRow?.id ?? null;
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [displayedRowId]);

  useEffect(
    () => () => {
      for (const timer of transitionRef.current.timers) clearTimeout(timer);
    },
    []
  );

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
    if (currentRow?.id === currentId && isVisible(currentRow)) {
      return undefined;
    }
    // Never carry a previous contribution across a pointer change while the
    // authoritative row is being refetched.
    setCurrentRow(null);
    fetch(pollUrl, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.currentId !== currentId) return;
        const row = data?.submission ?? null;
        if (row) rowsRef.current.set(row.id, row);
        setCurrentRow(row?.id === currentId && isVisible(row) ? row : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentId, currentRow, pollUrl]);

  const currentRowId = currentRow?.id ?? null;

  // A monotonic version invalidates every older timer. Rapid Send to Screen
  // actions therefore collapse to the newest server-confirmed ID instead of
  // queueing obsolete reveals.
  useEffect(() => {
    const nextId = currentRowId;
    if (nextId === displayedIdRef.current) {
      if (nextId) setDisplayedRow(currentRow);
      return undefined;
    }

    const version = transitionRef.current.version + 1;
    transitionRef.current.version = version;
    for (const timer of transitionRef.current.timers) clearTimeout(timer);
    transitionRef.current.timers = [];
    setTransitionVersion(version);

    if (reduceMotion) {
      setDisplayedRow(currentRow);
      setPresentationPhase("settled");
      return undefined;
    }

    const hadPrevious = Boolean(displayedIdRef.current);
    setPresentationPhase(hadPrevious ? "exiting" : nextId ? "anticipating" : "settled");
    setDisplayedRow(null);

    if (!nextId) {
      const settleTimer = setTimeout(() => {
        if (transitionRef.current.version === version) setPresentationPhase("settled");
      }, hadPrevious ? 320 : 0);
      transitionRef.current.timers = [settleTimer];
      return undefined;
    }

    const anticipationAt = hadPrevious ? 300 : 0;
    const revealAt = anticipationAt + 220;
    const anticipationTimer = setTimeout(() => {
      if (transitionRef.current.version === version) setPresentationPhase("anticipating");
    }, anticipationAt);
    const revealTimer = setTimeout(() => {
      if (transitionRef.current.version !== version) return;
      setPresentationPhase("revealing");
      setDisplayedRow(currentRow);
    }, revealAt);
    const settleTimer = setTimeout(() => {
      if (transitionRef.current.version === version) setPresentationPhase("settled");
    }, revealAt + 620);
    transitionRef.current.timers = [anticipationTimer, revealTimer, settleTimer];

    return () => {
      // The next effect invocation owns cancellation through the version and
      // timer list. Unmount cleanup is handled separately above.
    };
  }, [currentRowId, currentRow, reduceMotion]);

  // Polling replaces Supabase realtime: the pointer plus its submission are
  // refetched every few seconds, paused while the tab is hidden. The
  // "Reconnecting…" line only shows after a poll actually fails.
  useEffect(() => {
    let disposed = false;
    let timeoutId = null;
    let inFlight = false;
    let controller = null;

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
        const response = await fetch(pollUrl, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = response.ok ? await response.json() : null;
        if (disposed || !data) throw new Error("poll failed");
        setConnection("live");
        if (data.status) setSessionStatus(data.status);
        const nextId = data.currentId ?? null;
        const row = data.submission ?? null;
        if (row) rowsRef.current.set(row.id, row);
        setCurrentId(nextId);
        if (!nextId) setCurrentRow(null);
        else if (row && row.id === nextId) setCurrentRow(isVisible(row) ? row : null);
        else setCurrentRow(null);
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
  }, [pollUrl]);

  const isClosed = sessionStatus === "closed";
  const statusLine =
    sessionStatus === "paused"
      ? "Submissions paused"
      : isClosed
        ? "This conversation has been wrapped"
        : null;

  return (
    <div
      ref={screenRef}
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-midnight text-ink"
      data-presentation-phase={presentationPhase}
      data-presentation-transition-version={transitionVersion}
      data-current-contribution-id={displayedRow?.id ?? ""}
      data-server-contribution-id={currentId ?? ""}
    >
      {/* Layered ambient light moves on transforms only and becomes static
          when the viewer prefers reduced motion. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[12%] opacity-60"
        style={{
          background:
            "radial-gradient(60% 55% at 22% 18%, rgba(167,139,250,0.20), transparent 60%), radial-gradient(55% 50% at 80% 82%, rgba(109,74,184,0.22), transparent 60%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: ["-2%", "3%", "-2%"], y: ["-1%", "2%", "-1%"], scale: [1, 1.04, 1] }
        }
        transition={{ duration: 28, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(76vh,52rem)] w-[min(90vw,72rem)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(closest-side, rgba(196,181,253,0.12), rgba(109,74,184,0.05) 52%, transparent 76%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { opacity: [0.2, 0.34, 0.2], scale: [0.98, 1.035, 0.98] }
        }
        transition={{ duration: 16, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[8%] top-[18%] h-48 w-48 rounded-full border border-gold/10 opacity-50 sm:h-72 sm:w-72"
        animate={reduceMotion ? undefined : { rotate: [0, 360], opacity: [0.28, 0.5, 0.28] }}
        transition={{ rotate: { duration: 72, ease: "linear", repeat: Infinity }, opacity: { duration: 14, ease: "easeInOut", repeat: Infinity } }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[12%] right-[7%] h-32 w-32 rounded-full border border-dashed border-gold/10 opacity-40 sm:h-52 sm:w-52"
        animate={reduceMotion ? undefined : { rotate: [360, 0], y: [0, -10, 0] }}
        transition={{ rotate: { duration: 88, ease: "linear", repeat: Infinity }, y: { duration: 12, ease: "easeInOut", repeat: Infinity } }}
      />

      <header className="relative z-10 flex flex-col gap-4 px-5 pt-5 sm:px-8 sm:pt-7 lg:px-10 lg:pt-8">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
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
          {isAdmin ? (
            <nav className="shrink-0" aria-label="Admin navigation">
              <Link
                href="/admin"
                className="group inline-flex min-h-9 items-center rounded-pill border border-gold/15 bg-surface/60 px-2.5 py-1.5 text-muted shadow-sm backdrop-blur-md transition-[border-color,color,background-color,transform] duration-200 hover:border-gold/35 hover:bg-gold/10 hover:text-gold motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                aria-label="Back to dashboard"
                title="Back to dashboard"
              >
                <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                <span className="hidden whitespace-nowrap pl-1.5 text-xs sm:inline">
                  Back to Dashboard
                </span>
              </Link>
            </nav>
          ) : null}
        </div>

        <div className="flex min-h-12 flex-col items-center justify-center gap-1.5 text-center sm:min-h-16">
          <AnimatePresence mode="wait" initial={false}>
            {displayedRow ? (
              <motion.div
                key={`topic-${displayedRow.id}`}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.45, ease: REVEAL_EASE }}
                className="min-w-0 max-w-[42ch] [overflow-wrap:anywhere]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold sm:text-sm sm:tracking-[0.28em]">
                  Now discussing
                </p>
                <p className="mt-1.5 font-display text-[clamp(1.125rem,2vw,1.75rem)] leading-snug text-gold-light">
                  {session.topic?.trim() || session.title}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            {statusLine ? (
              <motion.p
                key={`status-${sessionStatus}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.4, ease: REVEAL_EASE }}
                className="max-w-[32ch] text-balance text-sm leading-relaxed text-muted sm:text-base"
              >
                {statusLine}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {connection === "reconnecting" ? (
            <p role="status" className="mt-1 inline-flex items-center justify-center gap-2 text-sm text-ink">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-pill bg-crimson-bright motion-safe:animate-pulse"
              />
              Reconnecting…
            </p>
          ) : null}
        </div>
      </header>

      <main ref={contentRef} tabIndex={0} aria-label="Presentation content. Scroll to read long contributions." style={{ marginBottom: isAdmin ? 'var(--room-controls-height, 5rem)' : 0 }} className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-6 sm:px-8 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <RoomEngagement sessionCode={sessionCode} onPollChange={setPollPresented} />
        <div className={pollPresented ? 'hidden' : 'contents'}>
        <AnimatePresence initial={false}>
          {(presentationPhase === "anticipating" || presentationPhase === "revealing") && !reduceMotion ? (
            <motion.div
              key={`sweep-${transitionVersion}`}
              aria-hidden="true"
              data-presentation-sweep="true"
              className="pointer-events-none absolute inset-y-[16%] left-0 z-0 w-1/3 bg-gradient-to-r from-transparent via-gold/15 to-transparent blur-2xl"
              initial={{ opacity: 0, x: "-130%" }}
              animate={{ opacity: [0, 0.9, 0], x: "430%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.58, ease: REVEAL_EASE }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {displayedRow ? (
            <motion.div
              key={displayedRow.id}
              initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.965 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -22, scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.58, ease: REVEAL_EASE }}
              className="relative z-10 my-auto flex w-full shrink-0 flex-col items-center text-center"
              data-presented-contribution={displayedRow.id}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[140%] w-[min(92vw,64rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(167,139,250,0.18), rgba(109,74,184,0.06) 52%, transparent 76%)",
                }}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.72, ease: REVEAL_EASE }}
              />
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Badge variant="info" className="px-3 py-1 text-sm uppercase tracking-[0.2em]">
                  {categoryLabel(displayedRow.category)}
                </Badge>
                {displayedRow.is_pinned ? (
                  <span className="inline-flex items-center gap-1.5 text-sm uppercase tracking-[0.2em] text-gold">
                    <Pin className="h-4 w-4" aria-hidden="true" />
                    Pinned for discussion
                  </span>
                ) : null}
              </div>
              <p className="mt-6 max-w-full text-[clamp(0.9375rem,1.4vw,1.25rem)] font-semibold uppercase tracking-[0.24em] text-gold [overflow-wrap:anywhere]">
                {displayedRow.nickname}
              </p>
              <blockquote
                className="mt-8 w-full text-balance font-display text-ink [overflow-wrap:anywhere]"
                style={quoteStyle(displayedRow.content)}
              >
                {displayedRow.content}
              </blockquote>
            </motion.div>
          ) : presentationPhase === "settled" ? (
            <motion.div
              key={isClosed ? "ended" : "waiting"}
              initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: REVEAL_EASE }}
              className="relative my-auto flex w-full shrink-0 flex-col items-center text-center [overflow-wrap:anywhere]"
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
                    <motion.p
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.4, ease: REVEAL_EASE }}
                      className="text-xs font-semibold uppercase tracking-[0.24em] text-gold sm:text-sm sm:tracking-[0.28em]"
                    >
                      Session closed
                    </motion.p>
                    <p className="mt-5 font-display text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.15] text-ink sm:mt-6">
                      That&apos;s a wrap.
                    </p>
                    <p className="mt-4 max-w-[34ch] text-balance text-base leading-relaxed text-muted sm:mt-5 sm:text-xl">
                      Thanks for sharing your thinking with the room.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.2] text-ink">
                      {session.topic?.trim() || session.title}
                    </p>
                    <p className="mt-5 text-lg text-muted sm:text-2xl">Waiting for the next thought…</p>
                  </>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      </main>

      <RoomControls
        sessionId={session.id}
        isAdmin={isAdmin}
        sessionCode={session.public_code}
        currentId={currentId}
        current={displayedRow}
        onCurrentChange={handleCurrentChange}
        targetRef={screenRef}
      />
    </div>
  );
}
