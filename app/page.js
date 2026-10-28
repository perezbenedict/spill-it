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

      {/* Emblem / Logo */}
      <div className="flex justify-center">
        <span
          className="mb-6 inline-flex h-24 w-24 drop-shadow-[0_0_18px_rgba(167,139,250,0.25)] sm:h-28 sm:w-28 animate-emblem-drift"
          aria-label="Spill It"
        >
          <Emblem className="h-full w-full" />
        </span>
      </div>

      {/* Tag */}
      <span className="mx-auto mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-gold/30 bg-surface px-3 py-1.5 text-[clamp(10px,1.5vw,11px)] font-semibold uppercase tracking-[0.2em] text-gold">
        Your thoughts. Your voice.
      </span>

      {/* Headline */}
      <h1 className="relative overflow-hidden bg-gradient-to-br from-[#C4B5FD] via-[#A78BFA] to-[#6D4AB8] bg-clip-text font-display font-semibold leading-[1.05] text-[clamp(2.35rem,8vw,3rem)] tracking-[-0.01em] text-transparent">
        <span className="inline-block overflow-hidden align-top pb-[0.12em]">
          <span className="inline-block">Spill It</span>
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-24 -skew-x-12"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(167,139,250,0.45), transparent)",
            left: "120%",
          }}
        />
      </h1>

      {/* Subtitle */}
      <p className="mt-6 max-w-md text-[clamp(16px,2vw,18px)] leading-[1.65] text-muted">
        {session
          ? "No pressure. Just be real with us."
          : "No discussion is open right now. Check back soon."}
      </p>

      {/* Join */}
      {session ? (
        <div className="mt-8">
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
