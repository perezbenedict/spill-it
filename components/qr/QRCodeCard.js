"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Fallback for browsers/contexts without the async clipboard API.
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
  const [dataUrl, setDataUrl] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
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
    <Card className="flex flex-col items-center gap-4 text-center">
      <div className="flex min-h-48 items-center justify-center">
        {status === "loading" || !dataUrl ? (
          <Spinner className="h-8 w-8 text-purple" label="Generating QR code" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip
          <img
            src={dataUrl}
            alt={`QR code linking to ${url}`}
            className="h-auto w-full max-w-64 rounded-control"
          />
        )}
      </div>

      <p className="max-w-full select-all break-all text-sm text-muted">{url}</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {status === "loading" || !dataUrl ? (
          <Button variant="secondary" disabled loading>
            Download PNG
          </Button>
        ) : (
          <a
            href={dataUrl}
            download={fileName}
            className="inline-flex items-center justify-center gap-2 rounded-control bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
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
          className="inline-flex items-center justify-center gap-2 rounded-control bg-transparent px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open
        </a>
      </div>

      <p aria-live="polite" className="min-h-5 text-sm text-success">
        {copied ? "Copied!" : ""}
      </p>
    </Card>
  );
}
