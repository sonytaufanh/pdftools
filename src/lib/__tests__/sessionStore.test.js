import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { clearSession, loadSession, saveSession } from '../sessionStore';

describe('sessionStore', () => {
  test('saves and loads a structured value', async () => {
    await saveSession('roundtrip', { hello: 'world', count: 3 });
    expect(await loadSession('roundtrip')).toEqual({ hello: 'world', count: 3 });
  });

  test('returns null for missing keys', async () => {
    expect(await loadSession('does-not-exist')).toBeNull();
  });

  test('clears a stored value', async () => {
    await saveSession('to-clear', { a: 1 });
    await clearSession('to-clear');
    expect(await loadSession('to-clear')).toBeNull();
  });

  test('stores binary data', async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    await saveSession('binary', { buffer });
    const loaded = await loadSession('binary');
    expect(new Uint8Array(loaded.buffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
