"use client";

import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import Button from "@/components/ui/Button";

const RESET_MS = 2500;

export default function CopyJoinLink({ joinUrl }) {
  const [state, setState] = useState("idle");
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setState("copied");
    } catch {
      setState("error");
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), RESET_MS);
  }

  return (
    <Button type="button" variant="secondary" onClick={copy}>
      <Link2 className="h-4 w-4" aria-hidden="true" />
      {state === "copied" ? "Link copied" : state === "error" ? "Copy failed" : "Copy join link"}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Join link copied to clipboard" : state === "error" ? "Could not copy the join link" : ""}
      </span>
    </Button>
  );
}
