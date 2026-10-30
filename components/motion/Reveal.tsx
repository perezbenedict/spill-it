"use client";

import { motion, useReducedMotion } from "framer-motion";

export function RevealLine({ children, delay = 0, className = "" }) {
  const reducedMotion = useReducedMotion();

  return (
    <span className={`block overflow-hidden ${className}`}>
      <motion.span
        className="block"
        initial={reducedMotion ? false : { y: "110%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: reducedMotion ? 0 : 0.85,
          delay: reducedMotion ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default RevealLine;
