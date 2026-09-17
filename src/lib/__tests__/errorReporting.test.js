import { afterEach, describe, expect, test, vi } from 'vitest';
import { BUILD_INFO, installGlobalErrorHandlers, reportError } from '../errorReporting';

describe('reportError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns a normalized payload with build info', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = reportError(new Error('boom'), { source: 'test' });

    expect(payload.message).toBe('boom');
    expect(payload.context).toEqual({ source: 'test' });
    expect(payload.version).toBe(BUILD_INFO.version);
    expect(typeof payload.timestamp).toBe('string');
  });

  test('handles non-error values safely', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(reportError('oops').message).toContain('oops');
    expect(reportError(undefined).message).toBe('Unknown error');
  });

  test('global handlers report window errors and rejections', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installGlobalErrorHandlers();

    const errorEvent = new Event('error');
    Object.defineProperty(errorEvent, 'error', { value: new Error('window boom') });
    window.dispatchEvent(errorEvent);
    expect(errorSpy).toHaveBeenCalled();

    const rejectionEvent = new Event('unhandledrejection');
    Object.defineProperty(rejectionEvent, 'reason', { value: new Error('rejected') });
    window.dispatchEvent(rejectionEvent);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
