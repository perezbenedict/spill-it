"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

const activeDialogs = [];
const originalInert = new Map();
let originalOverflow;

function updateBackground() {
  const top = activeDialogs.at(-1);
  if (!top) {
    for (const [element, inert] of originalInert) {
      if (inert) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }
    originalInert.clear();
    document.body.style.overflow = originalOverflow;
    return;
  }
  for (const element of document.body.children) {
    if (!originalInert.has(element)) originalInert.set(element, element.hasAttribute("inert"));
    if (element.contains(top)) element.removeAttribute("inert");
    else element.setAttribute("inert", "");
  }
}

function canFocus(element) {
  if (!(element instanceof HTMLElement) || element.matches(":disabled, input[type='hidden']")) return false;
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor);
    if (ancestor.hidden || ancestor.hasAttribute("inert") || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

function focusableElements(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((element) => element.tabIndex >= 0 && canFocus(element));
}

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
    if (!open || !mounted) return undefined;

    const previouslyFocused = returnFocusRef.current || document.activeElement;
    const previouslyFocusedId =
      previouslyFocused instanceof HTMLElement ? previouslyFocused.id : "";
    const node = dialogRef.current;
    if (!node) return undefined;
    if (activeDialogs.length === 0) originalOverflow = document.body.style.overflow;
    activeDialogs.push(node);
    updateBackground();
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      if (activeDialogs.at(-1) !== node) return;
      // The user may already be filling a different field before this frame.
      if (node.contains(document.activeElement) && document.activeElement !== node) return;
      const preferredInput = node?.querySelector("[data-dialog-autofocus]");
      const focusables = focusableElements(node);
      const firstInput = focusables.find((element) => element.matches("input, textarea, select"));
      (preferredInput && canFocus(preferredInput) ? preferredInput : firstInput || focusables[0] || node).focus();
    });

    function onKeyDown(event) {
      if (activeDialogs.at(-1) !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = focusableElements(node);
      if (focusables.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && (document.activeElement === first || !focusables.includes(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !focusables.includes(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event) {
      if (activeDialogs.at(-1) === node && !node.contains(event.target)) {
        (focusableElements(node)[0] || node).focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      window.cancelAnimationFrame(focusFrame);
      activeDialogs.splice(activeDialogs.indexOf(node), 1);
      updateBackground();
      window.setTimeout(() => {
        const focusTarget =
          previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected
            ? previouslyFocused
            : previouslyFocusedId
              ? document.getElementById(previouslyFocusedId)
              : null;
        if (
          (!openRef.current || !node.isConnected) &&
          focusTarget instanceof HTMLElement &&
          focusTarget.isConnected &&
          canFocus(focusTarget) &&
          (!activeDialogs.length || activeDialogs.at(-1).contains(focusTarget))
        ) {
          focusTarget.focus();
        }
      }, reduceMotionRef.current ? 0 : 220);
    };
  }, [open, mounted]);

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
