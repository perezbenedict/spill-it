import { useReducedMotion as _useReducedMotion } from "framer-motion";

export const motionTokens = {
  duration: {
    fast: 0.18,
    normal: 0.35,
    reveal: 0.7,
    cinematic: 1.1,
  },
  easing: [0.22, 1, 0.36, 1] as const,
  stagger: 0.09,
};

export const useReducedMotion = _useReducedMotion;
