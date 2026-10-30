"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

export function MagneticButton({ children, className = "", href, ...props }) {
  const reducedMotion = useReducedMotion();
  const ref = useRef(null);

  const motionProps = {
    ref,
    whileHover: reducedMotion ? undefined : { y: -2, scale: 1.015 },
    whileTap: reducedMotion ? undefined : { scale: 0.975 },
    transition: {
      type: "spring",
      stiffness: 320,
      damping: 24,
    },
    className,
    ...props,
  };

  if (href) {
    return (
      <motion.a href={href} {...motionProps}>
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button type="button" {...motionProps}>
      {children}
    </motion.button>
  );
}

export default MagneticButton;
