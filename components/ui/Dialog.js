"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function Dialog({ open, onClose, title, description, className, children }) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(null);
  const openRef = useRef(open);
  const reduceMotionRef = useRef(reduceMotion);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  openRef.current = open;
  reduceMotionRef.current = reduceMotion;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) return undefined;

    function rememberTrigger(event) {
      if (event.target instanceof HTMLElement) returnFocusRef.current = event.target;
    }

    document.addEventListener("focusin", rememberTrigger, true);
    document.addEventListener("pointerdown", rememberTrigger, true);
    return () => {
      document.removeEventListener("focusin", rememberTrigger, true);
      document.removeEventListener("pointerdown", rememberTrigger, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = returnFocusRef.current || document.activeElement;
    const previouslyFocusedId =
      previouslyFocused instanceof HTMLElement ? previouslyFocused.id : "";
    const node = dialogRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const preferredInput = node?.querySelector("[data-dialog-autofocus]");
      const firstInput = node?.querySelector(
        "input:not([disabled]), textarea:not([disabled]), select:not([disabled])"
      );
      const firstFocusable = node?.querySelector(FOCUSABLE);
      (preferredInput || firstInput || firstFocusable || node)?.focus();
    });

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = node?.querySelectorAll(FOCUSABLE);
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        const focusTarget =
          previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected
            ? previouslyFocused
            : previouslyFocusedId
              ? document.getElementById(previouslyFocusedId)
              : null;
        if (
          !openRef.current &&
          focusTarget instanceof HTMLElement &&
          focusTarget.isConnected
        ) {
          focusTarget.focus();
        }
      }, reduceMotionRef.current ? 0 : 220);
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <motion.div
            className="fixed inset-0 bg-midnight/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            onClick={() => onCloseRef.current?.()}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              "relative max-h-[min(88vh,48rem)] w-full max-w-md overflow-y-auto rounded-[1.35rem] border border-gold/20 bg-[linear-gradient(155deg,rgba(49,29,79,0.98),rgba(25,14,45,0.99))] p-5 shadow-[0_32px_100px_-42px_rgba(167,139,250,0.9)] sm:p-6",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
              className
            )}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
            {title ? (
              <h2 id={titleId} className="pr-4 font-display text-xl font-semibold leading-tight text-ink">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
            <div className="mt-4">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
