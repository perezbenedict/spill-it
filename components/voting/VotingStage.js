"use client";
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import StageAtmosphere from '@/components/room/StageAtmosphere';
import Emblem from '@/components/Emblem';
import VotingCharts from './VotingCharts';
import VotingQR from './VotingQR';
import useVoting from './useVoting';
import './voting.css';
import '@/app/stage.css';

export function VotingStageContent({ event, error = '', preview = false }) {
  const reduce = useReducedMotion();
  const question = event.questions.find(item => item.id === event.presentation?.questionId) || event.questions[0];
  const content = event.presentation?.content || 'question';
  const showResults = content === 'results' && (preview || event.resultsVisible);
  const reveal = event.presentation?.revealId || 'initial';
  const round = event.currentRound || 1;
  const animation = event.settings?.animations !== false && !reduce;
  const observed = useRef({ initialized: false, reveal: null, visible: false, questionId: null, round: null });
  const initialReveal = !preview && observed.current.initialized && showResults &&
    (!observed.current.visible || observed.current.reveal !== reveal || observed.current.questionId !== question?.id || observed.current.round !== round);
  useEffect(() => { observed.current = { initialized: true, reveal, visible: showResults, questionId: question?.id, round }; }, [reveal, showResults, question?.id, round]);
  if (!question) return <p className="voting-stage-empty">No voting question is ready yet.</p>;
  return <div className="voting-stage-content" data-voting-stage="true" data-voting-round={round} data-question-length={question.text.length > 100 ? 'long' : 'short'} data-reveal-id={showResults ? reveal : undefined} data-voting-version={event.version} data-voting-revision={event.revision}>
    {error && <p role="status" className="voting-sync-error">Reconnecting · displayed information may be stale</p>}
    {preview && <p className="voting-preview-label">Private moderator preview · not published</p>}
    <AnimatePresence mode="wait" initial={false}><motion.div key={`${round}:${question.id}:${content}:${showResults ? reveal : 'hidden'}`} initial={animation ? { opacity:0,y:12 } : false} animate={{opacity:1,y:0}} exit={{opacity:0,y:animation?-8:0}} transition={{duration:animation ? 0.35 : 0}} className="voting-stage-segment">
      <p className="voting-eyebrow">{showResults ? event.status === 'open' ? 'The room is speaking' : 'The final perspective' : 'Have your say'}</p>
      {content !== 'hidden' && <h1 className="voting-stage-question">{question.text}</h1>}
      {content === 'hidden' ? <p className="voting-stage-empty">Voting presentation is hidden.</p> : showResults ? <motion.div className="voting-chart-reveal" key={`${question.id}:${reveal}:${event.settings?.visualization}`} initial={animation && observed.current.initialized ? {opacity:0} : false} animate={{opacity:1}} transition={{duration:animation ? 0.35 : 0}}><VotingCharts question={question} settings={event.settings} revealId={reveal} initialReveal={initialReveal} /></motion.div> : content === 'qr' ? <VotingQR code={event.code} /> : <div className="voting-question-choices">{question.options.map(option=><p key={option.id}>{option.label}</p>)}</div>}
      {content === 'results' && !showResults && <p className="voting-hidden-notice" role="status">{event.previouslyPublic ? 'Result updates are paused. Earlier results were publicly visible.' : 'Results are held privately until the moderator reveals them.'}</p>}
      {!showResults && event.status === 'open' && content !== 'qr' && content !== 'hidden' && <a className="voting-stage-link" href={`/vote/${event.code}`}>Vote at /vote/{event.code}</a>}
    </motion.div></AnimatePresence>
  </div>;
}

export default function VotingStage({ code, embedded = false }) {
  const { data, error } = useVoting(`/api/voting/public/${code}`);
  const [quality, setQuality] = useState('assessing');
  const event = data?.event;
  const content = !event ? <p role={error?'alert':'status'} className="voting-stage-empty">{error || 'Connecting to the vote…'}</p> : <VotingStageContent event={event} error={error} />;
  if (embedded) return <div className="voting-stage-embedded">{content}</div>;
  return <div className="spill-stage voting-projector" data-atmosphere={event?.settings?.atmosphere || 'midnight'} data-ambient-quality={quality}>
    <div className="stage-lightfield" aria-hidden="true"/>
    <StageAtmosphere onQualityChange={setQuality}/>
    <div className="voting-stage-architecture" aria-hidden="true"><span/><span/><span/></div>
    <div className="stage-horizon" aria-hidden="true"/>
    <header className="voting-projector-brand">
      <div className="voting-brand" data-voting-brand="projector"><Emblem className="voting-brand-emblem"/><span className="voting-brand-name">Spill It</span><span className="voting-brand-note">A roomful of perspectives</span></div>
      <span className="voting-projector-status voting-eyebrow">{event?.status === 'open' ? 'Live voting' : event?.status === 'closed' ? 'Voting closed' : 'Voting room'}{event?.currentRound ? ` · Round ${event.currentRound}` : ''}</span>
    </header>
    <main className="voting-projector-main" tabIndex={0} aria-label="Voting presentation">{content}</main>
  </div>;
}
