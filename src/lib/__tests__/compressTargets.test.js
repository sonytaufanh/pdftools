import { describe, expect, test } from 'vitest';
import { buildTargetSizeOptions } from '../compressTargets';

describe('buildTargetSizeOptions', () => {
  test('always returns targets below the original size', () => {
    const original = 247 * 1024;
    const options = buildTargetSizeOptions(original);

    expect(options.length).toBeGreaterThan(0);
    options.forEach(option => {
      expect(option.bytes).toBeLessThan(original);
      expect(option.bytes).toBeGreaterThan(0);
    });
  });

  test('uses fractions of the original size', () => {
    const original = 1024 * 1024;
    const options = buildTargetSizeOptions(original);

    expect(options.map(option => option.bytes)).toEqual([
      Math.round(original * 0.75),
      Math.round(original * 0.5),
      Math.round(original * 0.25)
    ]);
  });

  test('handles tiny files without duplicates or overflow', () => {
    const options = buildTargetSizeOptions(1);
    options.forEach(option => {
      expect(option.bytes).toBeLessThan(1);
    });
    const bytes = options.map(option => option.bytes);
    expect(new Set(bytes).size).toBe(bytes.length);
  });

  test('returns no options for invalid sizes', () => {
    expect(buildTargetSizeOptions(0)).toEqual([]);
    expect(buildTargetSizeOptions(-5)).toEqual([]);
    expect(buildTargetSizeOptions(Number.NaN)).toEqual([]);
  });
});
