import { describe, expect, test } from 'vitest';
import { getDroppedFiles, hasDraggedFiles } from '../dropFiles';

describe('hasDraggedFiles', () => {
  test('detects a file drag', () => {
    expect(hasDraggedFiles({ dataTransfer: { types: ['Files'] } })).toBe(true);
    expect(hasDraggedFiles({ dataTransfer: { types: ['text/plain'] } })).toBe(false);
  });

  test('is safe when dataTransfer is missing', () => {
    expect(hasDraggedFiles({})).toBe(false);
  });
});

describe('getDroppedFiles', () => {
  test('returns dropped files as an array', () => {
    const file = { name: 'a.pdf' };
    expect(getDroppedFiles({ dataTransfer: { files: [file] } })).toEqual([file]);
    expect(getDroppedFiles({})).toEqual([]);
  });
});
