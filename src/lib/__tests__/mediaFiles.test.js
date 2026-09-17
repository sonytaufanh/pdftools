import { describe, expect, test, vi } from 'vitest';
import {
  isHeicFile,
  isSupportedImageLikeFile,
  isSupportedRasterFile,
  normalizeMediaFile
} from '../mediaFiles';

vi.mock('heic2any', () => ({
  default: vi.fn(async () => new Blob(['converted'], { type: 'image/jpeg' }))
}));

describe('isHeicFile', () => {
  test('detects heic by type or extension', () => {
    expect(isHeicFile({ name: 'photo.heic', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'photo', type: 'image/heic' })).toBe(true);
    expect(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });
});

describe('isSupportedRasterFile', () => {
  test('accepts png and jpeg', () => {
    expect(isSupportedRasterFile({ name: 'a.png', type: 'image/png' })).toBe(true);
    expect(isSupportedRasterFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(true);
    expect(isSupportedRasterFile({ name: 'a.JPEG', type: '' })).toBe(true);
  });

  test('rejects other formats', () => {
    expect(isSupportedRasterFile({ name: 'a.gif', type: 'image/gif' })).toBe(false);
    expect(isSupportedRasterFile({ name: 'a.webp', type: 'image/webp' })).toBe(false);
  });
});

describe('isSupportedImageLikeFile', () => {
  test('combines raster and heic support', () => {
    expect(isSupportedImageLikeFile({ name: 'a.png', type: 'image/png' })).toBe(true);
    expect(isSupportedImageLikeFile({ name: 'a.heic', type: '' })).toBe(true);
    expect(isSupportedImageLikeFile({ name: 'a.pdf', type: 'application/pdf' })).toBe(false);
  });
});

describe('normalizeMediaFile', () => {
  test('returns the same file when no conversion is needed', async () => {
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    expect(await normalizeMediaFile(file)).toBe(file);
  });

  test('converts heic files to jpeg', async () => {
    const file = new File(['data'], 'photo.heic', { type: 'image/heic' });
    const converted = await normalizeMediaFile(file);

    expect(converted.name).toBe('photo.jpg');
    expect(converted.type).toBe('image/jpeg');
  });
});
