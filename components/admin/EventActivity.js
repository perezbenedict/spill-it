"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Emblem from '@/components/Emblem';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Dialog from '@/components/ui/Dialog';

const CATEGORIES = [['all', 'All activity'], ['discussion', 'Discussion activity'], ['voting', 'Voting activity'], ['moderation', 'Moderation activity'], ['stage', 'Stage & projection'], ['administrative', 'Administrative & protected audit']];
const initialFilters = { category: 'all', q: '', from: '', to: '', view: 'active' };
const dateLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const timeLabel = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

export default function EventActivity() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const generation = useRef(0);
  const controller = useRef(null);
  const locked = useRef(false);
  const active = useRef(true);
  const load = useCallback(async ({ cursor, snapshot } = {}) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++generation.current;
    setBusy(true); setError('');
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      const params = new URLSearchParams({ ...filters, limit: '25', ...(cursor ? { cursor, snapshot } : {}) });
      const response = await fetch(`/api/activity?${params}`, { cache: 'no-store', signal: request.signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not load activity.');
      if (!active.current || generation.current !== current) return;
      setData(body); setItems(previous => cursor ? [...previous, ...body.items.filter(item => !previous.some(old => old.id === item.id))] : body.items);
    } catch (failure) {
      if (active.current && generation.current === current) setError(request.signal.aborted ? 'Activity did not respond in time. Refresh to reconnect.' : failure.message);
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) controller.current = null;
      if (active.current && generation.current === current) setBusy(false);
    }
  }, [filters]);
  useEffect(() => {
    active.current = true;
    setData(null); setItems([]); setConfirmation(null); setNotice('');
    load();
    return () => { active.current = false; generation.current += 1; controller.current?.abort(); };
  }, [load]);
  async function clear() {
    if (!confirmation || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearVisible', snapshot: confirmation.snapshot }), signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not archive this history.');
      setConfirmation(null);
      setNotice(`${body.archivedCount} operational ${body.archivedCount === 1 ? 'entry moved' : 'entries moved'} to the archive. Event data and protected audit records are unchanged.`);
      await load();
    } catch (failure) { setError(failure.message || 'Connection interrupted. Refresh to review the current history before retrying.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  const groups = new Map();
  for (const item of items) {
    const day = item.createdAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(item);
  }
  const change = name => event => setDraft(previous => ({ ...previous, [name]: event.target.value }));
  const filtersChanged = JSON.stringify(draft) !== JSON.stringify(filters);
  return <div className="space-y-6">
    <header className="relative overflow-hidden rounded-card border border-gold/15 bg-gradient-to-br from-surface via-surface to-midnight px-5 py-7 sm:px-8">
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-14 h-64 w-64 opacity-[.035]"><Emblem className="h-full w-full" /></span>
      <div className="relative flex flex-wrap items-start justify-between gap-5"><div className="min-w-0"><p className="text-xs uppercase tracking-[.2em] text-gold-light">The event record</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Event activity</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Follow the discussion, the vote and the stage. Operational history can be archived; protected audit records stay in view.</p></div><div className="flex flex-wrap gap-2"><Button variant={filters.view === 'archived' ? 'primary' : 'secondary'} disabled={busy} onClick={() => { const view = filters.view === 'archived' ? 'active' : 'archived'; setDraft(previous => ({ ...previous, view })); setFilters(previous => ({ ...previous, view })); }}>{filters.view === 'archived' ? 'Back to current activity' : 'View Archived Activity'}</Button><Button variant="ghost" disabled={busy} onClick={() => load()}>Refresh activity</Button></div></div>
    </header>
    <Card className="space-y-5">
      <form onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(9rem,.65fr)_minmax(9rem,.65fr)_auto]">
        <label className="block min-w-0 text-sm">Activity category<select aria-label="Activity category" value={draft.category} onChange={change('category')} className="mt-2 min-h-11 w-full rounded-control border border-white/20 bg-midnight px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block min-w-0 text-sm">Search activity<Input className="mt-2" maxLength={120} value={draft.q} onChange={change('q')} placeholder="Event title or operation" /></label>
        <label className="block min-w-0 text-sm">From date (UTC)<Input className="mt-2" type="date" value={draft.from} onChange={change('from')} /></label>
        <label className="block min-w-0 text-sm">Through date (UTC)<Input className="mt-2" type="date" value={draft.to} onChange={change('to')} min={draft.from || undefined} /></label>
        <Button className="self-end" type="submit" disabled={busy}>Apply filters</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4"><p role="status" className="text-sm text-muted">{busy ? 'Synchronizing activity…' : data ? `${filters.view === 'archived' ? 'Archived activity' : 'Current activity'} · ${items.length} loaded · timestamps in UTC` : 'Connecting to the event record…'}</p>{filters.view === 'active' && data?.canArchive && <Button variant="secondary" disabled={busy || filtersChanged || !data?.eligibleCount} onClick={() => setConfirmation({ snapshot: data.snapshot, count: data.eligibleCount })}>Clear Visible History</Button>}</div>
      {filtersChanged && <p role="status" className="text-xs text-gold-light">Apply your filter changes before clearing history.</p>}
      <p className="text-xs leading-relaxed text-muted">Filters apply across the selected history, including later pages. Clearing archives only eligible operations in the current snapshot. Newer activity, security records and destructive-operation audit entries remain untouched.</p>
    </Card>
    {error && <p role="alert" className="rounded-control border border-crimson/40 bg-crimson/10 p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-control border border-gold/25 bg-gold/10 p-4 text-sm text-gold-light">{notice}</p>}
    {!data && busy ? <Card><p role="status" className="text-muted">Opening the event record…</p></Card> : !items.length && data ? <Card className="py-10 text-center"><p className="font-display text-3xl">{filters.view === 'archived' ? 'Nothing archived in this view.' : 'A quiet moment in the record.'}</p><p className="mt-3 text-sm text-muted">{filters.view === 'archived' ? 'Archived operations will remain available here.' : 'Try a different filter, or return after the next event action.'}</p></Card> : [...groups].map(([day, entries]) => <section key={day} className="space-y-3" aria-label={`Activity on ${dateLabel(day)}`}><h2 className="px-1 text-xs font-semibold uppercase tracking-[.16em] text-gold-light">{dateLabel(day)}</h2><Card className="px-4 py-1 sm:px-6"><ol className="divide-y divide-white/10">{entries.map(item => {
      const href = item.eventId ? item.eventType === 'voting' ? `/admin/voting/${item.eventId}` : item.eventType === 'discussion' ? `/admin/sessions/${item.eventId}` : null : null;
      return <li key={item.id} className="grid min-w-0 gap-3 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]" data-activity-id={item.id}><time dateTime={item.createdAt} title={new Date(item.createdAt).toISOString()} className="pt-1 text-xs tabular-nums text-muted">{timeLabel(item.createdAt)}<span className="ml-1 text-[10px]">UTC</span></time><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-ink">{item.description}</h3>{href ? <Link href={href} className="mt-1 inline-block max-w-full break-words text-sm text-gold-light underline-offset-4 hover:underline">{item.eventTitle}</Link> : <p className="mt-1 break-words text-sm text-muted">{item.eventTitle}{item.eventReference && <span className="ml-2 text-xs">· {item.eventReference.slice(0, 8)}</span>}</p>}{item.archivedCount !== null && <p className="mt-2 text-xs text-muted">{item.archivedCount} operational {item.archivedCount === 1 ? 'entry' : 'entries'} archived. Actual event data was preserved.</p>}{item.archivedAt && <p className="mt-2 text-xs text-muted">Archived {new Date(item.archivedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</p>}</div><div className="flex flex-wrap items-start gap-2"><Badge variant={item.protected ? 'warning' : item.category === 'stage' ? 'info' : 'neutral'}>{item.category === 'administrative' ? 'Administrative' : item.category === 'stage' ? 'Stage' : item.category[0].toUpperCase() + item.category.slice(1)}</Badge>{item.protected && <Badge variant="warning">Protected audit</Badge>}</div></li>;
    })}</ol></Card></section>)}
    {data?.nextCursor && <div className="flex justify-center"><Button variant="secondary" loading={busy} onClick={() => load({ cursor: data.nextCursor, snapshot: data.snapshot })}>Load older activity</Button></div>}
    <p className="text-xs leading-relaxed text-muted">Operational and archived history are retained until an explicitly reviewed retention process is introduced. Protected audit records cannot be cleared here. Shared admin actions do not identify individual moderators; participant identities and credentials are excluded.</p>
    <Dialog open={Boolean(confirmation)} onClose={() => { if (!busy) setConfirmation(null); }} title="Clear this visible history?" description={`${confirmation?.count || 0} eligible operational entries matching these filters will move to Archived Activity, including matching entries on later pages. This does not delete discussions, votes, contributions or protected audit records. Newer activity is not included.`}>
      {error && <p role="alert" className="mb-4 text-sm text-crimson-bright">{error}</p>}<div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button loading={busy} onClick={clear}>Archive visible history</Button></div>
    </Dialog>
  </div>;
}
