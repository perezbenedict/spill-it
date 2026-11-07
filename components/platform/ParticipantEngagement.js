"use client";
import { useEffect, useState } from 'react';
import usePlatform from './usePlatform';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function ParticipantEngagement({ sessionCode }) {
  const { data, error, refresh } = usePlatform(`/api/platform/public/${sessionCode}`);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [choice, setChoice] = useState('');
  const [voted, setVoted] = useState(null);
  const [cooldown, setCooldown] = useState(false);
  const poll = data?.poll;
  useEffect(() => { setChoice(''); setFeedback(''); try { setVoted(poll?.id && sessionStorage.getItem(`spill-vote-${sessionCode}-${poll.id}`) ? poll.id : null); } catch { setVoted(null); } }, [poll?.id, sessionCode]);
  async function send(operation, body) {
    if (pending || (operation === 'reactions' && cooldown)) return;
    setPending(true); setFeedback('');
    try {
      const response = await fetch(`/api/platform/public/${sessionCode}/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
      else if (operation === 'vote') { setVoted(poll.id); try { sessionStorage.setItem(`spill-vote-${sessionCode}-${poll.id}`, '1'); } catch { /* Server-side vote uniqueness still applies when storage is unavailable. */ } setFeedback('Your vote is in. Thank you for taking part.'); }
      else { setFeedback('Reaction sent.'); setCooldown(true); window.setTimeout(() => setCooldown(false), 3000); }
      await refresh();
    } catch (failure) { setFeedback(failure.message || 'Connection interrupted. Please retry.'); }
    finally { setPending(false); }
  }
  if (!poll && !data?.reactionsEnabled) return null;
  return <aside aria-label="Audience participation" className="mt-6 space-y-4">
    {poll && <Card className="space-y-4"><p className="text-xs uppercase tracking-[0.18em] text-gold-light">Live audience poll</p><h2 className="break-words font-display text-2xl">{poll.question}</h2>{voted === poll.id ? <p role="status" className="text-sm text-gold-light">Vote received for this browser.</p> : <form onSubmit={event => { event.preventDefault(); send('vote', { poll_id: poll.id, option_id: choice }); }}><fieldset disabled={pending || poll.status !== 'open'} className="space-y-2"><legend className="sr-only">Choose one answer</legend>{(poll.options || []).map(option => <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-white/15 bg-midnight/25 p-3 text-sm has-[:checked]:border-gold has-[:checked]:bg-gold/10"><input type="radio" name={`poll-${poll.id}`} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} required className="accent-[#A78BFA]" /><span className="break-words">{option.label}</span></label>)}</fieldset><Button className="mt-3" type="submit" loading={pending} disabled={!choice || poll.status !== 'open'}>Submit vote</Button></form>}<p className="text-xs leading-relaxed text-muted">Anonymous browser voting limits repeat votes from this browser. It cannot guarantee one vote per physical person. Clearing cookies or using another browser may allow another vote.</p></Card>}
    {data?.reactionsEnabled && <Card className="space-y-3"><h2 className="font-display text-xl">Add a little audience energy</h2><div className="flex flex-wrap gap-2">{[['agree', 'I agree', '🤝'], ['insight', 'Insightful', '💭'], ['heart', 'Appreciation', '💜']].map(([reaction, label, symbol]) => <Button key={reaction} variant="secondary" disabled={pending || cooldown} onClick={() => send('reactions', { reaction })} aria-label={label}>{symbol} {label}</Button>)}</div><p className="text-xs text-muted">A shared pulse, never a score. Take a moment between reactions.</p></Card>}
    {(feedback || error) && <p role="status" className="text-sm text-gold-light">{feedback || 'Audience updates are reconnecting. Your contribution form is still available.'}</p>}
  </aside>;
}
