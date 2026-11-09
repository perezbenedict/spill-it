"use client";

import { useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';

export default function StageFeedback({ message, error, onDismiss, onMessageDismiss }) {
  const dismissRef = useRef(onMessageDismiss || onDismiss);
  dismissRef.current = onMessageDismiss || onDismiss;
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => dismissRef.current?.(), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message && !error) return null;

  return <div className="space-y-2 lg:col-span-2" data-stage-feedback>
    {message && <p role="status" aria-live="polite" aria-atomic="true" className="rounded-control border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold-light motion-reduce:transition-none">{message}</p>}
    {error && <div role="alert" aria-atomic="true" className="flex items-center justify-between gap-3 rounded-control border border-crimson/50 bg-crimson/10 px-4 py-3 text-sm motion-reduce:transition-none"><p>{error}</p><Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss stage error">Dismiss</Button></div>}
  </div>;
}
