"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Emblem from '@/components/Emblem';
import AdminPlatform from '@/components/platform/AdminPlatform';
import usePlatform from '@/components/platform/usePlatform';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import '@/app/stage.css';

const ATMOSPHERES = { midnight: 'Midnight Violet', electric: 'Electric Aura', reflection: 'Soft Reflection', royal: 'Royal Amethyst', celestial: 'Celestial Night', velvet: 'Velvet Glow', aurora: 'Aurora Violet' };
const MODES = { prompt: 'Spotlight prompt', announcement: 'Stage announcement', reflection: 'Reflection moment', voting: 'Voting Room' };
const SHORTCUTS = [
  ['Stage Announcement', 'Write a message or reuse a saved announcement.', 'Stage Announcements'],
  ['Spotlight Prompt', 'Choose a prompt or invite a new perspective.', 'Spotlight prompts'],
  ['Reflection Moment', 'Make space for a pause, with an optional countdown.', 'Reflection moment'],
  ['Projection Queue', 'Preview the next contribution and send it to screen.', 'Projection queue'],
  ['Visual Atmosphere', 'Preview the lighting and choose the room’s mood.', 'Visual atmosphere'],
];

function SessionSelection({ sessions, session, hasMoreSessions, ambiguousLive }) {
  return <Card className="space-y-4">
    <form method="get" action="/admin/stage" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="block min-w-0 flex-1 text-sm">Discussion stage
        <select name="session" aria-label="Select discussion for Stage" required defaultValue={session?.id || ''} className="mt-2 min-h-11 w-full min-w-0 rounded-control border border-white/20 bg-midnight px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          <option value="" disabled>Choose a discussion</option>
          {sessions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}
        </select>
      </label>
      <Button type="submit" className="w-full sm:w-auto" disabled={!sessions.length}>Open stage controls</Button>
    </form>
    <p className="text-xs leading-relaxed text-muted">{ambiguousLive && !session ? 'More than one discussion is live. Choose the stage you intend to operate. ' : ''}Saved content stays with its discussion. Changing the selection replaces unsaved local drafts.</p>
    {hasMoreSessions && <p className="text-xs text-muted">Showing the 100 most recently updated discussions. <Link href="/admin/sessions" className="text-gold-light underline">Browse all sessions</Link> to find an older discussion.</p>}
  </Card>;
}

