'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { CATEGORIES } from '@/lib/constants';

const STATUS_OPTIONS = [
  ['all', 'All'],
  ['pending', 'Awaiting review'],
  ['approved', 'Approved'],
  ['hidden', 'Hidden'],
];

const SORT_OPTIONS = [
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['pinned', 'Pinned first'],
];

const DEBOUNCE_MS = 300;

const selectClassName =
  'rounded-control border border-neutral-300 bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple';

export default function FilterBar({ status, category, sort, q }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(q);
  const appliedQRef = useRef(q);
  const timerRef = useRef(null);
  // navigate() may fire from a pending debounce after newer navigations, so it
  // reads the latest searchParams through a ref instead of a stale closure.
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  // Keep the input in sync when the URL changes elsewhere (clear filters,
  // back navigation).
  const urlQ = searchParams.get('q') ?? '';
  useEffect(() => {
    appliedQRef.current = urlQ;
    setQuery(urlQ);
  }, [urlQ]);

  function navigate(updates) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const [key, value] of Object.entries(updates)) {
      const isDefault =
        value === '' ||
        value === 'all' ||
        (key === 'sort' && value === 'newest');
      if (isDefault) params.delete(key);
      else params.set(key, String(value));
    }
    // Any filter change restarts from the first page.
    if (!('page' in updates)) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === appliedQRef.current) return undefined;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      appliedQRef.current = trimmed;
      navigate({ q: trimmed });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // navigate is re-created each render; the ref above keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function submitSearch(event) {
    event.preventDefault();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const trimmed = query.trim();
    if (trimmed === appliedQRef.current) return;
    appliedQRef.current = trimmed;
    navigate({ q: trimmed });
  }

  function clearSearch() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setQuery('');
    appliedQRef.current = '';
    navigate({ q: '' });
  }

  return (
    <section
      aria-label="Filter contributions"
      className="flex flex-col gap-4 rounded-card border border-neutral-200 bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Status
        <select
          value={status}
          onChange={(event) => navigate({ status: event.target.value })}
          className={selectClassName}
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Type
        <select
          value={category}
          onChange={(event) => navigate({ category: event.target.value })}
          className={selectClassName}
        >
          <option value="all">All</option>
          {CATEGORIES.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      <form
        role="search"
        onSubmit={submitSearch}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <label htmlFor="feed-search" className="text-xs font-medium text-muted">
          Search
        </label>
        <div className="flex gap-2">
          <Input
            id="feed-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search content or nickname"
            autoComplete="off"
          />
          {query ? (
            <Button type="button" variant="secondary" onClick={clearSearch}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Sort
        <select
          value={sort}
          onChange={(event) => navigate({ sort: event.target.value })}
          className={selectClassName}
        >
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
