import { describe, expect, test } from 'vitest';
import {
  getPdfWatermarkTextAngle,
  getWatermarkAnchor,
  getWatermarkTextAngle,
  rotatePoint
} from '../watermark';

describe('getWatermarkAnchor', () => {
  const width = 1000;
  const height = 500;

  test('uses screen coordinates with y measured from the top', () => {
    // "top" must be a small y (near the top), not near the bottom.
    expect(getWatermarkAnchor(width, height, 'top').y).toBe(height * 0.16);
    // "bottom" must be a large y (near the bottom).
    expect(getWatermarkAnchor(width, height, 'bottom').y).toBe(height - height * 0.16);
    expect(getWatermarkAnchor(width, height, 'center').y).toBe(height / 2);
  });

  test('places left, right and center horizontally', () => {
    expect(getWatermarkAnchor(width, height, 'top-left').x).toBe(width * 0.16);
    expect(getWatermarkAnchor(width, height, 'top-right').x).toBe(width - width * 0.16);
    expect(getWatermarkAnchor(width, height, 'top').x).toBe(width / 2);
  });

  test('supports all four corners', () => {
    const topLeft = getWatermarkAnchor(width, height, 'top-left');
    const bottomRight = getWatermarkAnchor(width, height, 'bottom-right');

    expect(topLeft.x).toBeLessThan(bottomRight.x);
    expect(topLeft.y).toBeLessThan(bottomRight.y);
  });
});

describe('rotatePoint', () => {
  test('rotates a point around the origin', () => {
    const rotated = rotatePoint(1, 0, 90);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });
});

describe('watermark text angle', () => {
  test('is diagonal for portrait pages and flat for landscape', () => {
    expect(getWatermarkTextAngle(400, 800)).toBe(-45);
    expect(getWatermarkTextAngle(800, 400)).toBe(0);
  });

  test('converts to a positive PDF angle', () => {
    expect(getPdfWatermarkTextAngle(400, 800)).toBe(45);
    expect(getPdfWatermarkTextAngle(800, 400)).toBe(0);
  });
});
