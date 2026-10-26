import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES, MODERATION_STATUSES } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import ErrorState from '@/components/ui/ErrorState';
import FilterBar from '@/components/moderation/FilterBar';
import SubmissionFeed from '@/components/moderation/SubmissionFeed';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const SORTS = ['newest', 'oldest', 'pinned'];

const SESSION_BADGES = {
  draft: { label: 'Draft', variant: 'neutral' },
  live: { label: 'Live', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' },
  closed: { label: 'Closed', variant: 'danger' },
};

const linkClassName =
  'inline-flex min-h-10 items-center rounded-control border border-neutral-300 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple';

const retryClassName =
  'inline-flex min-h-10 items-center rounded-control bg-ink px-4 text-sm font-medium text-cream hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple';

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

// Strips characters that would change the PostgREST or()/ilike grammar or that
// the feed cannot match literally, and caps length. The sanitized term is what
// both the server query and the client-side live filtering use, so they agree.
function sanitizeSearch(value) {
  return String(value ?? '')
    .replace(/[%_(),\\"']/g, '')
    .trim()
    .slice(0, 100);
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        Loading contributions
      </p>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-32 animate-pulse rounded-card border border-neutral-200 bg-neutral-100 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export default async function LiveModerationPage({ params, searchParams }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(String(id))) notFound();

  const query = await searchParams;

  const statusRaw = first(query?.status) ?? 'all';
  const status =
    statusRaw === 'all' || MODERATION_STATUSES.includes(statusRaw) ? statusRaw : 'all';
  const categoryRaw = first(query?.category) ?? 'all';
  const category =
    categoryRaw === 'all' || CATEGORIES.some((entry) => entry.key === categoryRaw)
      ? categoryRaw
      : 'all';
  const q = sanitizeSearch(first(query?.q));
  const sortRaw = first(query?.sort) ?? 'newest';
  const sort = SORTS.includes(sortRaw) ? sortRaw : 'newest';
  const pageRaw = Number.parseInt(first(query?.page) ?? '', 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const supabase = await createClient();
  const { data: session, error: sessionError } = await supabase
    .from('discussion_sessions')
    .select('id, title, public_code, status')
    .eq('id', id)
    .maybeSingle();

  if (sessionError) {
    console.error('[live] session lookup failed:', sessionError.message);
    return (
      <ErrorState
        title="We could not load this feed"
        description="Something went wrong loading the discussion. Please try again."
        retry={
          <Link href={`/admin/sessions/${id}/live`} className={retryClassName}>
            Try again
          </Link>
        }
      />
    );
  }
  if (!session) notFound();

  const livePath = `/admin/sessions/${session.id}/live`;
  const baseParams = new URLSearchParams();
  if (status !== 'all') baseParams.set('status', status);
  if (category !== 'all') baseParams.set('category', category);
  if (q) baseParams.set('q', q);
  if (sort !== 'newest') baseParams.set('sort', sort);
  const baseQuery = baseParams.toString();
  const hasFilters = status !== 'all' || category !== 'all' || q !== '';
  const badge = SESSION_BADGES[session.status] ?? SESSION_BADGES.draft;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {session.title}
          </h1>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <nav aria-label="Session links" className="flex flex-wrap gap-2">
          <Link href={`/admin/sessions/${session.id}`} className={linkClassName}>
            Back to session
          </Link>
          <Link href={`/room/${session.public_code}`} className={linkClassName}>
            Open room view
          </Link>
          <Link href={`/join/${session.public_code}`} className={linkClassName}>
            Participant link
          </Link>
        </nav>
      </header>

      <FilterBar status={status} category={category} sort={sort} q={q} />

      <Suspense key={`${status}:${category}:${q}:${sort}:${page}`} fallback={<FeedSkeleton />}>
        <FeedSection
          session={session}
          status={status}
          category={category}
          q={q}
          sort={sort}
          page={page}
          hasFilters={hasFilters}
          livePath={livePath}
          baseQuery={baseQuery}
        />
      </Suspense>
    </div>
  );
}

async function FeedSection({
  session,
  status,
  category,
  q,
  sort,
  page,
  hasFilters,
  livePath,
  baseQuery,
}) {
  const supabase = await createClient();
  let query = supabase
    .from('submissions')
    .select('*', { count: 'exact' })
    .eq('session_id', session.id);

  if (status !== 'all') query = query.eq('moderation_status', status);
  if (category !== 'all') query = query.eq('category', category);
  if (q) query = query.or(`content.ilike.%${q}%,nickname.ilike.%${q}%`);

  if (sort === 'pinned') {
    query = query
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  } else if (sort === 'oldest') {
    query = query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
  } else {
    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  }

  // Exactly one page per request.
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, page * PAGE_SIZE - 1);

  if (error) {
    console.error('[live] submissions fetch failed:', error.message);
    const retryHref = baseQuery ? `${livePath}?${baseQuery}` : livePath;
    return (
      <ErrorState
        title="We could not load the contributions"
        description="Something went wrong loading this feed. Please try again."
        retry={
          <Link href={retryHref} className={retryClassName}>
            Try again
          </Link>
        }
      />
    );
  }

  return (
    <SubmissionFeed
      sessionId={session.id}
      sessionCode={session.public_code}
      livePath={livePath}
      baseQuery={baseQuery}
      submissions={data ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      sort={sort}
      filters={{ status, category, q }}
      hasFilters={hasFilters}
    />
  );
}
