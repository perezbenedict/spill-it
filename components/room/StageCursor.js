"use client";

import { useEffect, useRef, useState } from 'react';

export default function StageCursor({ stageRef, enabled = true }) {
  const decoration = useRef(null);
  const [available, setAvailable] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const surface = stageRef.current;
    if (!surface || !enabled) return undefined;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let idleTimer;
    let pressTimer;
    let fadeTimer;
    let selecting = false;
    let point = { x: 0, y: 0, interactive: false };
    const supported = () => finePointer.matches && !reduced.matches;
    const hide = () => { clearTimeout(idleTimer); clearTimeout(fadeTimer); setFading(false); setVisible(false); };
    const fade = () => { setFading(true); fadeTimer = setTimeout(hide, 180); };
    const preference = () => { setAvailable(supported()); hide(); };
    const paint = () => {
      frame = 0;
      if (!decoration.current) return;
      decoration.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      decoration.current.dataset.interactive = String(point.interactive);
    };
    const move = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!supported() || event.pointerType === 'touch' || selecting || event.buttons || document.getSelection()?.toString() ||
          target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]') ||
          (target && getComputedStyle(target).cursor === 'text')) { hide(); return; }
      const rect = surface.getBoundingClientRect();
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top,
        interactive: Boolean(target?.closest('button,a,[role="button"]')) };
      setVisible(true);
      setFading(false); clearTimeout(fadeTimer); clearTimeout(idleTimer);
      idleTimer = setTimeout(fade, 1500);
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const press = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('button,a,[role="button"]')) { selecting = true; hide(); return; }
      if (!supported() || !decoration.current) return;
      decoration.current.dataset.pressed = 'true';
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { if (decoration.current) decoration.current.dataset.pressed = 'false'; }, 140);
    };
    const release = () => { selecting = false; };
    const selection = () => { if (document.getSelection()?.toString()) hide(); };
    const keyboard = event => { if (event.key === 'Tab') hide(); };
    preference();
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', hide);
    surface.addEventListener('pointerdown', press, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('selectionchange', selection);
    surface.addEventListener('keydown', keyboard);
    finePointer.addEventListener('change', preference);
    reduced.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(idleTimer); clearTimeout(pressTimer); clearTimeout(fadeTimer);
      surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', hide);
      surface.removeEventListener('pointerdown', press); surface.removeEventListener('keydown', keyboard);
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
      document.removeEventListener('selectionchange', selection);
      finePointer.removeEventListener('change', preference); reduced.removeEventListener('change', preference);
    };
  }, [enabled, stageRef]);
  return <div ref={decoration} data-stage-cursor="true" data-fading={fading} aria-hidden="true" hidden={!enabled || !available || !visible} className="stage-cursor"><svg className="stage-cursor-flame" viewBox="39 22 42 72" focusable="false"><path d="M60 26 C69 43 78 52 75 67 C72.5 79 65 87 60 90 C55 87 47.5 79 45 67 C42 52 51 43 60 26Z" fill="currentColor"/><path d="M60 49 C64.5 59 69 63.5 67 71 C65.4 77 62 80 60 81 C58 80 54.6 77 53 71 C51 63.5 55.5 59 60 49Z" fill="#241337"/></svg></div>;
}
