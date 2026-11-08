"use client";

import { useEffect, useRef, useState } from 'react';

export default function StageCursor({ stageRef, enabled = true }) {
  const decoration = useRef(null);
  const [available, setAvailable] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const surface = stageRef.current;
    if (!surface || !enabled) return undefined;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let idleTimer;
    let pressTimer;
    let point = { x: 0, y: 0, interactive: false };
    const supported = () => finePointer.matches && !reduced.matches;
    const hide = () => { clearTimeout(idleTimer); setVisible(false); };
    const preference = () => { setAvailable(supported()); hide(); };
    const paint = () => {
      frame = 0;
      if (!decoration.current) return;
      decoration.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      decoration.current.dataset.interactive = String(point.interactive);
    };
    const move = event => {
      if (!supported() || event.pointerType === 'touch') return;
      const rect = surface.getBoundingClientRect();
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top,
        interactive: event.target instanceof Element && Boolean(event.target.closest('button,a,input,textarea,select,[role="button"]')) };
      setVisible(true);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(hide, 1500);
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const press = () => {
      if (!supported() || !decoration.current) return;
      decoration.current.dataset.pressed = 'true';
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { if (decoration.current) decoration.current.dataset.pressed = 'false'; }, 140);
    };
    const keyboard = event => { if (event.key === 'Tab') hide(); };
    preference();
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', hide);
    surface.addEventListener('pointerdown', press, { passive: true });
    surface.addEventListener('keydown', keyboard);
    finePointer.addEventListener('change', preference);
    reduced.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(idleTimer); clearTimeout(pressTimer);
      surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', hide);
      surface.removeEventListener('pointerdown', press); surface.removeEventListener('keydown', keyboard);
      finePointer.removeEventListener('change', preference); reduced.removeEventListener('change', preference);
    };
  }, [enabled, stageRef]);
  return <div ref={decoration} data-stage-cursor="true" aria-hidden="true" hidden={!enabled || !available || !visible} className="stage-cursor"><span className="stage-cursor-ring" /><span className="stage-cursor-dot" /></div>;
}
