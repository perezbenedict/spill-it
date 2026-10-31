"use client";

import { Printer } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Button from "@/components/ui/Button";

export default function PrintButton({ className }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -2 }}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={className}
    >
      <Button variant="secondary" onClick={() => window.print()} className="w-full sm:w-auto">
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print poster
      </Button>
    </motion.div>
  );
}
