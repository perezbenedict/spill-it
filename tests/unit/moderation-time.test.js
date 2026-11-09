import {describe,it,expect} from 'vitest';
import {moderationTimestamp} from '../../lib/moderation-time';
describe('moderation timestamps',()=>{
 it('uses deterministic UTC even for an offset timestamp',()=>{expect(moderationTimestamp('2026-11-09T14:05:00+01:00')).toBe('9 Nov, 13:05 UTC');});
 it('keeps midnight and missing values readable',()=>{expect(moderationTimestamp('2026-01-01T00:00:00Z')).toBe('1 Jan, 00:00 UTC');expect(moderationTimestamp('invalid')).toBe('invalid');expect(moderationTimestamp(undefined)).toBe('');});
});
