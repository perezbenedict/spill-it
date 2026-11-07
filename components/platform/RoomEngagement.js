"use client";
import usePlatform from './usePlatform';
import PollResults from './PollResults';
import { useEffect } from 'react';

export default function RoomEngagement({ sessionCode, onPollChange, onStageChange }) {
  const { data } = usePlatform(`/api/platform/public/${sessionCode}`);
  const poll = data?.presentationPoll || data?.projectedPoll;
  const hasPoll = Boolean(poll);
  useEffect(() => { onPollChange?.(hasPoll); }, [hasPoll, onPollChange]);
  useEffect(() => { onStageChange?.(data?.stage || null); }, [data?.stage, onStageChange]);
  // Keep the contribution region reserved; result projection uses its own
  // readable panel rather than floating graphics over a contribution.
  return <>
    {poll && <div className="relative z-20 mx-auto w-full max-w-5xl px-5 py-6" data-projected-poll={poll.id}><PollResults poll={poll} large /></div>}
    {data?.reactionsEnabled && <div aria-label="Audience reaction totals" className="relative z-10 mx-auto flex min-h-12 max-w-full flex-wrap justify-center gap-4 px-5 pb-3 text-sm text-muted">{(data.reactions || []).map(item => <span key={item.reaction} className="rounded-full border border-white/10 bg-surface/60 px-3 py-1 tabular-nums">{{ agree: '🤝', insight: '💭', heart: '💜' }[item.reaction] || item.reaction} {item.count}</span>)}</div>}
  </>;
}
