import { canvasToArrayBuffer, clearCanvas } from './canvas';

export interface ImageMetrics {
  width: number;
  height: number;
}

export interface ProcessedImage {
  bytes: ArrayBuffer;
  mimeType: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface PreprocessImageOptions {
  maxLongEdge?: number;
  quality?: number;
  grayscale?: boolean;
}

export async function readImageMetrics(file: Blob): Promise<ImageMetrics> {
  const imageBitmap = await createImageBitmap(file);
  const metrics = { width: imageBitmap.width, height: imageBitmap.height };
  imageBitmap.close();
  return metrics;
}

export async function preprocessImageForPdf(
  file: Blob,
  rotation = 0,
  { maxLongEdge = 2400, quality = 0.9, grayscale = false }: PreprocessImageOptions = {}
): Promise<ProcessedImage> {
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');

  try {
    const normalizedRotation = (((rotation || 0) % 360) + 360) % 360;
    const quarterTurn = normalizedRotation % 180 !== 0;
    const sourceWidth = quarterTurn ? imageBitmap.height : imageBitmap.width;
    const sourceHeight = quarterTurn ? imageBitmap.width : imageBitmap.height;
    const longEdge = Math.max(sourceWidth, sourceHeight);
    const downscale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not supported.');
    }

    canvas.width = Math.max(1, Math.round(sourceWidth * downscale));
    canvas.height = Math.max(1, Math.round(sourceHeight * downscale));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (grayscale) {
      context.filter = 'grayscale(1) contrast(1.08)';
    }
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(normalizedRotation * (Math.PI / 180));
    context.scale(downscale, downscale);
    context.drawImage(imageBitmap, -imageBitmap.width / 2, -imageBitmap.height / 2);
    context.restore();

    const bytes = await canvasToArrayBuffer(canvas, 'image/jpeg', quality);
    return {
      bytes,
      mimeType: 'image/jpeg',
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    };
  } finally {
    imageBitmap.close();
    clearCanvas(canvas);
  }
}
