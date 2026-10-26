import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Hourglass, PartyPopper } from 'lucide-react';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import JoinExperience from '@/components/participant/JoinExperience';
import { isValidPublicCode } from '@/lib/session-code';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PUBLIC_FIELDS =
  'public_code, title, description, welcome_message, status, available_categories, configuration';

async function fetchSession(code) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('published_sessions_by_code')
    .select(PUBLIC_FIELDS)
    .eq('public_code', code)
    .maybeSingle();
  if (error) {
    console.error('[join] session lookup failed:', error.message);
    return { queryError: true };
  }
  return { session: data };
}

function normalizeCode(params) {
  return String(params?.sessionCode ?? '').trim().toUpperCase();
}

export async function generateMetadata({ params }) {
  const code = normalizeCode(await params);
  if (!isValidPublicCode(code)) return { title: 'SPILL' };
  const { session } = await fetchSession(code);
  return { title: session ? `${session.title} · SPILL` : 'SPILL' };
}

function PageShell({ children }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-gutter py-section">
      {children}
    </main>
  );
}

export default async function JoinPage({ params }) {
  const code = normalizeCode(await params);
  if (!isValidPublicCode(code)) notFound();

  const { session, queryError } = await fetchSession(code);
  if (queryError) {
    return (
      <PageShell>
        <ErrorState
          title="We could not load this discussion"
          description="That is on us, not you. Try reloading the page."
          retry={
            <Link href={`/join/${code}`} className="font-medium text-purple underline-offset-4 hover:underline">
              Try again
            </Link>
          }
        />
      </PageShell>
    );
  }
  if (!session || session.status === 'draft') notFound();

  if (session.status === 'live') {
    return (
      <main className="mx-auto w-full max-w-lg px-gutter py-8">
        <JoinExperience
          session={{
            code: session.public_code,
            title: session.title,
            description: session.description,
            welcome_message: session.welcome_message,
            available_categories: session.available_categories,
            configuration: session.configuration,
          }}
        />
      </main>
    );
  }

  const paused = session.status === 'paused';

  return (
    <PageShell>
      <Card className="w-full text-center">
        <span
          aria-hidden="true"
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-pill ${
            paused ? 'bg-purple/10 text-purple' : 'bg-lime/40 text-success'
          }`}
        >
          {paused ? (
            <Hourglass className="h-6 w-6" />
          ) : (
            <PartyPopper className="h-6 w-6" />
          )}
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">
          {paused ? 'Submissions are taking a breather' : 'This conversation has wrapped'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {paused
            ? 'This discussion is paused right now - the moderator will reopen it shortly. Check back in a few.'
            : 'Thanks for wanting to contribute. This discussion is closed, so no new thoughts can be added.'}
        </p>
        <p className="mt-4 rounded-control bg-neutral-100 px-3 py-2 text-sm font-medium text-ink">
          {session.title}
        </p>
        <Link
          href="/"
          className="mt-5 inline-block text-sm font-medium text-purple underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </Card>
    </PageShell>
  );
}
