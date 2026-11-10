"use client";
import {useEffect,useRef,useState} from 'react';
import usePlatform from '@/components/platform/usePlatform';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ActivityResults from './ActivityResults';

export default function AudienceActivities({code,stageId}) {
  const {data,error,refresh}=usePlatform(`/api/director/public/${code}`, {allowLowBandwidth:!stageId});
  const activity=stageId ? data?.activities?.find(a=>a.id===stageId) : data?.activities?.find(a=>a.status==='open');
  const [item,setItem]=useState(''),[feedback,setFeedback]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{setItem('');setFeedback('');setSent(false);},[activity?.id]);
  async function respond(event) {
    event.preventDefault();if(lock.current || !activity || sent)return;lock.current=true;setBusy(true);setFeedback('');
    try {
      const response=await fetch(`/api/director/public/${code}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activityId:activity.id,item}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();if(!response.ok)throw Error(body.error || 'Please retry.');
      setSent(true);setFeedback(activity.kind==='wordcloud'?'Your word is with the moderator.':'Your response is received.');await refresh();
    }catch(failure){setFeedback(failure.message || 'Response unconfirmed. Retry the same answer safely.');}
    finally{lock.current=false;setBusy(false);}
  }
  if(stageId) return <div className="w-full text-center">{activity ? <ActivityResults activity={activity} large/> : <p role="status">{error?'Reconnecting to audience activity…':'Loading audience activity…'}</p>}</div>;
  if(!activity) return null;
  const choices=activity.kind==='debate' ? [{id:'agree',content:'Agree'},{id:'disagree',content:'Disagree'}] : activity.kind==='scale' ? [1,2,3,4,5].map(n=>({id:String(n),content:`${n} / 5`})) : activity.questions || [];
  return <Card className="mt-6 space-y-4" aria-label="Optional audience activity"><p className="text-xs text-gold-light">Optional · {{wordcloud:'Word cloud',questions:'Question priorities',debate:'Two perspectives',scale:'Scale voting'}[activity.kind]}</p><h2 className="break-words font-display text-2xl">{activity.prompt}</h2>
    {sent ? <p role="status">{feedback}</p> : <form onSubmit={respond} className="space-y-3"><fieldset disabled={busy}><legend className="sr-only">Your anonymous response</legend>{activity.kind==='wordcloud' ? <label className="block text-sm">A word or short phrase<input maxLength={30} required value={item} onChange={e=>setItem(e.target.value)} className="mt-2 min-h-12 w-full rounded-control border border-white/20 bg-surface px-3"/></label> : <div className="space-y-2">{choices.map(choice=><label key={choice.id} className="flex min-h-12 items-center gap-3 rounded-control border border-white/15 p-3 text-sm"><input required type="radio" name={activity.id} checked={item===choice.id} onChange={()=>setItem(choice.id)}/><span className="break-words">{choice.content}</span></label>)}</div>}</fieldset><Button type="submit" loading={busy} disabled={!item.trim()}>Send response</Button></form>}
    {!sent && feedback && <p role="status" className="text-sm">{feedback}</p>}
    <p className="text-xs text-muted">One response per activity in this browser. No name is collected. Word cloud entries require moderation. Results need an explicit reveal and five approved responses.</p>
    {activity.revealed && <ActivityResults activity={activity}/>}
  </Card>;
}