function SelectedStage({ session, approved, contributionError }) {
  const { data, error, updatedAt, refresh } = usePlatform(`/api/platform/admin/${session.id}`);
  const controls = useRef(null);
  const [controlsReady, setControlsReady] = useState(false);
  useEffect(() => {
    const root = controls.current;
    if (!root) return;
    const ready = () => SHORTCUTS.every(([, , heading]) => [...root.querySelectorAll('h3')].some(element => element.textContent.startsWith(heading)));
    if (ready()) { setControlsReady(true); return; }
    const observer = new MutationObserver(() => {
      if (ready()) { setControlsReady(true); observer.disconnect(); }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const stage = data?.stage;
  const mode = stage?.overlay?.kind || (data?.projectedPollId ? 'poll' : data?.currentSubmissionId ? 'contribution' : 'waiting');
  const projected = stage?.overlay?.heading || stage?.overlay?.text || data?.polls?.find(poll => poll.id === data.projectedPollId)?.question || approved.find(row => row.id === data?.currentSubmissionId)?.content;
  const next = data?.queue?.[0];
  const status = data?.sessionStatus || session.status;
  const checked = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  function openControl(heading) {
    const root = controls.current;
    if (!root) return;
    if (heading === 'Projection queue') {
      const tab = [...root.querySelectorAll('button')].find(button => button.textContent === 'Projection queue' && button.hasAttribute('aria-pressed'));
      tab?.click();
    }
    const target = [...root.querySelectorAll('h3')].find(element => element.textContent.startsWith(heading));
    if (!target) return;
    const details = target.closest('details');
    if (details) details.open = true;
    target.closest('.premium-surface')?.querySelector('input,textarea,select,button')?.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return <div className="space-y-6" data-stage-session={session.id}>
    <section aria-label="Selected stage preview" className="spill-stage relative isolate overflow-hidden rounded-card border border-white/15 p-5 sm:p-7" data-atmosphere={stage?.atmosphere || 'midnight'}>
      <div className="stage-lightfield" aria-hidden="true"/>
      <div className="stage-contour" aria-hidden="true"/>
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs uppercase tracking-[.18em] text-gold-light">Selected projector stage</p><h2 className="mt-2 break-words font-display text-3xl">{session.title}</h2><p className="mt-2 text-sm capitalize text-muted" data-stage-session-status={status}>{status} discussion · {ATMOSPHERES[stage?.atmosphere] || 'Connecting to atmosphere…'}</p></div><Link href={`/room/${session.public_code}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-control border border-gold/30 bg-midnight/60 px-4 py-2 text-sm text-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Open Room View</Link></div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,.55fr)]">
          <div className="min-w-0 rounded-control border border-white/10 bg-midnight/40 p-4"><p className="text-xs uppercase tracking-[.16em] text-muted">On screen</p><p className="mt-2 font-display text-2xl" data-stage-preview-mode={mode}>{data ? MODES[mode] || (mode === 'poll' ? 'Discussion poll' : mode === 'contribution' ? 'Approved contribution' : status === 'closed' ? 'Discussion closed' : status === 'paused' ? 'Discussion paused' : 'Waiting for the next perspective') : 'Reading the stage…'}</p>{projected && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{projected}</p>}</div>
          <div className="min-w-0 rounded-control border border-white/10 bg-midnight/40 p-4"><p className="text-xs uppercase tracking-[.16em] text-muted">Up next · {data?.queue?.length || 0} queued</p><p className="mt-3 line-clamp-3 text-sm leading-relaxed [overflow-wrap:anywhere]">{next?.content || 'The queue is ready for your next contribution.'}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><div><p role="status" className={`text-xs ${error ? 'text-ink' : 'text-gold-light'}`}>{error ? 'Connection interrupted · preview may be stale' : checked ? `Server synchronized · ${checked} UTC` : 'Connecting to server state…'}</p><p className="mt-1 text-xs text-muted">This is server synchronization, not a projector heartbeat.</p></div><Button variant="ghost" size="sm" onClick={refresh}>Refresh stage preview</Button></div>
      </div>
    </section>
    <section aria-label="Quick stage actions" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SHORTCUTS.map(([label, description, heading]) => <button key={label} type="button" aria-label={label} disabled={!controlsReady} onClick={() => openControl(heading)} className="group min-w-0 rounded-card border border-white/10 bg-surface p-5 text-left transition-colors hover:border-gold/35 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-wait disabled:opacity-60"><span className="block font-display text-xl text-ink">{label}</span><span className="mt-2 block text-xs leading-relaxed text-muted">{description}</span><span aria-hidden="true" className="mt-4 block text-sm text-gold-light">{controlsReady ? 'Open controls →' : 'Connecting to controls…'}</span></button>)}
      <Link href="/admin/voting" className="min-w-0 rounded-card border border-gold/20 bg-surface p-5 text-left transition-colors hover:border-gold/40 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><span className="block font-display text-xl text-ink">Voting Room</span><span className="mt-2 block text-xs leading-relaxed text-muted">Open voting events, presentation links, QR and results controls.</span><span aria-hidden="true" className="mt-4 block text-sm text-gold-light">Open voting →</span></Link>
    </section>
    {contributionError && <p role="status" className="rounded-control border border-gold/20 p-3 text-sm text-muted">Approved contribution choices could not be loaded. Existing queue controls still use current server state. Refresh this page to load contribution choices.</p>}
    <div ref={controls} data-shared-stage-controls={session.id}><AdminPlatform key={session.id} sessionId={session.id} approved={approved}/></div>
    <p className="text-xs leading-relaxed text-muted">These are the same controls and saved records used in <Link href={`/admin/sessions/${session.id}/live`} className="text-gold-light underline">the original session workflow</Link>. Changes from either view synchronize through the existing discussion state.</p>
  </div>;
}

export default function StageControlCentre({ sessions, session, approved = [], contributionError = false, hasMoreSessions = false, ambiguousLive = false }) {
  return <div className="space-y-6">
    <header className="flex items-start gap-4"><Emblem className="h-12 w-12 shrink-0"/><div className="min-w-0"><p className="text-xs uppercase tracking-[.18em] text-gold-light">Spill It · live operations</p><h1 className="mt-2 font-display text-4xl">Stage Control Centre</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">One place to shape what the room sees. Choose the discussion, check the stage, and make your next move.</p></div></header>
    <SessionSelection sessions={sessions} session={session} hasMoreSessions={hasMoreSessions} ambiguousLive={ambiguousLive}/>
    {session ? <SelectedStage key={session.id} session={session} approved={approved} contributionError={contributionError}/> : <Card className="space-y-3 py-10 text-center"><h2 className="font-display text-2xl">Choose the stage you want to prepare.</h2><p className="mx-auto max-w-xl text-sm leading-relaxed text-muted">No discussion has been selected. Choose an existing discussion above to prepare prompts, announcements, lighting and its projection queue.</p><Link href="/admin/sessions" className="inline-block text-sm text-gold-light underline">Manage discussions</Link></Card>}
  </div>;
}
