export default function PollResults({ poll, large = false }) {
  if (!poll) return null;
  const total = poll.totalVotes ?? poll.total_votes ?? (poll.options || []).reduce((sum, option) => sum + Number(option.votes || option.count || 0), 0);
  return <section aria-label="Poll results" className={`min-w-0 space-y-5 ${large ? 'mx-auto w-full max-w-4xl' : ''}`}>
    <div><p className="text-xs uppercase tracking-[0.2em] text-gold-light">Audience pulse · {poll.status}</p><h2 className={`mt-2 break-words font-display font-normal text-ink ${large ? 'text-3xl sm:text-5xl' : 'text-xl'}`}>{poll.question}</h2></div>
    {(poll.options || []).map((option) => { const votes = Number(option.votes || option.count || 0); const percent = total ? Math.round(votes / total * 100) : 0; return <div key={option.id} className="space-y-2"><div className="flex justify-between gap-4 text-sm"><span className="min-w-0 break-words">{option.label || option.text}</span><span className="shrink-0 tabular-nums">{percent}% · {votes}</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold-light" style={{ width: `${percent}%` }} /></div></div>; })}
    <p className="text-sm text-muted">{total} anonymous browser vote{total === 1 ? '' : 's'}</p>
  </section>;
}
