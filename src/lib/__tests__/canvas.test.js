import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyCanvasGrayscale, clearCanvas, rotateCanvas } from '../canvas';

function createMockContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 50, 255])
    })),
    putImageData: vi.fn()
  };
}

let context;

beforeEach(() => {
  context = createMockContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rotateCanvas', () => {
  test('returns the same canvas when no rotation is needed', () => {
    const canvas = document.createElement('canvas');
    expect(rotateCanvas(canvas, 0)).toBe(canvas);
  });

  test('swaps dimensions for a quarter turn', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;

    const rotated = rotateCanvas(canvas, 90);
    expect(rotated).not.toBe(canvas);
    expect(rotated.width).toBe(50);
    expect(rotated.height).toBe(100);
  });

  test('keeps dimensions for a half turn', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;

    const rotated = rotateCanvas(canvas, 180);
    expect(rotated.width).toBe(100);
    expect(rotated.height).toBe(50);
  });

  test('returns the original canvas when the context is unavailable', () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValueOnce(null);
    const canvas = document.createElement('canvas');
    expect(rotateCanvas(canvas, 90)).toBe(canvas);
  });
});

describe('clearCanvas', () => {
  test('resets dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;
    clearCanvas(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  test('is safe for null input', () => {
    expect(() => clearCanvas(null)).not.toThrow();
  });
});

describe('applyCanvasGrayscale', () => {
  test('writes grayscale pixels back to the canvas', () => {
    const canvas = document.createElement('canvas');
    applyCanvasGrayscale(canvas);

    expect(context.getImageData).toHaveBeenCalled();
    expect(context.putImageData).toHaveBeenCalledTimes(1);
    const imageData = context.putImageData.mock.calls[0][0];
    expect(imageData.data[0]).toBe(imageData.data[1]);
    expect(imageData.data[1]).toBe(imageData.data[2]);
  });

  test('returns the canvas unchanged without a context', () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValueOnce(null);
    const canvas = document.createElement('canvas');
    expect(applyCanvasGrayscale(canvas)).toBe(canvas);
  });
});
