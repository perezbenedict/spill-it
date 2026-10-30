"use client";

import { RevealLine } from "./Reveal";

export function StaggerText({ text, className = "" }) {
  const lines = Array.isArray(text) ? text : [text];

  return (
    <div className={className}>
      {lines.map((line, i) => (
        <RevealLine key={i} delay={i * 0.09}>
          {line}
        </RevealLine>
      ))}
    </div>
  );
}

export default StaggerText;
