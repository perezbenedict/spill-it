"use client";
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './voting.css';

const COLORS = ['#c4b5fd', '#9b78e4', '#7652bc', '#dfcff7', '#b195d6', '#8f82be'];
function AnimatedNumber({ value, suffix = '', animate = true, initialReveal = false }) {
  const reduce = useReducedMotion();
  const current = useRef(initialReveal && animate && !reduce ? 0 : value);
  const [shown, setShown] = useState(current.current);
  useEffect(() => {
    if (!animate || reduce) { current.current = value; setShown(value); return; }
    const from = current.current;
    if (from === value) return;
    let frame;
    let start;
    const tick = time => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 650);
      current.current = from + (value - from) * (1 - Math.pow(1 - progress, 3));
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate, reduce]);
  return <><span aria-hidden="true">{Math.round(shown)}{suffix}</span><span className="sr-only">{value}{suffix}</span></>;
}

export default function VotingCharts({ question, settings = {}, revealId = 'preview', initialReveal = false }) {
  const reduce = useReducedMotion();
  const options = question.options || [];
  const total = question.totalVotes ?? 0;
  const animate = settings.animations !== false && !reduce;
  let style = settings.visualization || 'bars';
  if ((style === 'donut' && options.length > 6) || (style === 'comparison' && options.length > 3)) style = 'bars';
  const maximum = Math.max(0, ...options.map(option => option.votes || 0));
  const leaders = maximum ? options.filter(option => option.votes === maximum) : [];
  const leaderIds = leaders.map(option => option.id).join(':');
  const previousLeader = useRef(leaderIds);
  const [changedLeader, setChangedLeader] = useState(false);
  useEffect(() => {
    if (previousLeader.current === leaderIds) return;
    previousLeader.current = leaderIds; setChangedLeader(true);
    const timer = setTimeout(() => setChangedLeader(false), 700);
    return () => clearTimeout(timer);
  }, [leaderIds]);
  const transition = { duration: animate ? .7 : 0, ease: [.16, 1, .3, 1] };
  const percent = option => Number(option.percentage || 0);
  const label = option => <div className="voting-result-label"><span>{option.label}</span><span className="voting-result-numbers">{settings.showPercentages !== false && <strong><AnimatedNumber value={percent(option)} suffix="%" animate={animate} initialReveal={initialReveal} /></strong>}{settings.showCounts !== false && <span><AnimatedNumber value={option.votes || 0} animate={animate} initialReveal={initialReveal} /> {option.votes === 1 ? 'vote' : 'votes'}</span>}</span></div>;
  let offset = 0;
  return <section className={`voting-chart voting-chart-${style}`} style={{'--voting-columns':options.length}} data-voting-chart={style} data-voting-visualization={style} data-vote-total={total} data-reveal-id={revealId} aria-label="Voting results">
    <div className="voting-result-summary">{settings.showTotal !== false && <p><AnimatedNumber value={total} animate={animate} initialReveal={initialReveal} /> {total === 1 ? 'vote' : 'votes'} recorded</p>}{settings.highlightLeader !== false && total > 0 && <p className={changedLeader ? 'voting-leader-change' : ''}>{leaders.length > 1 ? 'Tied lead' : 'Most selected'} · {leaders.map(option => option.label).join(' · ')}</p>}</div>
    {!total && <p className="voting-zero" role="status">No votes recorded yet. Every voice starts here.</p>}
    {style === 'donut' && <div className="voting-donut" role="img" aria-label={`Vote distribution. ${options.map(option => `${option.label}: ${option.votes || 0} votes, ${percent(option)} percent`).join('. ')}`}><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" fill="none" stroke="rgba(196,181,253,.1)" strokeWidth="12" />{options.map((option,index) => { const start = offset; offset += percent(option); return <motion.circle key={option.id} cx="60" cy="60" r="48" pathLength="100" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="12" transform="rotate(-90 60 60)" initial={animate && initialReveal ? { strokeDasharray: '0 100', strokeDashoffset: 0 } : false} animate={{ strokeDasharray: `${percent(option)} ${100-percent(option)}`, strokeDashoffset: -start }} transition={transition} />; })}</svg>{settings.showTotal !== false && <div className="voting-donut-total"><strong><AnimatedNumber value={total} animate={animate} initialReveal={initialReveal} /></strong><span>votes</span></div>}</div>}
    <ol className="voting-result-options">{options.map((option,index) => <motion.li key={option.id} className={settings.highlightLeader !== false && leaders.length === 1 && leaders[0].id === option.id ? 'voting-result-option voting-result-leading' : 'voting-result-option'} initial={animate && initialReveal ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ ...transition, delay: animate && initialReveal ? index * .045 : 0 }}>
      {label(option)}
      {style !== 'donut' && <div className="voting-result-track" aria-hidden="true"><motion.div className="voting-result-fill" style={{ background: `linear-gradient(90deg,${COLORS[index % COLORS.length]},#7952b5)` }} initial={animate && initialReveal ? { [style === 'comparison' ? 'scaleY' : 'scaleX']: 0 } : false} animate={{ [style === 'comparison' ? 'scaleY' : 'scaleX']: percent(option)/100 }} transition={transition} /></div>}
      {style === 'donut' && <span className="voting-legend-dot" aria-hidden="true" style={{background:COLORS[index % COLORS.length]}} />}
    </motion.li>)}</ol>
  </section>;
}
