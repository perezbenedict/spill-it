"use client";
import {useEffect,useState} from 'react';
export default function LowBandwidth(){
  const [enabled,setEnabled]=useState(false),[online,setOnline]=useState(true);
  useEffect(()=>{
    try{setEnabled(localStorage.getItem('spill-low-bandwidth')==='true' || !!navigator.connection?.saveData);}catch{/* local preference optional */}
    const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{document.documentElement.dataset.lowBandwidth=enabled?'true':'false';return()=>{delete document.documentElement.dataset.lowBandwidth;};},[enabled]);
  function toggle(value){setEnabled(value);try{localStorage.setItem('spill-low-bandwidth',String(value));}catch{/* works for this visit */}window.dispatchEvent(new CustomEvent('spill-bandwidth-change',{detail:value}));}
  return <div className="mt-4 space-y-2 text-xs text-muted"><label className="inline-flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} onChange={e=>toggle(e.target.checked)}/>Low bandwidth · fewer audience updates and reduced decoration</label>{!online && <p role="status">You are offline. Keep this page open; your draft stays here. Reconnect before sending. Nothing is sent automatically.</p>}</div>;
}
