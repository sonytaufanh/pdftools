import { describe, expect, test, vi } from 'vitest';
import { isRenderCancelled, renderPageWithCancellation } from '../pdfRender';

describe('isRenderCancelled', () => {
  test('detects cancellation errors', () => {
    expect(isRenderCancelled({ name: 'RenderingCancelledException' })).toBe(true);
    expect(isRenderCancelled({ name: 'AbortError' })).toBe(true);
    expect(isRenderCancelled(new Error('boom'))).toBe(false);
    expect(isRenderCancelled(null)).toBe(false);
  });
});

describe('renderPageWithCancellation', () => {
  test('resolves when rendering succeeds without a signal', async () => {
    const page = { render: vi.fn(() => ({ promise: Promise.resolve('ok'), cancel: vi.fn() })) };
    await expect(renderPageWithCancellation(page, {}, {}, null)).resolves.toBe('ok');
  });

  test('cancels the render task when the signal aborts', async () => {
    const cancel = vi.fn();
    let rejectRender;
    const promise = new Promise((_, reject) => {
      rejectRender = reject;
    });
    const page = { render: vi.fn(() => ({ promise, cancel })) };
    const controller = new AbortController();

    const result = renderPageWithCancellation(page, {}, {}, controller.signal);
    controller.abort();
    rejectRender(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' }));

    await expect(result).rejects.toMatchObject({ name: 'RenderingCancelledException' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('cancels immediately when the signal is already aborted', async () => {
    const cancel = vi.fn();
    const page = { render: vi.fn(() => ({ promise: Promise.resolve(), cancel })) };
    const controller = new AbortController();
    controller.abort();

    await renderPageWithCancellation(page, {}, {}, controller.signal);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
