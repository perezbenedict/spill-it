import Image from "next/image";
import Link from "next/link";
import CodeEntry from "@/components/participant/CodeEntry";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-8 px-gutter py-10">
      <section className="flex flex-col items-center gap-5 rounded-card bg-ink px-6 py-10 text-center">
        <div className="rounded-control bg-cream px-4 py-3">
          <Image
            src="/gnwy-logo.png"
            alt="GNWY - Grace Nation Wealthy Youths"
            width={240}
            height={86}
            priority
            className="h-auto w-52"
          />
        </div>
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-cream">SPILL</h1>
          <p className="mt-1 text-lg font-medium text-lime">Say what you really think.</p>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-cream/80">
          Got a question? An opinion? Something you have wanted to say but never found the
          right moment? This is your space to join the conversation. No real names. No
          pressure. Just honest conversations. Let&apos;s get into it.
        </p>
      </section>

      <CodeEntry />

      <details className="rounded-card border border-neutral-200 bg-surface px-5 py-4 text-left">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          How anonymous is this?
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <p>
            Your nickname is a pseudonym for this conversation only. SPILL never asks for
            your name, email or phone number, and nicknames are not verified or tied to
            any account.
          </p>
          <p>
            Honest limits: hosting providers and databases still keep basic technical logs
            - such as IP address and request times - for security and operations.
          </p>
        </div>
      </details>

      <div className="flex justify-center">
        <Link
          href="/admin/login"
          className="text-sm font-medium text-purple underline-offset-4 hover:underline"
        >
          Moderator login
        </Link>
      </div>
    </main>
  );
}
