import { describe, expect, test } from 'vitest';
import { parsePageSelection } from '../pageRange';

describe('parsePageSelection', () => {
  test('returns every page when the input is empty', () => {
    expect(parsePageSelection('', 3)).toEqual([1, 2, 3]);
    expect(parsePageSelection('   ', 2)).toEqual([1, 2]);
  });

  test('parses single pages, ranges and mixed input', () => {
    expect(parsePageSelection('2', 5)).toEqual([2]);
    expect(parsePageSelection('2-4', 5)).toEqual([2, 3, 4]);
    expect(parsePageSelection('1, 3-4, 6', 6)).toEqual([1, 3, 4, 6]);
  });

  test('normalizes reversed ranges and clamps to the document', () => {
    expect(parsePageSelection('4-2', 5)).toEqual([2, 3, 4]);
    expect(parsePageSelection('3-99', 5)).toEqual([3, 4, 5]);
    expect(parsePageSelection('0-2', 5)).toEqual([1, 2]);
  });

  test('deduplicates and sorts results', () => {
    expect(parsePageSelection('3,1,3,2-3', 5)).toEqual([1, 2, 3]);
  });

  test('ignores invalid tokens', () => {
    expect(parsePageSelection('abc, 9, 2', 5)).toEqual([2]);
  });
});
