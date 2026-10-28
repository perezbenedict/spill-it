'use client';

import { useId } from "react";

export default function Emblem({ className }) {
  const uid = useId();
  const id = (name) => `${uid}${name}`;

  return (
    <span role="img" aria-label="Spill It emblem" className={`inline-block ${className ?? ""}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <defs>
          <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5DFA6" />
            <stop offset="55%" stopColor="#E8C77A" />
            <stop offset="100%" stopColor="#B8862F" />
          </linearGradient>
          <radialGradient id={id("globeFill")} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#1E3A6B" />
            <stop offset="100%" stopColor="#0C1A38" />
          </radialGradient>
          <linearGradient id={id("flameFill")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D8324C" />
            <stop offset="100%" stopColor="#B3223A" />
          </linearGradient>
          <clipPath id={id("globeClip")}>
            <circle cx="60" cy="60" r="35" />
          </clipPath>
        </defs>
        <circle cx="60" cy="60" r="56" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="1.6" />
        <circle cx="60" cy="60" r="50.5" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="0.8" opacity="0.65" />
        <circle cx="60" cy="60" r="35" fill={`url(#${id("globeFill")})`} />
        <g clipPath={`url(#${id("globeClip")})`} fill="none" stroke="#C9D1DE" strokeWidth="0.9" opacity="0.65">
          <circle cx="60" cy="60" r="35" />
          <ellipse cx="60" cy="60" rx="12" ry="35" />
          <ellipse cx="60" cy="60" rx="24" ry="35" />
          <line x1="25" y1="60" x2="95" y2="60" />
          <path d="M31 42 H89" />
          <path d="M31 78 H89" />
        </g>
        <path
          d="M60 26 C 69 43, 78 52, 75 67 C 72.5 79, 65 87, 60 90 C 55 87, 47.5 79, 45 67 C 42 52, 51 43, 60 26 Z"
          fill={`url(#${id("flameFill")})`}
        />
        <path
          d="M60 49 C 64.5 59, 69 63.5, 67 71 C 65.4 77, 62 80, 60 81 C 58 80, 54.6 77, 53 71 C 51 63.5, 55.5 59, 60 49 Z"
          fill={`url(#${id("gold")})`}
          opacity="0.95"
        />
      </svg>
    </span>
  );
}
