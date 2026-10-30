import Link from "next/link";
import Emblem from "@/components/Emblem";
import { getLiveSession } from "@/lib/spill-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let session = null;
  try {
    const result = await getLiveSession();
    if (result.ok) session = result.body?.session ?? null;
  } catch {
    session = null;
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center overflow-x-clip px-gutter py-10 sm:px-8"
      style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
    >
      {/* Decorative background glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center"
      >
        <div
          className="absolute h-[80vmin] w-[80vmin] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(167,139,250,0.1), transparent 65%)",
          }}
        />
        <div
          className="absolute h-72 w-72 rounded-full"
          style={{
            top: "-96px",
            left: "-96px",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.1) 40%, rgba(167,139,250,0) 65%)",
          }}
        />
        <div
          className="absolute h-64 w-64 rounded-full"
          style={{
            top: "160px",
            right: "-80px",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.15) 40%, rgba(167,139,250,0) 65%)",
          }}
        />
      </div>

      {/* Rotating emblem watermark (behind content) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <span
          className="block h-[32vmin] w-[32vmin] opacity-[0.035] motion-safe:animate-rotate-slow"
          style={{ animationDuration: "60s" }}
          aria-label="Spill It watermark"
        >
          <Emblem className="h-full w-full" />
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Emblem / Logo */}
        <div className="flex justify-center">
          <span
            className="mb-6 inline-flex h-24 w-24 drop-shadow-[0_0_18px_rgba(167,139,250,0.25)] sm:h-28 sm:w-28 animate-emblem-drift"
            aria-label="Spill It"
          >
            <Emblem className="h-full w-full" />
          </span>
        </div>

        {/* Brand name */}
        <p className="font-display text-center text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Grace Nation Wealthy Youths
        </p>

        {/* Tagline */}
        <span className="mx-auto inline-flex items-center gap-2 text-center font-body text-lg font-medium text-gold sm:text-xl">
          Your thoughts. Your voice.
        </span>

        {/* Golden divider */}
        <div className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent opacity-40" />

        {/* Headline */}
        <h1 className="font-display text-center text-4xl font-bold tracking-tight text-ink sm:text-5xl md:text-6xl">
          Spill It!
        </h1>
      </div>

      {/* Subtitle */}
      <p className="relative z-10 mt-6 max-w-md text-center text-[clamp(16px,2vw,18px)] leading-[1.65] text-muted">
        {session
          ? "No pressure. Just be real with us."
          : "No discussion is open right now. Check back soon."}
      </p>

      {/* Join */}
      {session ? (
        <div className="relative z-10 mt-8">
          <Link
            href={`/join/${session.public_code}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-gold px-6 py-3 text-base font-medium text-midnight shadow-[0_0_18px_rgba(167,139,250,0.3)] transition-colors hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto"
          >
            Join the conversation
          </Link>
        </div>
      ) : null}
    </main>
  );
}
