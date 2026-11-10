"use client";
export default function ActivityResults({activity,large=false}) {
  if(!activity) return null;
  const results=activity.results;
  return <section aria-label="Audience activity results" className={`mx-auto w-full ${large?'max-w-5xl py-10':'py-3'}`}>
    <p className="stage-eyebrow">{{wordcloud:'Shared words',debate:'Room perspectives',questions:'Audience priorities',scale:'Room temperature'}[activity.kind]}</p>
    <h2 className={`mt-4 break-words font-display ${large?'text-[clamp(1.5rem,4vw,4rem)]':'text-xl'}`}>{activity.prompt}</h2>
    {!results ? <p className="mt-5 text-sm text-muted">Results stay private until the moderator reveals them and at least five approved responses are available.</p> : <>
      {activity.kind==='scale' && <p className="my-5 text-4xl tabular-nums text-gold-light">{results.average} <span className="text-base">/ 5</span></p>}
      <div className={activity.kind==='wordcloud'?'mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-4':'mt-5 space-y-4'}>{results.items.slice(0,50).map(item=>{
        const label=activity.kind==='questions' ? activity.questions?.find(q=>q.id===item.label)?.content || 'Approved question' : item.label;
        return activity.kind==='wordcloud' ? <span key={item.label} className="break-words font-display text-gold-light" style={{fontSize:`${Math.min(3,1+item.count/results.total*4)}em`,overflowWrap:'anywhere'}}>{label}<span className="sr-only"> · {item.count} responses</span></span> : <div key={item.label} className="min-w-0"><div className="flex justify-between gap-5 text-sm"><span className="break-words">{label}</span><span className="tabular-nums">{item.count}</span></div><div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-gold/10"><div className="h-full rounded-full bg-gold" style={{width:`${item.count/results.total*100}%`}}/></div></div>;
      })}</div><p className="mt-5 text-xs text-muted">{results.total} approved responses · anonymous browser participation</p>
    </>}
  </section>;
}
