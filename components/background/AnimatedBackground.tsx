"use client";

import React, { useEffect, useRef, useState } from "react";

type AnimatedBackgroundProps = {
  children: React.ReactNode;
  className?: string;
};

const CSS = `
.ab-root {
  position: relative;
  min-height: 100vh;
  width: 100%;
  isolation: isolate;
  overflow-x: clip;
  background: linear-gradient(180deg, #24113F 0%, #160D2B 100%);
  color: inherit;
}

.ab-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.ab-base {
  z-index: 0;
  background:
    radial-gradient(1200px 700px at 50% -5%, rgba(109, 74, 184, 0.4), transparent 70%),
    linear-gradient(180deg, #24113F 0%, #301A50 45%, #160D2B 100%);
}

.ab-radials {
  z-index: 1;
  background:
    radial-gradient(900px 600px at 15% 20%, rgba(124, 92, 200, 0.24), transparent 72%),
    radial-gradient(800px 500px at 85% 15%, rgba(167, 139, 250, 0.2), transparent 70%),
    radial-gradient(700px 500px at 50% 85%, rgba(196, 181, 253, 0.14), transparent 72%),
    radial-gradient(600px 400px at 80% 75%, rgba(74, 42, 107, 0.28), transparent 70%),
    radial-gradient(500px 350px at 20% 70%, rgba(48, 26, 80, 0.32), transparent 70%);
  mix-blend-mode: screen;
  opacity: 0.95;
}

.ab-ambient {
  position: fixed;
  pointer-events: none;
  z-index: 2;
  border-radius: 50%;
  filter: blur(90px);
  will-change: transform;
}

.ab-ambient--a {
  width: 62vmax;
  height: 62vmax;
  top: -22vmax;
  left: -18vmax;
  background: radial-gradient(circle, rgba(167, 139, 250, 0.55), transparent 65%);
  opacity: 0.38;
  animation: ab-drift-a 95s ease-in-out infinite;
}

.ab-ambient--b {
  width: 68vmax;
  height: 68vmax;
  bottom: -26vmax;
  right: -22vmax;
  background: radial-gradient(circle, rgba(109, 74, 184, 0.55), transparent 65%);
  opacity: 0.34;
  animation: ab-drift-b 115s ease-in-out infinite;
}

.ab-ambient--c {
  width: 52vmax;
  height: 52vmax;
  top: 38%;
  left: 42%;
  background: radial-gradient(circle, rgba(196, 181, 253, 0.4), transparent 65%);
  opacity: 0.26;
  animation: ab-drift-c 80s ease-in-out infinite;
}

@keyframes ab-drift-a {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(9vmax, 6vmax) scale(1.08); }
  66% { transform: translate(-6vmax, 11vmax) scale(0.95); }
}

@keyframes ab-drift-b {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-11vmax, -9vmax) scale(1.12); }
}

@keyframes ab-drift-c {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(7vmax, -7vmax) scale(1.06); }
}

.ab-pointer {
  z-index: 3;
  background: radial-gradient(460px circle at var(--px, 50%) var(--py, 50%), rgba(196, 181, 253, 0.18), transparent 70%);
  mix-blend-mode: screen;
}

.ab-svg {
  position: fixed;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.4;
}

.ab-svg-orbit {
  transform-origin: 500px 500px;
  animation: ab-rotate 180s linear infinite;
}

@keyframes ab-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ab-grain {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
}

.ab-content {
  position: relative;
  z-index: 10;
}

@media (prefers-reduced-motion: reduce) {
  .ab-ambient,
  .ab-svg-orbit {
    animation: none !important;
  }
}
`;

export default function AnimatedBackground({ children, className }: AnimatedBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isTouch, setIsTouch] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const detect = () => {
      const touch =
        mq.matches ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
        ("ontouchstart" in window);
      setIsTouch(touch);
    };
    detect();
    const onChange = () => detect();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (isTouch) return;
    const root = rootRef.current;
    if (!root) return;

    const onMove = (e: PointerEvent) => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          root.style.setProperty("--px", `${x}%`);
          root.style.setProperty("--py", `${y}%`);
        }
        rafRef.current = null;
      });
    };

    const onLeave = () => {
      root.style.setProperty("--px", "50%");
      root.style.setProperty("--py", "50%");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });
    document.addEventListener("mouseleave", onLeave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isTouch]);

  const uid = React.useId();
  const gradId = `ab-grad-${uid.replace(/:/g, "")}`;

  return (
    <div
      ref={rootRef}
      className={`ab-root ${className ?? ""}`.trim()}
      style={{ "--px": "50%", "--py": "50%" } as React.CSSProperties}
    >
      <style>{CSS}</style>

      <div className="ab-layer ab-base" aria-hidden="true" />
      <div className="ab-layer ab-radials" aria-hidden="true" />

      <div className="ab-ambient ab-ambient--a" aria-hidden="true" />
      <div className="ab-ambient ab-ambient--b" aria-hidden="true" />
      <div className="ab-ambient ab-ambient--c" aria-hidden="true" />

      {!isTouch && <div className="ab-layer ab-pointer" aria-hidden="true" />}

      <svg
        className="ab-svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#6D4AB8" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <g className="ab-svg-orbit" stroke={`url(#${gradId})`} fill="none">
          <circle cx="500" cy="500" r="120" strokeWidth="0.8" opacity="0.5" />
          <circle cx="500" cy="500" r="200" strokeWidth="0.7" opacity="0.4" />
          <circle cx="500" cy="500" r="280" strokeWidth="0.6" opacity="0.3" />
          <circle cx="500" cy="500" r="360" strokeWidth="0.5" opacity="0.22" />
        </g>
        <g stroke="#A78BFA" strokeWidth="0.6" opacity="0.2" fill="none">
          <ellipse cx="500" cy="500" rx="420" ry="160" transform="rotate(-18 500 500)" />
          <ellipse cx="500" cy="500" rx="380" ry="120" transform="rotate(32 500 500)" />
          <ellipse cx="500" cy="500" rx="460" ry="90" transform="rotate(-52 500 500)" />
        </g>
        <g stroke="#C4B5FD" strokeWidth="0.7" opacity="0.22" fill="none">
          <path d="M 0 300 Q 250 200 500 320 T 1000 280" />
          <path d="M 0 700 Q 300 600 500 720 T 1000 680" />
          <path d="M 100 0 Q 200 250 120 500 T 180 1000" />
        </g>
        <g stroke="#A78BFA" strokeWidth="0.9" opacity="0.14" fill="none">
          <circle cx="150" cy="200" r="60" />
          <circle cx="850" cy="250" r="90" />
          <circle cx="200" cy="800" r="70" />
          <circle cx="820" cy="780" r="50" />
        </g>
        <g fill="#C4B5FD" opacity="0.28">
          <circle cx="500" cy="500" r="2.2" />
          <circle cx="320" cy="340" r="1.6" />
          <circle cx="710" cy="620" r="1.6" />
          <circle cx="180" cy="620" r="1.4" />
          <circle cx="820" cy="400" r="1.4" />
        </g>
      </svg>

      <div className="ab-grain" aria-hidden="true" />

      <div className="ab-content">{children}</div>
    </div>
  );
}
