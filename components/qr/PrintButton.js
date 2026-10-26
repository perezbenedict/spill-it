"use client";

import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";

export default function PrintButton({ className }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className={className}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      Print poster
    </Button>
  );
}
