import { describe, expect, test } from 'vitest';
import { formatBytes, getFileBaseName, getPdfBaseName } from '../formatters';

describe('formatBytes', () => {
  test('handles empty and invalid values', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(-10)).toBe('0 KB');
    expect(formatBytes(Number.NaN)).toBe('0 KB');
  });

  test('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024)).toBe('10 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('getPdfBaseName', () => {
  test('strips the pdf extension', () => {
    expect(getPdfBaseName('report.pdf')).toBe('report');
    expect(getPdfBaseName('report.PDF')).toBe('report');
  });

  test('falls back when empty', () => {
    expect(getPdfBaseName('')).toBe('document');
    expect(getPdfBaseName(null)).toBe('document');
    expect(getPdfBaseName('', 'fallback')).toBe('fallback');
  });
});

describe('getFileBaseName', () => {
  test('strips any extension', () => {
    expect(getFileBaseName('photo.jpeg')).toBe('photo');
    expect(getFileBaseName('archive.tar.gz')).toBe('archive.tar');
    expect(getFileBaseName('no-extension')).toBe('no-extension');
  });

  test('falls back when empty', () => {
    expect(getFileBaseName('')).toBe('document');
  });
});
