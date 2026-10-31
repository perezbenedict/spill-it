"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Copy, Download, ExternalLink } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { generateQrDataUrl } from "@/lib/qr";

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export default function QRCodeCard({ url, fileName }) {
  const reducedMotion = useReducedMotion();
  const [dataUrl, setDataUrl] = useState(null);
  const [status, setStatus] = useState("loading");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setCopied(false);
    try {
      setDataUrl(await generateQrDataUrl(url));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopy = async () => {
    try {
      await copyText(url);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (status === "error") {
    return (
      <ErrorState
        title="QR code failed to generate"
        description="Something went wrong while generating this QR code."
        retry={
          <Button onClick={load} variant="secondary">
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="w-full rounded-card bg-gradient-to-br from-gold/35 via-gold/10 to-gold-deep/25 p-px shadow-[0_24px_70px_-34px_rgba(167,139,250,0.75)]"
    >
      <Card className="flex min-w-0 flex-col items-center gap-5 overflow-hidden bg-surface/95 px-4 py-6 text-center sm:px-6 sm:py-8">
        <div className="relative flex min-h-52 w-full items-center justify-center rounded-[1.5rem] bg-white p-3 shadow-[0_18px_55px_-28px_rgba(0,0,0,0.9)] sm:min-h-64 sm:p-4">
          {status === "loading" || !dataUrl ? (
            <Spinner className="h-8 w-8 text-gold" label="Generating QR code" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip
            <img
              src={dataUrl}
              alt={`QR code linking to ${url}`}
              className="h-auto w-full max-w-64 bg-white [image-rendering:auto]"
            />
          )}
        </div>

      <p className="max-w-full select-all break-all text-xs leading-relaxed text-muted sm:text-sm">{url}</p>

      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
        {status === "loading" || !dataUrl ? (
          <Button variant="secondary" disabled loading>
            Download PNG
          </Button>
        ) : (
          <a
            href={dataUrl}
            download={fileName}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-gold px-5 py-2.5 text-sm font-medium text-midnight transition-[background-color,transform,box-shadow] duration-200 hover:bg-gold-light hover:shadow-[0_10px_28px_-14px_rgba(196,181,253,0.9)] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PNG
          </a>
        )}

        <Button
          variant="secondary"
          onClick={handleCopy}
          disabled={status === "loading"}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied!" : "Copy link"}
        </Button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-transparent px-5 py-2.5 text-sm font-medium text-ink transition-[background-color,color,transform] duration-200 hover:bg-white/10 hover:text-gold motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open
        </a>
      </div>

        <p aria-live="polite" className="min-h-5 text-sm text-gold">
          {copied ? "Copied!" : ""}
        </p>
      </Card>
    </motion.div>
  );
}
