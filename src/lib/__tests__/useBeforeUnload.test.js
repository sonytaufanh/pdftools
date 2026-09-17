import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useBeforeUnload } from '../useBeforeUnload';

describe('useBeforeUnload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('registers and removes the beforeunload listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useBeforeUnload(true));
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  test('does not register when inactive', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBeforeUnload(false));
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
