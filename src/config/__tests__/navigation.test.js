import { describe, expect, test } from 'vitest';
import { DEFAULT_ROUTE, NAV_ITEMS, getActiveNavItem } from '../navigation';

describe('navigation config', () => {
  test('every nav item has the expected shape', () => {
    NAV_ITEMS.forEach(item => {
      expect(typeof item.to).toBe('string');
      expect(item.to.startsWith('/')).toBe(true);
      expect(typeof item.label).toBe('string');
      expect(item.icon).toBeTruthy();
    });
  });

  test('the default route exists in the nav items', () => {
    expect(NAV_ITEMS.some(item => item.to === DEFAULT_ROUTE)).toBe(true);
  });
});

describe('getActiveNavItem', () => {
  test('returns the item matching the pathname', () => {
    expect(getActiveNavItem('/merge-files').to).toBe('/merge-files');
    expect(getActiveNavItem('/guide').to).toBe('/guide');
  });

  test('falls back to the first item for unknown paths', () => {
    expect(getActiveNavItem('/does-not-exist').to).toBe(DEFAULT_ROUTE);
  });
});
