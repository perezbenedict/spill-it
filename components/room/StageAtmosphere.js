"use client";

import Emblem from '@/components/Emblem';
import { useEffect } from 'react';

export default function StageAtmosphere({ onQualityChange }) {
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let resizeTimer;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const assess = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      if (preference.matches || navigator.connection?.saveData) {
        onQualityChange?.('quiet');
        return;
      }
      onQualityChange?.('assessing');
      let start;
      let intervals = 0;
      const sample = timestamp => {
        if (disposed) return;
        if (start === undefined) start = timestamp;
        else intervals += 1;
        if (timestamp - start < 2000) frame = requestAnimationFrame(sample);
        else onQualityChange?.((timestamp - start) / Math.max(1, intervals) > 45 ? 'quiet' : 'full');
      };
      frame = requestAnimationFrame(sample);
    };
    const resize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(assess, 250); };
    document.fonts.ready.then(assess);
    window.addEventListener('resize', resize);
    preference.addEventListener('change', assess);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', resize);
      preference.removeEventListener('change', assess);
    };
  }, [onQualityChange]);
  return <div className="stage-atmosphere" aria-hidden="true">
    <div className="stage-emblem-position">
      <Emblem className="stage-watermark stage-emblem-watermark" />
    </div>
    <div className="stage-orbit stage-orbit-outer" />
    <div className="stage-orbit stage-orbit-inner" />
    <div className="stage-wing stage-wing-left" />
    <div className="stage-wing stage-wing-right" />
    <div className="stage-floor-light" />
    <div className="stage-edge stage-edge-left" />
    <div className="stage-edge stage-edge-right" />
  </div>;
}
