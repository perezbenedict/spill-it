"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

export default function usePlatform(path, { allowLowBandwidth = false } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const live = useRef(true), locked = useRef(false), reading = useRef(false), generation = useRef(0), sequence = useRef(0);
  const mutationFailure = useRef('');
  const refresh = useCallback(async () => {
    if (reading.current) return;
    reading.current=true;
    const version = generation.current, requestSequence=++sequence.current;
    try {
      const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not synchronize.');
      if (live.current && version === generation.current && requestSequence===sequence.current) { setData(previous => Number.isInteger(body.revision) && Number.isInteger(previous?.revision) && body.revision < previous.revision ? previous : body); setUpdatedAt(Date.now()); setError(mutationFailure.current); }
    } catch (failure) { if (live.current && version===generation.current) setError(mutationFailure.current || failure.message || 'Connection interrupted.'); }
    finally { reading.current=false; }
  }, [path]);
  useEffect(() => {
    live.current = true; generation.current++;setData(null);
    let timer,disposed=false,slow=false;
    try {slow=allowLowBandwidth && (localStorage.getItem('spill-low-bandwidth')==='true' || !!navigator.connection?.saveData);}catch{/* storage optional */}
    const poll=async()=>{if(!document.hidden && !locked.current)await refresh();if(!disposed)timer=setTimeout(poll,slow?15000:4000);};
    poll();
    const reconnect = () => { if (!document.hidden && !locked.current) refresh(); };
    const bandwidth=e=>{slow=allowLowBandwidth && e.detail===true;};
    window.addEventListener('online', reconnect); window.addEventListener('spill-bandwidth-change',bandwidth);
    document.addEventListener('visibilitychange', reconnect);
    return () => { disposed=true;live.current = false;generation.current++; clearTimeout(timer); window.removeEventListener('online', reconnect);window.removeEventListener('spill-bandwidth-change',bandwidth); document.removeEventListener('visibilitychange', reconnect); };
  }, [refresh, allowLowBandwidth]);
  const mutate = async (payload) => {
    if (locked.current) return false;
    locked.current = true; generation.current += 1; mutationFailure.current = ''; setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: data?.revision, ...payload }), signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) { await refresh(); throw new Error('This discussion changed. Review the refreshed state and retry.'); }
        throw new Error(body.error || 'Action failed. Please retry.');
      }
      if (live.current && Number.isInteger(body.revision)) {setData(body);setUpdatedAt(Date.now());}
      await refresh();return true;
    } catch (failure) { mutationFailure.current = failure.message || 'Connection interrupted. Confirm the current state before retrying.'; if (live.current) setError(mutationFailure.current); return false; }
    finally { locked.current = false; if (live.current) setBusy(false); }
  };
  return { data, error, busy, updatedAt, refresh, mutate, mutationFailure };
}
