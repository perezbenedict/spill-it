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
});
