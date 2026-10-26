import Image from "next/image";

// Print-friendly poster. Interactive chrome lives outside this component and
// should carry print:hidden; the sheet itself is black-on-white friendly.
export default function PosterSheet({ title, qrDataUrl, sessionCode, joinUrl }) {
  return (
    <article className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 bg-white px-10 py-14 text-ink print:max-w-none print:gap-6 print:px-6 print:py-8 print:break-inside-avoid print:break-after-avoid">
      <div className="rounded-control bg-ink p-2">
        <Image
          src="/gnwy-logo.png"
          alt="GNWY - Grace Nation Wealthy Youths"
          width={200}
          height={72}
          className="h-12 w-auto print:h-10"
        />
      </div>

      <h1 className="font-display text-5xl font-bold tracking-tight text-purple print:text-4xl print:text-black">
        SPILL
      </h1>

      <h2 className="text-balance text-center font-display text-2xl font-semibold text-ink print:text-xl print:text-black">
        {title}
      </h2>

      <p className="max-w-sm text-center text-base text-muted print:text-black">
        Scan to join - no signup, no names, just your honest take.
      </p>

      <div className="rounded-card bg-white p-6 ring-1 ring-neutral-200 print:ring-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, no server round-trip */}
        <img
          src={qrDataUrl}
          alt={`QR code to join ${title} at ${joinUrl}`}
          className="h-auto w-72 print:w-64"
        />
      </div>

      {joinUrl ? (
        <p className="max-w-full break-all text-center text-sm text-muted print:text-black">
          {joinUrl}
        </p>
      ) : null}

      <p className="text-xs uppercase tracking-widest text-neutral-400 print:text-black">
        Session {sessionCode}
      </p>

      <footer className="font-display text-lg font-semibold text-purple print:text-black">
        Say what you really think.
      </footer>
    </article>
  );
}
