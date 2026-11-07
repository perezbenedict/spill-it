"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import Button from "@/components/ui/Button";
import PrintButton from "@/components/qr/PrintButton";
import usePlatform from "@/components/platform/usePlatform";

export default function QRFullscreenStage({
  topic,
  status,
  publicCode,
  joinUrl,
  qrDataUrl,
}) {
  const stageRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const { data: engagement } = usePlatform(`/api/platform/public/${publicCode}`);
  const atmosphere = engagement?.stage?.atmosphere || "midnight";

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsFullscreen(active);
      if (active) setFullscreenError("");
    };
    const handleFullscreenError = () => {
      setFullscreenError("Fullscreen could not be opened. You can keep using the projector view here.");
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
    };
  }, []);

  const enterFullscreen = useCallback(async () => {
    setFullscreenError("");
    if (!stageRef.current?.requestFullscreen) {
      setFullscreenError("Fullscreen is not supported in this browser. You can keep using the projector view here.");
      return;
    }
    try {
      await stageRef.current.requestFullscreen({ navigationUI: "hide" });
    } catch {
      setFullscreenError("Fullscreen was not allowed. Check the browser permission and try again.");
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    setFullscreenError("");
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      setFullscreenError("Fullscreen could not be closed. Press Escape to exit.");
    }
  }, []);

  const statusLine =
    status === "paused"
      ? "Submissions are paused"
      : status === "closed"
        ? "This conversation has wrapped"
        : null;

  return (
    <main
      ref={stageRef}
      data-qr-stage
      data-qr-atmosphere={atmosphere}
      data-fullscreen-active={isFullscreen ? "true" : "false"}
      className={`qr-event-stage relative isolate flex min-w-0 items-center bg-midnight text-center transition-[padding] duration-500 ${
        isFullscreen
          ? "h-screen w-screen overflow-y-auto px-[clamp(1.25rem,3vw,4rem)] py-[clamp(1rem,2.5vh,2rem)] lg:overflow-hidden"
          : "min-h-screen overflow-hidden px-4 py-10 sm:px-gutter sm:py-12"
      }`}
    >
      <div
        aria-hidden="true"
        className="qr-ambient-light pointer-events-none absolute -inset-[18%] -z-20 bg-[radial-gradient(48%_42%_at_24%_20%,rgba(196,181,253,0.26),transparent_68%),radial-gradient(46%_42%_at_82%_78%,rgba(109,74,184,0.3),transparent_70%)] print:hidden"
      />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-left print:hidden" />
      <div aria-hidden="true" className="qr-light-beam qr-light-beam-right print:hidden" />
      <div aria-hidden="true" className="qr-event-grid pointer-events-none absolute inset-0 -z-10 print:hidden" />

      {isFullscreen ? (
        <button
          type="button"
          onClick={exitFullscreen}
          data-fullscreen-control="exit"
          className="absolute right-4 top-4 z-30 inline-flex min-h-10 items-center gap-2 rounded-control border border-white/15 bg-midnight/70 px-3 py-2 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:border-gold/50 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:right-6 sm:top-6"
          aria-label="Exit fullscreen QR presentation"
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Exit fullscreen</span>
        </button>
      ) : null}

      <section
        className={`mx-auto grid w-full min-w-0 items-center ${
          isFullscreen
            ? "max-w-[min(96vw,110rem)] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(26rem,1.12fr)] lg:gap-[clamp(2rem,5vw,7rem)]"
            : "max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-14 xl:gap-20"
        }`}
      >
        <div className={`flex min-w-0 flex-col ${isFullscreen ? "items-center text-center lg:items-start lg:text-left" : "items-center lg:items-start lg:text-left"}`}>
          <p className="qr-stage-reveal text-xs font-semibold uppercase tracking-[0.28em] text-gold/80 sm:text-sm">
            Live conversation <span aria-hidden="true">·</span> Spill it
          </p>
          <h1
            data-qr-topic
            className={`qr-topic-reveal mt-4 max-w-full break-words text-balance font-display font-medium tracking-[-0.035em] text-ink ${
              isFullscreen
                ? "text-[clamp(2.25rem,4.5vw,5.25rem)] leading-[0.98]"
                : "text-[clamp(2.15rem,5vw,4.65rem)] leading-[1.01]"
            }`}
          >
            {topic}
          </h1>
          <p className={`qr-stage-reveal qr-stage-reveal-delay-2 max-w-2xl font-display font-medium leading-tight text-gold-light ${isFullscreen ? "mt-5 text-[clamp(1.4rem,2.25vw,2.5rem)]" : "mt-5 text-[clamp(1.35rem,2.5vw,2.15rem)]"}`}>
            Scan to join the conversation
          </p>
          <p className="qr-stage-reveal qr-stage-reveal-delay-3 mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Scan the code, pick a nickname, and share your thoughts.
          </p>

          {statusLine ? (
            <p
              role="status"
              className={`qr-stage-reveal qr-stage-reveal-delay-3 mt-5 max-w-full rounded-pill px-4 py-1.5 text-sm font-medium sm:text-base ${
                status === "paused"
                  ? "bg-gold/15 text-gold"
                  : "bg-crimson/15 text-crimson-bright"
              }`}
            >
              {statusLine}
            </p>
          ) : null}

          {!isFullscreen ? (
            <div className="qr-stage-reveal qr-stage-reveal-delay-3 mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row print:hidden">
              <PrintButton />
              <Button
                variant="secondary"
                onClick={enterFullscreen}
                data-fullscreen-control="enter"
                aria-label="Open fullscreen QR presentation"
                className="w-full sm:w-auto"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                Fullscreen
              </Button>
            </div>
          ) : null}

          <p aria-live="polite" className="mt-3 min-h-5 max-w-lg text-sm text-crimson-bright print:hidden">
            {fullscreenError}
          </p>
        </div>

        <div className={`qr-card-shell relative mx-auto w-full min-w-0 ${isFullscreen ? "max-w-[min(86vw,30rem)] p-2 lg:max-w-[min(45vw,46rem)]" : "max-w-[35rem] p-3 sm:p-5"}`}>
          <div aria-hidden="true" className="qr-orbit qr-orbit-one print:hidden" />
          <div aria-hidden="true" className="qr-orbit qr-orbit-two print:hidden" />
          <div className="qr-premium-frame relative rounded-[2.4rem] border border-white/15 bg-gradient-to-br from-white/15 via-gold/10 to-gold-deep/25 p-2 shadow-[0_38px_110px_-42px_rgba(167,139,250,0.9)] sm:p-3">
            <div className={`rounded-[1.9rem] border border-white/10 bg-[#160D2B]/95 shadow-inner ${isFullscreen ? "p-3" : "p-4 sm:p-6"}`}>
              <div className={`qr-static-code flex w-full items-center justify-center rounded-[1.45rem] bg-white shadow-[0_22px_60px_-28px_rgba(0,0,0,0.92)] ${isFullscreen ? "p-4" : "p-3 sm:p-6"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
                <img
                  src={qrDataUrl}
                  alt={`QR code to join ${topic} at ${joinUrl}`}
                  className={`h-auto w-full bg-white [image-rendering:auto] ${isFullscreen ? "max-h-[min(64vh,46rem)] max-w-[min(64vh,46rem)]" : "max-w-[27rem]"}`}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-white/55 sm:text-sm">
                <span>Session {publicCode}</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold/65" />
                <span>Anonymous by design</span>
              </div>
            </div>
          </div>
          {!isFullscreen ? (
            <p className="mt-4 max-w-full select-all break-all text-center text-[0.68rem] leading-relaxed text-white/40 sm:text-xs">
              {joinUrl}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
