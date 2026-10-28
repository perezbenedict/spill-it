import { NextResponse } from 'next/server';
import { requireAdminApi, getAdminToken } from '@/lib/auth';
import { listAdminSubmissions } from '@/lib/spill-api';

export const runtime = 'nodejs';

// Polling endpoint for the moderation feed and dashboard recent activity.
// Same auth as the rest of the admin area; fixed copy only.
const MSG_UNAUTHORIZED = 'Not authorized.';
const MSG_GENERIC = 'Something went wrong. Please try again.';

const MODERATION_STATUSES = ['pending', 'approved', 'hidden'];
const KNOWN_CATEGORIES = ['question', 'opinion', 'challenge', 'twocents'];
const SORTS = ['newest', 'oldest', 'pinned', 'queue'];

export async function GET(request) {
  const auth = await requireAdminApi();
  if (!auth) {
    return NextResponse.json({ error: MSG_UNAUTHORIZED }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = {};
  const sessionId = url.searchParams.get('session_id');
  if (sessionId) params.session_id = sessionId;
  const status = url.searchParams.get('status');
  if (status && status !== 'all' && MODERATION_STATUSES.includes(status)) {
    params.status = status;
  }
  const category = url.searchParams.get('category');
  if (category && category !== 'all' && KNOWN_CATEGORIES.includes(category)) {
    params.category = category;
  }
  const q = String(url.searchParams.get('q') ?? '').trim();
  if (q) params.search = q;
  const sort = url.searchParams.get('sort');
  if (sort && SORTS.includes(sort)) params.sort = sort;
  const page = Number.parseInt(url.searchParams.get('page') ?? '', 10);
  if (Number.isInteger(page) && page >= 1) params.page = page;
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  if (Number.isInteger(limit) && limit > 0) params.limit = Math.min(limit, 200);

  const adminToken = await getAdminToken();
  const result = await listAdminSubmissions(adminToken, params);

  if (result.status === 0 || !result.ok) {
    return NextResponse.json({ error: MSG_GENERIC }, { status: 500 });
  }

  return NextResponse.json({
    items: result.body.items,
    total: result.body.total,
    ...(result.body.summaries ? { summaries: result.body.summaries } : {}),
  });
}
