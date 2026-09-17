import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyCardDragImage } from '../dragImage';

describe('applyCardDragImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('.drag-preview-clone').forEach(node => node.remove());
  });

  test('sets a custom drag image when supported', () => {
    const source = document.createElement('div');
    source.getBoundingClientRect = () => ({
      width: 200,
      height: 160,
      top: 0,
      left: 0,
      right: 200,
      bottom: 160
    });
    const setDragImage = vi.fn();

    applyCardDragImage({ dataTransfer: { setDragImage }, currentTarget: source });

    expect(setDragImage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.drag-preview-clone')).not.toBeNull();
  });

  test('does nothing when setDragImage is unavailable', () => {
    expect(() =>
      applyCardDragImage({ dataTransfer: {}, currentTarget: document.createElement('div') })
    ).not.toThrow();
  });
});
