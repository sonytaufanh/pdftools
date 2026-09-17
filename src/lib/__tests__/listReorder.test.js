import { describe, expect, test } from 'vitest';
import { moveItem } from '../listReorder';

describe('moveItem', () => {
  const base = ['A', 'B', 'C', 'D'];

  test('moves an item forward using the post-removal index', () => {
    expect(moveItem(base, 0, 1)).toEqual(['B', 'A', 'C', 'D']);
    expect(moveItem(base, 0, 2)).toEqual(['B', 'C', 'A', 'D']);
    expect(moveItem(base, 0, 3)).toEqual(['B', 'C', 'D', 'A']);
  });

  test('moves an item backward', () => {
    expect(moveItem(base, 3, 0)).toEqual(['D', 'A', 'B', 'C']);
    expect(moveItem(base, 2, 1)).toEqual(['A', 'C', 'B', 'D']);
  });

  test('returns the original reference for no-op moves', () => {
    expect(moveItem(base, 1, 1)).toBe(base);
    expect(moveItem(base, -1, 2)).toBe(base);
    expect(moveItem(base, 9, 2)).toBe(base);
  });

  test('clamps the target index', () => {
    expect(moveItem(base, 0, 99)).toEqual(['B', 'C', 'D', 'A']);
    expect(moveItem(base, 3, -5)).toEqual(['D', 'A', 'B', 'C']);
  });

  test('does not mutate the source array', () => {
    const copy = [...base];
    moveItem(base, 0, 3);
    expect(base).toEqual(copy);
  });
});
