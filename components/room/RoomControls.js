"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  EyeOff,
  LayoutDashboard,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

// Icon-sized chrome: the projector image stays clean, so labels live in
// aria-label/title rather than on the button face.
const controlClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-pill text-muted transition-[color,background-color,transform] duration-200 hover:bg-gold/10 hover:text-gold motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:bg-transparent disabled:hover:text-muted disabled:active:scale-100";

export default function RoomControls({
  isAdmin,
  sessionCode,
  sessionId,
  currentId,
  current,
  onCurrentChange,
  targetRef,
}) {
  const reduceMotion = useReducedMotion();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [open, setOpen] = useState(false);
  const mountedRef = useRef(true);
  const controlsRef = useRef(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const stage = targetRef?.current;
    if (!isAdmin || !controls || !stage) return undefined;
    const reserve = () => stage.style.setProperty('--room-controls-height', `${Math.ceil(controls.getBoundingClientRect().height) + 12}px`);
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(controls);
    return () => { observer.disconnect(); stage.style.removeProperty('--room-controls-height'); };
  }, [isAdmin, targetRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function run(action) {
    if (pending) return;
    setPending(action);
    setError(null);
    const needsId = action === "togglePin" || action === "hide" || action === "set";
    try {
      const res = await fetch("/api/presentation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionCode,
          action,
          ...(needsId ? { submissionId: currentId } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      onCurrentChange?.(body?.currentId ?? null);
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      if (mountedRef.current) setPending(null);
    }
  }

  async function advanceQueued() {
    if (pending || !sessionId) return;
    setPending("advance");
    setError(null);
    try {
      const url = `/api/platform/admin/${encodeURIComponent(sessionId)}`;
      const response = await fetch(url, { cache: "no-store" });
      const state = await response.json();
      if (!response.ok) throw new Error("Could not synchronize the queue.");
      const next = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", expectedRevision: state.revision }),
      });
      if (!next.ok) throw new Error(next.status === 409
        ? "Another moderator changed the queue. Try again after synchronization."
        : "Could not project the next queued contribution.");
    } catch (error) {
      setError(error.message || "Could not reach the server.");
    } finally {
      if (mountedRef.current) setPending(null);
    }
  }

  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || pending) return;
      const target = event.target instanceof Element ? event.target : null;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (target?.closest('input, textarea, select, button, a, [role="button"], [role="dialog"], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])')) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        advanceQueued();
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        run("clear");
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setOpen(value => !value);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      }
      if (event.key === "ArrowLeft") {
        if (!currentId) return;
        event.preventDefault();
        run("prev");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        run("next");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, pending, sessionCode, sessionId, currentId]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await targetRef?.current?.requestFullscreen();
    } catch {
      setError("Fullscreen was blocked by the browser.");
    }
  }

  if (!isAdmin) return null;

  const busy = Boolean(pending);
  const hasCurrent = Boolean(current) && Boolean(currentId);
  // Errors force the chrome open so failures are never hidden from the operator.
  const showToolbar = open || Boolean(error);

  return (
    <div ref={controlsRef} data-presenter-controls className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-5">
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="room-control-error"
            role="alert"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="pointer-events-auto max-w-xl rounded-control border border-crimson/40 bg-crimson/15 px-3 py-2 text-center text-base text-ink"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false} mode="wait">
        {showToolbar ? (
          <motion.div
            key="room-toolbar"
            role="toolbar"
            aria-label="Presentation controls"
            aria-keyshortcuts="ArrowLeft ArrowRight"
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl border border-gold/15 bg-surface/70 p-1.5 text-ink shadow-lg backdrop-blur-md sm:rounded-pill [&>button]:shrink-0 [&>a]:shrink-0"
          >
          <button type="button" className={controlClass} onClick={advanceQueued} disabled={busy || !sessionId} aria-label="Project next queued contribution" title="Next queued (N)" aria-keyshortcuts="N">
            <span aria-hidden="true" className="text-xs font-semibold">Next</span>
          </button>
          <motion.button
            type="button"
            className={controlClass}
            onClick={() => run("prev")}
            disabled={busy || !hasCurrent}
            aria-busy={busy || undefined}
            aria-keyshortcuts="ArrowLeft"
            aria-label="Previous contribution"
            title="Previous contribution (←)"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </motion.button>
          <motion.button
            type="button"
            className={controlClass}
            onClick={() => run("next")}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-keyshortcuts="ArrowRight"
            aria-label="Next contribution"
            title="Next contribution (→)"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </motion.button>
          <motion.button
            type="button"
            className={cn(controlClass, current?.is_pinned && "bg-gold/15 text-gold")}
            onClick={() => run("togglePin")}
            disabled={busy || !hasCurrent}
            aria-busy={busy || undefined}
            aria-label={current?.is_pinned ? "Unpin contribution" : "Pin contribution"}
            title={current?.is_pinned ? "Unpin for discussion" : "Pin for discussion"}
          >
            {current?.is_pinned ? (
              <PinOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Pin className="h-5 w-5" aria-hidden="true" />
            )}
          </motion.button>
          <motion.button
            type="button"
            className={controlClass}
            onClick={() => run("hide")}
            disabled={busy || !hasCurrent}
            aria-busy={busy || undefined}
            aria-label="Hide contribution from presentation"
            title="Hide from presentation"
          >
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          </motion.button>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-gold/15" />
          <Link
            href="/admin"
            className={controlClass}
            aria-label="Return to dashboard"
            title="Return to dashboard"
          >
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </Link>
          <motion.button
            type="button"
            className={controlClass}
            onClick={toggleFullscreen}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-5 w-5" aria-hidden="true" />
            )}
          </motion.button>
          <motion.button
            type="button"
            className={controlClass}
            onClick={() => setOpen(false)}
            aria-label="Hide controls"
            title="Hide controls"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="room-toolbar-trigger"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Show presentation controls"
            aria-expanded="false"
            title="Show presentation controls"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-pill border border-gold/15 bg-surface/70 text-muted shadow-lg backdrop-blur-md transition-[color,background-color,transform] duration-200 hover:bg-gold/10 hover:text-gold motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
