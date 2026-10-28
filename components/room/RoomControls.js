"use client";

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
  "inline-flex h-10 w-10 items-center justify-center rounded-pill text-muted transition-colors hover:bg-gold/10 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted";

export default function RoomControls({
  isAdmin,
  sessionCode,
  currentId,
  current,
  onCurrentChange,
  targetRef,
}) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [open, setOpen] = useState(false);
  const mountedRef = useRef(true);

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

  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (pending) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
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
  }, [isAdmin, pending, sessionCode, currentId]);

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-5">
      {error ? (
        <p
          role="alert"
          className="pointer-events-auto max-w-xl rounded-control border border-crimson/40 bg-crimson/15 px-3 py-2 text-center text-base text-ink"
        >
          {error}
        </p>
      ) : null}
      {showToolbar ? (
        <div
          role="toolbar"
          aria-label="Presentation controls"
          aria-keyshortcuts="ArrowLeft ArrowRight"
          className="pointer-events-auto flex items-center gap-1 rounded-pill border border-gold/15 bg-surface/70 p-1.5 text-ink shadow-lg backdrop-blur-md motion-safe:transition-all motion-safe:duration-200"
        >
          <button
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
          </button>
          <button
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
          </button>
          <button
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
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => run("hide")}
            disabled={busy || !hasCurrent}
            aria-busy={busy || undefined}
            aria-label="Hide contribution from presentation"
            title="Hide from presentation"
          >
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          </button>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-gold/15" />
          <Link
            href="/admin"
            className={controlClass}
            aria-label="Return to dashboard"
            title="Return to dashboard"
          >
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </Link>
          <button
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
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => setOpen(false)}
            aria-label="Hide controls"
            title="Hide controls"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show presentation controls"
          aria-expanded="false"
          title="Show presentation controls"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-pill border border-gold/15 bg-surface/70 text-muted shadow-lg backdrop-blur-md transition-colors hover:bg-gold/10 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
