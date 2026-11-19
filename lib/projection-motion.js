// Cue identity deliberately excludes polling revisions and countdown ticks.
export function projectionIdentity(overlay, fallback = 'idle') {
  return overlay ? JSON.stringify([overlay.kind, overlay.text, overlay.heading, overlay.subtitle, overlay.style, overlay.eventCode, overlay.activityId, overlay.reference, overlay.version]) : fallback;
}

// A clean handoff on a stationary stage: leave briskly, then settle gently.
// No full-screen blur or masks that cut through a sentence while it is read.
export function projectionEntrance(kind) {
  const settled={opacity:1,x:0,y:0,scale:1};
  if(kind==='qr')return {initial:{...settled,opacity:0},animate:settled,duration:.3};
  if(kind==='reflection')return {initial:{opacity:0,y:8,scale:.995},animate:settled,duration:.82};
  if(kind==='prompt')return {initial:{opacity:0,y:18,scale:.992},animate:settled,duration:.72};
  if(kind==='announcement')return {initial:{opacity:0,y:14,scale:.996},animate:settled,duration:.68};
  if(kind==='activity' || kind==='results')return {initial:{opacity:0,y:12,scale:1},animate:settled,duration:.64};
  return {initial:{opacity:0,y:18,scale:.996},animate:settled,duration:.62};
}
