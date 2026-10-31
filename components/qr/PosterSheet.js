export default function PosterSheet({ title, qrDataUrl, sessionCode, joinUrl }) {
  return (
    <article className="qr-poster-sheet relative mx-auto flex w-full max-w-xl min-w-0 flex-col items-center gap-5 overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-br from-[#1B0E32] via-[#301A50] to-[#6D4AB8] px-5 py-10 text-ink shadow-[0_32px_100px_-42px_rgba(167,139,250,0.9)] sm:gap-6 sm:px-10 sm:py-12 print:max-w-none print:gap-5 print:rounded-none print:border-0 print:px-6 print:py-8 print:shadow-none print:break-inside-avoid print:break-after-avoid">
      <div aria-hidden="true" className="qr-poster-halo pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/15 blur-3xl print:hidden" />
      <div aria-hidden="true" className="qr-poster-halo qr-poster-halo-delay pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-[#7C3AED]/20 blur-3xl print:hidden" />
      <div className="qr-stage-reveal rounded-control bg-white/10 p-2 ring-1 ring-white/20 print:bg-transparent print:ring-0">
        <span className="inline-flex h-12 w-auto" aria-label="Spill It">
          <svg
            viewBox="0 0 120 120"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="55%" stopColor="#A78BFA" />
                <stop offset="100%" stopColor="#6D4AB8" />
              </linearGradient>
              <linearGradient id="crimson" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D8324C" />
                <stop offset="100%" stopColor="#B3223A" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="56" fill="none" stroke="url(#gold)" strokeWidth="1.6" />
            <circle cx="60" cy="60" r="50.5" fill="none" stroke="url(#gold)" strokeWidth="0.8" opacity="0.65" />
            <circle cx="60" cy="60" r="38" fill="#121722" />
            <path
              d="M60 30 C 72 48, 82 56, 78 68 C 75 79, 68 86, 60 88 C 52 86, 45 79, 42 68 C 38 56, 48 48, 60 30 Z"
              fill="url(#crimson)"
            />
            <path
              d="M60 48 C 65 56, 70 60, 68 67 C 66 73, 63 76, 60 77 C 57 76, 54 73, 52 67 C 50 60, 55 56, 60 48 Z"
              fill="url(#gold)"
              opacity="0.95"
            />
          </svg>
        </span>
      </div>

      <h1 className="qr-stage-reveal qr-stage-reveal-delay-1 relative font-display text-[clamp(2.75rem,12vw,4.25rem)] font-semibold leading-none tracking-[-0.04em] text-gold print:text-4xl print:text-black">
        Spill it
      </h1>

      <h2 className="qr-stage-reveal qr-stage-reveal-delay-2 relative max-w-full break-words text-balance text-center font-display text-[clamp(1.65rem,6vw,2.2rem)] font-semibold leading-[1.05] text-white print:text-xl print:text-black">
        Scan to join the conversation
      </h2>

      <p className="qr-topic-reveal relative max-w-lg break-words text-balance text-center text-[clamp(1rem,4vw,1.25rem)] font-medium leading-snug text-gold-light print:text-black">
        {title}
      </p>

      <p className="relative max-w-sm text-center text-sm leading-relaxed text-white/70 sm:text-base print:text-black">
        Scan the code, pick a nickname, and share your thoughts.
      </p>

      <div className="qr-premium-frame relative w-full max-w-[22rem] rounded-[2rem] border border-white/20 bg-white/10 p-2 shadow-[0_24px_70px_-30px_rgba(10,4,24,0.9)] print:max-w-[18rem] print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="qr-static-code rounded-[1.55rem] bg-white p-3 sm:p-5 print:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
          <img
            src={qrDataUrl}
            alt={`QR code to join ${title} at ${joinUrl}`}
            className="h-auto w-full bg-white [image-rendering:auto]"
          />
        </div>
      </div>

      {joinUrl ? (
        <p className="max-w-full break-all text-center text-xs leading-relaxed text-white/65 sm:text-sm print:text-black">
          {joinUrl}
        </p>
      ) : null}

      <p className="break-all text-center text-xs uppercase tracking-[0.18em] text-white/45 print:text-black">
        Session {sessionCode}
      </p>

      <footer className="relative font-display text-lg font-semibold text-white print:text-black">
        Say what you really think.
      </footer>
    </article>
  );
}
