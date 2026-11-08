"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useVoting(path, { mutationPath = path, collection = false } = {}) {
  const [data, setData] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const active = useRef(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const latest = useRef({ revision: -1, version: -1 });
  const controller = useRef(null);
  const lastSuccess = useRef(0);
  const refresh = useCallback(async () => {
    if (locked.current || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    const current = generation.current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 12000);
    try {
      const response = await fetch(path, { cache: 'no-store', signal: request.signal });
      const body = await response.json();
      if ([401, 403, 404, 410].includes(response.status) && active.current && current === generation.current) {
        setData(null); setUpdatedAt(null); setActionError(''); lastSuccess.current = 0;
      }
      if (!response.ok) throw new Error(body.error || 'Voting is not available.');
      if (!active.current || current !== generation.current) return;
      if (body.event) {
        const revision = body.event.revision;
        const version = body.event.version ?? revision;
        if (revision < latest.current.revision || (revision === latest.current.revision && version < latest.current.version)) return;
        latest.current = { revision, version };
      }
      lastSuccess.current = Date.now(); setData(body); setSyncError(''); setUpdatedAt(lastSuccess.current);
      return body;
    } catch (failure) {
      if (active.current && current === generation.current && (!request.signal.aborted || timedOut)) setSyncError(timedOut ? 'Reconnecting · synchronization timed out.' : failure.message || 'Connection interrupted.');
    } finally { clearTimeout(timeout); if (controller.current === request) controller.current = null; }
  }, [path]);
  useEffect(() => {
    active.current = true; locked.current = false; lastSuccess.current = 0; latest.current = { revision: -1, version: -1 }; generation.current += 1;
    setData(null); setUpdatedAt(null); setSyncError(''); setActionError(''); setBusy(false);
    refresh();
    const timer = setInterval(() => { if (!document.hidden) { if (lastSuccess.current && Date.now() - lastSuccess.current > 6500) setSyncError('Reconnecting · displayed totals may be stale.'); refresh(); } }, 2000);
    const reconnect = () => { if (!document.hidden) refresh(); };
    window.addEventListener('online', reconnect); document.addEventListener('visibilitychange', reconnect);
    return () => { active.current = false; generation.current += 1; controller.current?.abort(); controller.current = null; clearInterval(timer); window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', reconnect); };
  }, [refresh]);
  const mutate = async (payload) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setActionError(''); generation.current += 1; controller.current?.abort(); controller.current = null;
    const current = generation.current;
    try {
      const response = await fetch(mutationPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: data?.event?.revision, ...payload }), signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!active.current || current !== generation.current) return false;
      if (!response.ok) throw new Error(body.error || (response.status === 409 ? 'This vote changed. Review the refreshed state and retry.' : 'Could not save.'));
      if (body.event && !collection) { latest.current = { revision: body.event.revision, version: body.event.version ?? body.event.revision }; lastSuccess.current = Date.now(); setData(body); setUpdatedAt(lastSuccess.current); }
      setSyncError('');
      return body;
    } catch (failure) { if (active.current && current === generation.current) setActionError(failure.message || 'Connection interrupted. Check the current state before retrying.'); return false; }
    finally { if (current === generation.current) { locked.current = false; if (active.current) { setBusy(false); refresh(); } } }
  };
  const reload = async () => { controller.current?.abort(); controller.current = null; return refresh(); };
  return { data, error: actionError || syncError, syncError, actionError, busy, updatedAt, refresh, reload, mutate, dismissActionError: () => setActionError('') };
}
