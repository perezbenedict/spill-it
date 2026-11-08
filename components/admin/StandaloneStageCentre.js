"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StageControls from '@/components/platform/StageControls';
import StagePresentation from '@/components/platform/StagePresentation';
import { VotingAdministration } from '@/components/voting/AdminVoting';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import '@/app/stage.css';

const ATMOSPHERES = { midnight: 'Midnight Violet', electric: 'Electric Aura', reflection: 'Soft Reflection', royal: 'Royal Amethyst', celestial: 'Celestial Night', velvet: 'Velvet Glow', aurora: 'Aurora Violet' };
const MODES = { prompt: 'Spotlight prompt', announcement: 'Stage announcement', reflection: 'Reflection moment', voting: 'Voting event' };

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Stage request failed. Please retry.'), { status: response.status });
  return body;
}

function SelectedStage({ stageId }) {
  const [item, setItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [actionError, setActionError] = useState('');
  const [checked, setChecked] = useState(null);
  const [events, setEvents] = useState([]);
  const [votingError, setVotingError] = useState('');
  const [eventId, setEventId] = useState('');
  const [votingControlsOpen, setVotingControlsOpen] = useState(false);
  const state = useRef(null);
  const alive = useRef(false);
  const locked = useRef(false);
  const reading = useRef(null);
  const votingRead = useRef(null);
  const generation = useRef(0);
  const path = `/api/stages/admin/${stageId}`;
  const accept = useCallback(next => {
    if (!alive.current || !next || (state.current && next.revision < state.current.revision)) return;
    state.current = next;
    setItem(next);
    setChecked(Date.now());
  }, []);
  const refresh = useCallback(() => {
    if (reading.current) return reading.current;
    const version = generation.current;
    const pending = request(path).then(body => {
      if (alive.current && version === generation.current) { accept(body.item); setSyncError(''); }
    }).catch(error => {
      if (alive.current && version === generation.current) setSyncError(error.message);
    }).finally(() => { if (reading.current === pending) reading.current = null; });
    reading.current = pending;
    return pending;
  }, [path, accept]);
  useEffect(() => {
    alive.current = true;
    let timer;
    async function poll() {
      if (!document.hidden && !locked.current) await refresh();
      if (alive.current) timer = setTimeout(poll, 4000);
    }
    poll();
    return () => { alive.current = false; generation.current += 1; clearTimeout(timer); };
  }, [refresh]);
  const loadVoting = useCallback(() => {
    if (votingRead.current) return votingRead.current;
    const pending = request('/api/voting/admin').then(body => {
      if (alive.current) { setEvents(body.events || []); setVotingError(''); }
    }).catch(error => {
      if (alive.current) setVotingError(error.message);
    }).finally(() => { if (votingRead.current === pending) votingRead.current = null; });
    votingRead.current = pending;
    return pending;
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer;
    async function poll() {
      if (!document.hidden) await loadVoting();
      if (!stopped) timer = setTimeout(poll, 6000);
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [loadVoting]);
  async function run(payload) {
    if (locked.current || !state.current) return false;
    locked.current = true;
    generation.current += 1;
    setBusy(true);
    setActionError('');
    try {
      const result = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: state.current.revision, ...payload }) });
      accept(result.item);
      setSyncError('');
      return result;
    } catch (error) {
      if (error.status === 409) {
        // Wait for any pre-mutation read before obtaining the conflict's current state.
        await reading.current;
        await refresh();
      }
      if (alive.current) setActionError(error.status === 409 ? 'This stage changed. Review the refreshed state and retry. Your draft is still here.' : error.message);
      return false;
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  const event = events.find(row => row.id === eventId);
  const stage = item?.stage;
  const overlay = stage?.overlay?.endsAt && Date.parse(stage.overlay.endsAt) <= Date.now() ? (stage.resumeOverlay?.endsAt && Date.parse(stage.resumeOverlay.endsAt) <= Date.now() ? null : stage.resumeOverlay || null) : stage?.overlay;
  return <div className="space-y-6" data-standalone-stage={stageId}>
    {actionError && <p role="alert" className="rounded-control border border-gold/30 p-4 text-sm">{actionError}</p>}
    <section aria-label="Standalone stage preview" data-atmosphere={stage?.atmosphere || 'midnight'} className="spill-stage relative isolate overflow-hidden rounded-card border border-white/15 p-5 sm:p-7">
      <div className="stage-lightfield" aria-hidden="true"/><div className="stage-contour" aria-hidden="true"/>
      <div className="relative space-y-4">
        <h2 className="break-words font-display text-3xl">{item ? item.title || 'Untitled stage' : 'Reading the stage…'}</h2>
        <p className="text-sm text-muted">{ATMOSPHERES[stage?.atmosphere] || 'Connecting to atmosphere…'}</p>
        <p aria-label="Current stage mode" data-stage-preview-mode={overlay?.kind || 'waiting'} className="font-display text-2xl">{MODES[overlay?.kind] || 'Waiting for the next perspective'}</p>
        {overlay && overlay.kind !== 'voting' && <div className="max-h-72 overflow-y-auto rounded-control focus-visible:outline-2 focus-visible:outline-gold" tabIndex={0} aria-label="Current presentation preview"><StagePresentation compact overlay={overlay} seconds={null}/></div>}
        {overlay?.kind === 'voting' && <p className="text-sm">Following voting event {overlay.eventCode}. Its authorized presentation controls what the projector shows.</p>}
        <p role="status" className="text-xs text-gold-light">{syncError ? `Connection interrupted · ${syncError}` : checked ? `Server synchronized · ${new Date(checked).toLocaleTimeString()}` : 'Connecting to server state…'}</p>
        <p className="text-xs text-muted">Server synchronization does not confirm that a projector is connected.</p>
        <div className="flex flex-wrap gap-3"><Button variant="ghost" disabled={busy} onClick={refresh}>Refresh stage preview</Button>{item && <Link href={`/stage/${item.code}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-control border border-gold/30 px-4 py-2 text-sm text-gold-light">Open standalone projector</Link>}<Button variant="secondary" disabled={busy || !item} onClick={() => run({ action: 'clearStage' })}>Clear stage</Button></div>
        <p className="text-xs text-muted">Clear stage removes the current screen and previous screen history. Saved prompts, announcements and atmosphere stay available.</p>
      </div>
    </section>
    {stage && <StageControls stage={stage} revision={item.revision} busy={busy} run={run}/>}
    <Card className="space-y-4"><h2 className="font-display text-2xl">Project an existing voting event</h2><p className="text-sm text-muted">The stage follows the event’s current authorized presentation. Use its existing controls to select a question, project QR or results, and reveal final results. Hidden results remain private.</p>
      {votingError && <div><p role="alert" className="text-sm">{votingError}</p><Button variant="ghost" onClick={loadVoting}>Retry voting events</Button></div>}
      <label className="block text-sm">Voting event<select value={eventId} onChange={e => { setEventId(e.target.value); setVotingControlsOpen(false); }} className="mt-2 min-h-11 w-full rounded-control border border-white/20 bg-midnight p-3"><option value="">Choose an event</option>{events.map(row => <option key={row.id} value={row.id}>{row.title} · {row.status}</option>)}</select></label>
      {!votingError && !events.length && <p className="text-sm text-muted">No voting events are available. <Link href="/admin/voting" className="text-gold-light underline">Manage voting events</Link></p>}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !stage || !event || ['draft', 'archived'].includes(event?.status)} onClick={() => run({ action: 'configureStage', stage: { ...stage, overlay: { kind: 'voting', eventCode: event.code, endsAt: null } } })}>Project voting event</Button>{event && <Link href={`/admin/voting/${event.id}`} className="text-sm text-gold-light underline">Open voting presentation controls</Link>}</div>
      {event && ['draft', 'archived'].includes(event.status) && <p className="text-sm text-muted">Open this event in voting controls before projecting it.</p>}
      {event && <details open={votingControlsOpen} onToggle={e => setVotingControlsOpen(e.currentTarget.open)}><summary className="cursor-pointer py-3 text-sm text-gold-light">Voting presentation controls</summary>{votingControlsOpen && <VotingAdministration key={event.id} id={event.id}/>}</details>}
    </Card>
  </div>;
}

export default function StandaloneStageCentre({ stageId }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const creatingRef = useRef(false);
  const load = useCallback(async () => {
    try { const body = await request('/api/stages/admin'); setItems(body.items || []); setError(''); }
    catch (failure) { setError(failure.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function create(e) {
    e.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true; setCreating(true); setError('');
    try { const body = await request('/api/stages/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) }); router.push(`/admin/stage?mode=standalone&stage=${body.item.id}`); }
    catch (failure) { setError(failure.message); }
    finally { creatingRef.current = false; setCreating(false); }
  }
  return <div className="space-y-6"><header><p className="text-xs uppercase tracking-[.18em] text-gold-light">Spill It · live operations</p><h1 className="mt-2 font-display text-4xl">Standalone Stage</h1><p className="mt-3 text-sm text-muted">Prepare a persistent projector stage without creating a discussion. Saved content stays with this stage.</p></header>
    <Card className="space-y-4"><form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm">Stage title (optional)<Input className="mt-2" maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/></label><Button type="submit" disabled={creating}>Create standalone stage</Button></form>{error && <div><p role="alert" className="text-sm">{error}</p><Button variant="ghost" onClick={load}>Reload stages</Button></div>}<h2 className="font-display text-xl">Saved standalone stages</h2>{items.length ? <ul className="flex flex-wrap gap-3">{items.map(row => <li key={row.id}><Link href={`/admin/stage?mode=standalone&stage=${row.id}`} aria-current={stageId === row.id ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-control border border-white/20 px-3 py-2 text-sm text-gold-light">{row.title || 'Untitled stage'} · {row.code}</Link></li>)}</ul> : <p className="text-sm text-muted">Create a stage above, or reload to revisit saved stages.</p>}</Card>
    {stageId && <SelectedStage key={stageId} stageId={stageId}/>}
  </div>;
}
