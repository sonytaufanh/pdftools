import { afterEach, describe, expect, test, vi } from 'vitest';
import { readImageMetrics } from '../imageProcessing';

describe('readImageMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('returns image dimensions and releases the bitmap', async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({ width: 12, height: 34, close }));
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    const metrics = await readImageMetrics(new Blob(['x']));

    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    expect(metrics).toEqual({ width: 12, height: 34 });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
