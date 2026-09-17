import { describe, expect, test, vi } from 'vitest';
import { destroyPdfProxy, getPdfJsLib } from '../pdfjs';

describe('getPdfJsLib', () => {
  test('returns the pdf.js library with a configured worker', () => {
    const pdfjsLib = getPdfJsLib();
    expect(pdfjsLib).toBeTruthy();
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBeTruthy();
  });
});

describe('destroyPdfProxy', () => {
  test('destroys through the loading task when available', async () => {
    const destroy = vi.fn(async () => {});
    await destroyPdfProxy({ loadingTask: { destroy } });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('falls back to destroy() and then cleanup()', async () => {
    const destroy = vi.fn(async () => {});
    await destroyPdfProxy({ destroy });
    expect(destroy).toHaveBeenCalledTimes(1);

    const cleanup = vi.fn(async () => {});
    await destroyPdfProxy({ cleanup });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('is safe for null and for throwing proxies', async () => {
    await expect(destroyPdfProxy(null)).resolves.toBeUndefined();

    const destroy = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(destroyPdfProxy({ destroy })).resolves.toBeUndefined();
  });
});
