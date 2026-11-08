import { describe, expect, it } from 'vitest';
import { validateStage } from '../../api/platform';

const stage = { atmosphere: 'midnight', chapters: [{ id: 'a', title: 'Opening' }], activeChapterId: 'a', prompts: [], overlay: null };
describe('stage configuration admission', () => {
  it('rejects dangling chapters, duplicate identifiers and unbounded libraries', () => {
    expect(validateStage({ ...stage, activeChapterId: 'other' })).toBeNull();
    expect(validateStage({ ...stage, chapters: [...stage.chapters, ...stage.chapters] })).toBeNull();
    expect(validateStage({ ...stage, prompts: Array.from({ length: 21 }, (_, i) => ({ id: String(i), text: 'Prompt' })) })).toBeNull();
  });
  it('admits bounded reflection clocks and rejects expired or excessively distant clocks', () => {
    const now = Date.now();
    const reflection = delta => ({ ...stage, overlay: { kind: 'reflection', text: 'Pause', endsAt: new Date(now + delta).toISOString() } });
    expect(validateStage(reflection(60000), now)).toBeTruthy();
    expect(validateStage(reflection(-1), now)).toBeNull();
    expect(validateStage(reflection(86400001), now)).toBeNull();
  });
  it('validates announcement limits, styles and optional branding without trusting restoration input', () => {
    const announcement = { kind: 'announcement', text: 'Welcome', heading: 'Tonight', subtitle: 'Together', style: 'quote', showBrand: true, endsAt: null };
    expect(validateStage({ ...stage, overlay: announcement, returnOverlay: { kind: 'prompt', text: 'Forged' } })).not.toHaveProperty('returnOverlay');
    for (const change of [{text:'x'.repeat(1501)},{heading:'x'.repeat(121)},{subtitle:'x'.repeat(241)},{style:'unknown'},{showBrand:'true'}]) {
      expect(validateStage({...stage,overlay:{...announcement,...change}})).toBeNull();
    }
    expect(validateStage({...stage,announcements:[{id:'a',...announcement},{id:'a',...announcement}]})).toBeNull();
  });
  it('keeps old sessions compatible while admitting all seven atmospheres and scoped voting codes', () => {
    for (const atmosphere of ['midnight','electric','reflection','royal','celestial','velvet','aurora']) expect(validateStage({...stage,atmosphere})).toBeTruthy();
    expect(validateStage({...stage,overlay:{kind:'voting',eventCode:'ABCDEFGH',endsAt:null}})?.overlay.kind).toBe('voting');
    expect(validateStage({...stage,overlay:{kind:'voting',eventCode:'../admin',endsAt:null}})).toBeNull();
  });
});
