"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

export default function useDirector(id,standalone=false) {
  const path=`/api/director/${standalone?'standalone/':''}admin/${id}`;
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(null);
  const alive=useRef(false), locked=useRef(false), reading=useRef(false), generation=useRef(0), failure=useRef('');
  const refresh=useCallback(async()=>{
    if(reading.current) return;
    reading.current=true;
    const version=generation.current;
    try {
      const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      const body=await response.json();
      if(!response.ok) throw Error(body.error || 'Event checks unavailable.');
      if(alive.current && version===generation.current) {setData(previous=>previous && (body.revision<previous.revision || (body.revision===previous.revision && body.platformRevision<previous.platformRevision)) ? previous : body);setError(failure.current);}
    } catch { if(alive.current) setError('Connection interrupted. Live may have changed. Reconnect before taking a cue.'); }
    finally {reading.current=false;}
  },[path]);
  useEffect(()=>{
    alive.current=true;
    let timer;
    const poll=async()=>{if(!document.hidden && !locked.current) await refresh(); if(alive.current) timer=setTimeout(poll,4000);};
    poll();
    const reconnect=()=>{if(!document.hidden) refresh();};
    window.addEventListener('online',reconnect);document.addEventListener('visibilitychange',reconnect);
    return()=>{alive.current=false;clearTimeout(timer);window.removeEventListener('online',reconnect);document.removeEventListener('visibilitychange',reconnect);};
  },[refresh]);
  async function send(fields,retry=false) {
    if(locked.current || (!retry && uncertain)) return false;
    const payload=retry ? uncertain : {expectedRevision:data?.revision,expectedPlatformRevision:data?.platformRevision,requestId:crypto.randomUUID(),...fields};
    if(!payload) return false;
    locked.current=true;generation.current++;setBusy(true);setError('');
    try {
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)});
      if(response.status>=500) throw Error('Could not confirm the server response.');
      const body=await response.json();
      if(!response.ok) {setUncertain(null);await refresh();failure.current=body.error || 'Review the refreshed event before retrying.';setError(failure.current);return false;}
      if(alive.current) {setData(body);setUncertain(null);failure.current='';setError('');}return true;
    } catch {if(alive.current){setUncertain(payload);failure.current='Outcome unconfirmed. Retry the same action; the server will apply it at most once.';setError(failure.current);}return false;}
    finally {locked.current=false;if(alive.current)setBusy(false);}
  }
  return {data,error,busy,uncertain,refresh,send};
}
