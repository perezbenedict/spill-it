"use client";
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import useVoting from './useVoting';
import VotingCharts from './VotingCharts';
import './voting.css';
import '@/app/stage.css';

export default function VotingParticipant({ code }) {
  const { data, error, busy, mutate } = useVoting(`/api/voting/public/${code}`, { mutationPath: `/api/voting/public/${code}/vote` });
  const [selected, setSelected] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [notice, setNotice] = useState('');
  const reduce = useReducedMotion();
  const event = data?.event;
  const question = event?.questions.find(item => !confirmed[item.id]) || event?.questions[0];
  const done = event && event.questions.every(item => confirmed[item.id]);
  async function vote(e) {
    e.preventDefault(); setNotice('');
    const result = await mutate({ questionId: question.id, optionId: selected[question.id] });
    if (result) { setConfirmed(old => ({ ...old, [question.id]: true })); setNotice('Vote received for this browser.'); }
  }
  return <div className="spill-stage voting-voter-shell" data-atmosphere={event?.settings?.atmosphere || 'midnight'}><div className="stage-lightfield" aria-hidden="true"/><main className="voting-participant relative z-10 mx-auto w-full max-w-2xl px-gutter py-section"><Link href="/" className="text-sm text-gold-light underline-offset-4 hover:underline">Spill It</Link>
    {!event ? <p className="mt-10" role={error?'alert':'status'}>{error || 'Opening your vote…'}</p> : <>
      <p className="voting-eyebrow mt-10">{event.title}</p>
      {error && <p role="alert" className="voting-sync-error">{error} Displayed information may be stale.</p>}
      {done ? <motion.section className="voting-confirmation" initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}}><div className="voting-confirmation-seal" aria-hidden="true">✓</div><h1 className="font-display text-4xl">Your voice is in.</h1><p className="mt-4 text-muted">Thank you for adding your perspective.</p></motion.section> : question && <form onSubmit={vote} className="mt-4 space-y-6"><fieldset role="radiogroup" aria-label={question.text} disabled={busy || event.status !== 'open'}><legend className="voting-voter-question"><h1>{question.text}</h1></legend><div className="mt-7 space-y-3">{question.options.map(option=><label key={option.id} className={`voting-choice ${selected[question.id]===option.id?'voting-choice-selected':''}`}><input type="radio" name={question.id} value={option.id} checked={selected[question.id]===option.id} onChange={()=>setSelected(old=>({...old,[question.id]:option.id}))} required/><span>{option.label}</span></label>)}</div></fieldset>{event.status === 'open' ? <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!selected[question.id]}>Submit vote</Button> : <p role="status" className="voting-hidden-notice">{event.status === 'draft' ? 'Voting has not opened yet.' : 'Voting is closed.'}</p>}</form>}
      {notice && <p role="status" className="mt-5 text-gold-light">{notice}</p>}
      {event.status !== 'open' && event.settings?.participantResults && event.questions.filter(item=>item.resultsVisible).map(item=><section key={item.id} className="mt-10"><h2 className="font-display text-2xl">{item.text}</h2><VotingCharts question={item} settings={event.settings}/></section>)}
      <p className="mt-8 text-xs leading-relaxed text-muted">Anonymous browser voting prevents accidental duplicate answers in this browser. It cannot guarantee one vote per physical person across different browsers or devices. No nickname is required.</p>
    </>}
  </main></div>;
}
