"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

export default function usePlatform(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const live = useRef(true);
  const locked = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not synchronize.');
      if (live.current && version === generation.current) { setData(previous => Number.isInteger(body.revision) && Number.isInteger(previous?.revision) && body.revision < previous.revision ? previous : body); setUpdatedAt(Date.now()); setError(''); }
    } catch (failure) { if (live.current) setError(failure.message || 'Connection interrupted.'); }
  }, [path]);
  useEffect(() => {
    live.current = true;
    refresh();
    const timer = setInterval(() => { if (!document.hidden && !locked.current) refresh(); }, 4000);
    const reconnect = () => { if (!document.hidden) refresh(); };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    return () => { live.current = false; clearInterval(timer); window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', reconnect); };
  }, [refresh]);
  const mutate = async (payload) => {
    if (locked.current) return false;
    locked.current = true; generation.current += 1; setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: data?.revision, ...payload }), signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) { await refresh(); throw new Error('This discussion changed. Review the refreshed state and retry.'); }
        throw new Error(body.error || 'Action failed. Please retry.');
      }
      await refresh();
      return true;
    } catch (failure) { if (live.current) setError(failure.message || 'Connection interrupted. Confirm the current state before retrying.'); return false; }
    finally { locked.current = false; if (live.current) setBusy(false); }
  };
  return { data, error, busy, updatedAt, refresh, mutate };
}
