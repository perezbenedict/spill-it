'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Expand, Minimize, MousePointer2 } from 'lucide-react';
import Emblem from '@/components/Emblem';
import StageAtmosphere from '@/components/room/StageAtmosphere';
import StageCursor from '@/components/room/StageCursor';
import StagePresentation from '@/components/platform/StagePresentation';
import VotingStage from '@/components/voting/VotingStage';
import '@/app/stage.css';
import './standalone-stage.css';

const POLL_MS = 2500;

export default function StandaloneStageDisplay({ code, initialItem = null, isAdmin = false }) {
  const screenRef = useRef(null);
  const contentRef = useRef(null);
  const latestRevision = useRef(initialItem?.revision ?? -1);
  const [item, setItem] = useState(initialItem);
  const [connection, setConnection] = useState(initialItem ? 'connected' : 'reconnecting');
  const [lastSuccess, setLastSuccess] = useState(null);
  const [clock, setClock] = useState(null);
  const [quality, setQuality] = useState('assessing');
  const [nativeCursor, setNativeCursor] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const overlay = item?.stage?.overlay || null;
  const expiry = overlay?.endsAt ? Date.parse(overlay.endsAt) : NaN;
  const seconds = Number.isFinite(expiry) && clock !== null ? Math.max(0, Math.ceil((expiry - clock) / 1000)) : null;
  const standalone = overlay?.kind === 'announcement' || overlay?.kind === 'voting';
  const identity = JSON.stringify([overlay?.kind, overlay?.text, overlay?.heading, overlay?.eventCode]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [identity]);
  useEffect(() => {
    setClock(Date.now());
    if (!Number.isFinite(expiry)) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  useEffect(() => {
    let disposed = false;
    let timeout = null;
    let inFlight = false;
    let controller = null;
    const schedule = () => {
      if (!disposed && timeout === null) timeout = setTimeout(() => { timeout = null; poll(); }, POLL_MS);
    };
    async function poll() {
      if (disposed || inFlight) return;
      if (document.hidden) { schedule(); return; }
      inFlight = true;
      controller = new AbortController();
      const requestTimeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(`/api/stages/public/${encodeURIComponent(code)}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 404) {
          if (!disposed) { setItem(null); setConnection('missing'); }
          return;
        }
        if (!response.ok) throw new Error('Connection interrupted');
        const data = await response.json();
        const next = data?.item;
        if (!next || next.code !== code || !Number.isSafeInteger(next.revision) || !next.stage) throw new Error('Invalid stage response');
        if (disposed) return;
        if (next.revision >= latestRevision.current) {
          latestRevision.current = next.revision;
          // Expiry can restore an overlay without changing the saved revision.
          const publicItem = { code, title: next.title || '', revision: next.revision,
            stage: { atmosphere: next.stage.atmosphere, overlay: next.stage.overlay || null } };
          setItem(previous => JSON.stringify(previous) === JSON.stringify(publicItem) ? previous : publicItem);
        }
        setConnection('connected');
        setLastSuccess(Date.now());
      } catch {
        if (!disposed) setConnection('reconnecting');
      } finally {
        clearTimeout(requestTimeout);
        controller = null;
        inFlight = false;
        schedule();
      }
    }
    const resume = () => {
      if (document.hidden) return;
      if (timeout !== null) { clearTimeout(timeout); timeout = null; }
      poll();
    };
    poll();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      if (timeout !== null) clearTimeout(timeout);
      controller?.abort();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [code]);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenMessage('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screenRef.current?.requestFullscreen) await screenRef.current.requestFullscreen();
      else setFullscreenMessage('Fullscreen is unavailable here. Use your browser’s fullscreen control.');
    } catch { setFullscreenMessage('Fullscreen could not open. Use your browser’s fullscreen control.'); }
  }, []);

  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    const keydown = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'f' ||
          target?.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
      event.preventDefault();
      toggleFullscreen();
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', keydown); };
  }, [toggleFullscreen]);

  return <div ref={screenRef} className="spill-stage standalone-projector" data-atmosphere={item?.stage?.atmosphere || 'midnight'} data-overlay={overlay?.kind || ''} data-ambient-quality={quality} data-stage-revision={item?.revision}>
    <div className="stage-lightfield" aria-hidden="true" />
    <div className="stage-contour" aria-hidden="true" />
    <div className="stage-horizon" aria-hidden="true" />
    <StageAtmosphere onQualityChange={setQuality} />
    <StageCursor stageRef={screenRef} enabled={!nativeCursor} />
    <header className="standalone-projector-header">
      <div className="standalone-projector-brand"><Emblem className="standalone-projector-emblem" /><span className="font-display text-3xl">Spill It</span></div>
      {!standalone && item?.title && <p className="standalone-projector-title">{item.title}</p>}
    </header>
    <main ref={contentRef} className="standalone-projector-content" tabIndex={0} aria-label="Stage presentation. Scroll to read long content.">
      {connection === 'missing' ? <div className="standalone-projector-idle"><h1>Stage unavailable</h1><p>This stage link is no longer available.</p></div> :
        overlay?.kind === 'voting' && overlay.eventCode ? <div className="standalone-projector-voting"><VotingStage code={overlay.eventCode} embedded /></div> :
        overlay && ['announcement', 'prompt', 'reflection'].includes(overlay.kind) ? <StagePresentation overlay={overlay} seconds={seconds} /> :
        <div className="standalone-projector-idle"><p className="stage-eyebrow">Spill It</p><h1>Ready for the next moment</h1></div>}
    </main>
    <footer className="standalone-projector-footer">
      <div className="standalone-projector-connection" role="status">
        {connection === 'reconnecting' && <span>Reconnecting…</span>}
        {isAdmin && connection === 'reconnecting' && lastSuccess && <span>Last updated {new Date(lastSuccess).toLocaleTimeString()} · display may be stale</span>}
      </div>
      <div className="standalone-projector-controls">
        {isAdmin && <><Link href="/admin/stage?mode=standalone">Stage controls</Link><button type="button" aria-label="Use native cursor only" aria-pressed={nativeCursor} onClick={() => setNativeCursor(value => !value)}><MousePointer2 size={17} aria-hidden="true" /></button></>}
        <button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-keyshortcuts="F" title={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Expand size={18} aria-hidden="true" />}<span> {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span></button>
      </div>
      {fullscreenMessage && <p role="status" className="standalone-projector-fullscreen-message">{fullscreenMessage}</p>}
    </footer>
  </div>;
}
