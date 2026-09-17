import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildPdfFileName,
  ensureExtension,
  requestPdfSaveTarget,
  requestSaveTarget
} from '../saveFile';

describe('ensureExtension', () => {
  test('appends the extension when missing', () => {
    expect(ensureExtension('report', '.pdf')).toBe('report.pdf');
    expect(ensureExtension('report', 'pdf')).toBe('report.pdf');
  });

  test('keeps an existing extension regardless of case', () => {
    expect(ensureExtension('report.pdf', '.pdf')).toBe('report.pdf');
    expect(ensureExtension('report.PDF', '.pdf')).toBe('report.PDF');
  });

  test('falls back to a default name', () => {
    expect(ensureExtension('', '.pdf')).toBe('document.pdf');
    expect(ensureExtension('   ', '.pdf')).toBe('document.pdf');
    expect(ensureExtension(null, '.png')).toBe('document.png');
  });
});

describe('buildPdfFileName', () => {
  test('builds a pdf file name', () => {
    expect(buildPdfFileName('report')).toBe('report.pdf');
    expect(buildPdfFileName('report.pdf')).toBe('report.pdf');
  });

  test('uses the fallback when empty', () => {
    expect(buildPdfFileName('')).toBe('document.pdf');
    expect(buildPdfFileName('', 'custom')).toBe('custom.pdf');
  });
});

const baseOptions = {
  suggestedName: 'doc',
  mimeType: 'application/pdf',
  extensions: ['.pdf'],
  description: 'PDF document'
};

describe('requestSaveTarget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.showSaveFilePicker;
  });

  test('uses the file picker when available', async () => {
    const write = vi.fn();
    const close = vi.fn();
    const showSaveFilePicker = vi.fn(async () => ({
      name: 'picked.pdf',
      createWritable: async () => ({ write, close })
    }));
    window.showSaveFilePicker = showSaveFilePicker;

    const target = await requestSaveTarget(baseOptions);
    expect(target.name).toBe('picked.pdf');
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'doc.pdf' })
    );

    const blob = new Blob(['hello']);
    await target.save(blob);
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
  });

  test('returns null when the picker is aborted', async () => {
    window.showSaveFilePicker = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const promptSpy = vi.spyOn(window, 'prompt');

    expect(await requestSaveTarget(baseOptions)).toBeNull();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  test('falls back to a prompt when the picker is unavailable', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('my-file');
    const target = await requestSaveTarget(baseOptions);
    expect(target.name).toBe('my-file.pdf');
  });

  test('returns null when the prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    expect(await requestSaveTarget(baseOptions)).toBeNull();
  });
});

describe('requestPdfSaveTarget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.showSaveFilePicker;
  });

  test('suggests a pdf file name', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('out');
    const target = await requestPdfSaveTarget('report');
    expect(target.name).toBe('out.pdf');
  });
});
