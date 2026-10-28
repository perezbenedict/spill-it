import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAdminToken } from "@/lib/auth";
import { getAdminSession, listAdminSubmissions } from "@/lib/spill-api";
import { CATEGORIES, MODERATION_STATUSES } from "@/lib/constants";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import StatusBadge from "@/components/admin/sessions/StatusBadge";
import FilterBar from "@/components/moderation/FilterBar";
import SubmissionFeed from "@/components/moderation/SubmissionFeed";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const SORTS = ["newest", "oldest", "pinned"];

const linkClassName =
  "inline-flex min-h-10 items-center rounded-control border border-white/10 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const retryClassName =
  "inline-flex min-h-10 items-center rounded-control bg-surface px-4 text-sm font-medium text-ink hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeSearch(value) {
  return String(value ?? "")
    .replace(/[%_(),"']/g, "")
    .trim()
    .slice(0, 100);
}

function FeedSkeleton() {
  return (
    <div className="flex items-center justify-center rounded-card border border-white/10 bg-surface py-16">
      <Spinner className="h-6 w-6" label="Loading contributions" />
    </div>
  );
}

export default async function LiveModerationPage({ params, searchParams }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(String(id))) notFound();

  const query = await searchParams;

  const statusRaw = first(query?.status) ?? "all";
  const status =
    statusRaw === "all" || MODERATION_STATUSES.includes(statusRaw) ? statusRaw : "all";
  const categoryRaw = first(query?.category) ?? "all";
  const category =
    categoryRaw === "all" || CATEGORIES.some((entry) => entry.key === categoryRaw)
      ? categoryRaw
      : "all";
  const q = sanitizeSearch(first(query?.q));
  const sortRaw = first(query?.sort) ?? "newest";
  const sort = SORTS.includes(sortRaw) ? sortRaw : "newest";
  const pageRaw = Number.parseInt(first(query?.page) ?? "", 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const adminToken = await getAdminToken();
  const sessionResult = await getAdminSession(adminToken, id);

  if (!sessionResult.ok && sessionResult.status !== 404) {
    console.error("[live] session lookup failed:", sessionResult.status);
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
  const session = sessionResult.body?.session ?? null;
  if (!session) notFound();

  const livePath = `/admin/sessions/${session.id}/live`;
  const baseParams = new URLSearchParams();
  if (status !== "all") baseParams.set("status", status);
  if (category !== "all") baseParams.set("category", category);
  if (q) baseParams.set("q", q);
  if (sort !== "newest") baseParams.set("sort", sort);
  const baseQuery = baseParams.toString();
  const hasFilters = status !== "all" || category !== "all" || q !== "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {session.title}
          </h1>
          <StatusBadge status={session.status} />
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
  const adminToken = await getAdminToken();
  const result = await listAdminSubmissions(adminToken, {
    session_id: session.id,
    ...(status !== "all" ? { status } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(q ? { search: q } : {}),
    sort,
    page,
    limit: PAGE_SIZE,
  });

  if (result.status === 0 || !result.ok) {
    console.error("[live] submissions fetch failed:", result.status);
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
      submissions={result.body?.items ?? []}
      total={result.body?.total ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      sort={sort}
      filters={{ status, category, q }}
      hasFilters={hasFilters}
    />
  );
}
