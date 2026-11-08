import { describe, expect, it } from 'vitest';
import { votingPercentages } from '../../api/voting';

describe('authoritative ballot percentage rounding', () => {
  it('keeps zero votes empty and handles unanimous votes', () => {
    expect(votingPercentages([0, 0, 0])).toEqual([0, 0, 0]);
    expect(votingPercentages([8, 0, 0])).toEqual([100, 0, 0]);
  });
  it('rounds deterministically to 100 without treating rounding as a winner', () => {
    expect(votingPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(votingPercentages([1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16]);
  });
  it('keeps unusual distributions integral, bounded and within one percentage point', () => {
    for (const counts of [[1, 99], [1, 1, 999], [101, 203, 307], [0, 17, 0, 2, 900, 1, 0, 3]]) {
      const result = votingPercentages(counts);
      const total = counts.reduce((a, b) => a + b, 0);
      expect(result.reduce((a, b) => a + b, 0)).toBe(100);
      result.forEach((value, index) => {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
        expect(Math.abs(value - counts[index] * 100 / total)).toBeLessThan(1);
      });
    }
  });
});
