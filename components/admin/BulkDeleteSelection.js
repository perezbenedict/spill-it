"use client";
import { useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import StageFeedback from '@/components/platform/StageFeedback';

export default function BulkDeleteSelection({ records, resource, endpoint, selected, setSelected, onDeleted, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  async function remove(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ action: 'bulkDelete', items: Object.values(selected).map(row => ({ id: row.id, revision: row.revision })), password, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Deletion could not be confirmed. Refresh before retrying.');
      const deleted = new Set(body.deletedIds || []);
      setSelected(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !deleted.has(id))));
      onDeleted([...deleted]);
      const rejected = body.results.filter(row => row.status !== 'deleted');
      setNotice(`${deleted.size} ${resource} deleted.`);
      if (rejected.length) setError(`${rejected.length} selected records were not deleted. ${rejected[0].reason} Deselect and select them again after reviewing current state.`);
      setOpen(false); setPassword('');
    } catch (failure) { setError(failure.message); }
    finally { locked.current = false; setBusy(false); }
  }
  const count = Object.keys(selected).length;
  return <div className="space-y-3" aria-label={`${resource} bulk selection`}>
    <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="ghost" disabled={busy || disabled || !records.length} onClick={() => setSelected(previous => { const next = { ...previous }; for (const row of records) { if (!next[row.id] && Object.keys(next).length < 50) next[row.id] = row; } return next; })}>Select displayed</Button><Button size="sm" variant="ghost" disabled={busy || !count} onClick={() => setSelected({})}>Deselect all</Button><span role="status" className="text-sm text-muted">{count} selected · maximum 50</span><Button size="sm" variant="danger" disabled={busy || disabled || !count} onClick={() => { setOpen(true); setPassword(''); setError(''); }}>Delete selected</Button></div>
    <p className="text-xs text-muted">Select displayed selects only currently loaded, visible records, up to 50. Loading another page never selects new records automatically. Selection keeps the revision you selected; changed records must be reviewed and selected again.</p>
    <StageFeedback message={notice} error={open ? '' : error} onMessageDismiss={() => setNotice('')} onDismiss={() => setError('')}/>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title={`Delete ${count} ${resource}?`} description={resource === 'standalone stages' ? 'This permanently removes selected stages, saved announcements, prompts, presentation configuration and projector links. Open projectors will become unavailable and current presentations will be interrupted. Discussions and voting data are not deleted.' : 'This permanently removes eligible selected voting events, questions, ballots, counts and rounds. Open or projected events must first be closed, hidden and detached from all stages. Discussions and standalone stages remain intact.'}>
      <form onSubmit={remove} className="space-y-4"><ul className="max-h-40 overflow-y-auto text-sm">{Object.values(selected).map(row => <li key={row.id} className="break-words">{row.title || 'Untitled stage'} · {row.code || row.id}</li>)}</ul><label className="block text-sm">Admin password<Input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-crimson-bright">{error}</p>}<div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="danger" loading={busy} disabled={!password || !count}>Delete permanently</Button></div></form>
    </Dialog>
  </div>;
}
