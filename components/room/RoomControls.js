'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  EyeOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

const controlClass =
  'inline-flex items-center gap-2 rounded-control border border-cream/15 bg-cream/5 px-3 py-2 text-base font-medium text-cream transition-colors hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cream/5';

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
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  async function run(action) {
    if (pending) return;
    setPending(action);
    setError(null);
    // submissionId travels only with actions that name a submission.
    const needsId = action === 'togglePin' || action === 'hide' || action === 'set';
    try {
      const res = await fetch('/api/presentation', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
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
      setError('Could not reach the server. Check the connection and try again.');
    } finally {
      if (mountedRef.current) setPending(null);
    }
  }

  // Keyboard shortcuts live only in aria attributes and this handler; no
  // visible clutter on the projector screen.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (pending) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        if (!currentId) return;
        event.preventDefault();
        run('prev');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        run('next');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, pending, sessionCode, currentId]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await targetRef?.current?.requestFullscreen();
    } catch {
      setError('Fullscreen was blocked by the browser.');
    }
  }

  if (!isAdmin) return null;

  const busy = Boolean(pending);
  const hasCurrent = Boolean(current) && Boolean(currentId);

  return (
    <div
      role="toolbar"
      aria-label="Presentation controls"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
    >
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-card border border-cream/10 bg-ink/90 p-2 text-cream shadow-lg backdrop-blur">
        <button
          type="button"
          className={controlClass}
          onClick={() => run('prev')}
          disabled={busy || !hasCurrent}
          aria-busy={busy || undefined}
          aria-keyshortcuts="ArrowLeft"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => run('next')}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-keyshortcuts="ArrowRight"
        >
          Next
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(controlClass, current?.is_pinned && 'border-lime/40 text-lime')}
          onClick={() => run('togglePin')}
          disabled={busy || !hasCurrent}
          aria-busy={busy || undefined}
        >
          {current?.is_pinned ? (
            <PinOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Pin className="h-5 w-5" aria-hidden="true" />
          )}
          {current?.is_pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => run('hide')}
          disabled={busy || !hasCurrent}
          aria-busy={busy || undefined}
        >
          <EyeOff className="h-5 w-5" aria-hidden="true" />
          Hide
        </button>
        <Link href="/admin" className={cn(controlClass, 'no-underline')}>
          Return to dashboard
        </Link>
        <button
          type="button"
          className={controlClass}
          onClick={toggleFullscreen}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {isFullscreen ? (
            <Minimize2 className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-5 w-5" aria-hidden="true" />
          )}
          {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mx-auto mt-2 max-w-xl rounded-control border border-coral/40 bg-coral/15 px-3 py-2 text-center text-base text-cream"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
