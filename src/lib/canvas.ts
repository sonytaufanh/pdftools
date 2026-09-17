export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality = 0.92
): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality));
  if (blob) return blob;

  const response = await fetch(canvas.toDataURL(mimeType, quality));
  return response.blob();
}

export async function canvasToArrayBuffer(
  canvas: HTMLCanvasElement,
  mimeType = 'image/jpeg',
  quality = 0.9
): Promise<ArrayBuffer> {
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return blob.arrayBuffer();
}

export function rotateCanvas(
  canvas: HTMLCanvasElement,
  rotationDegrees: number
): HTMLCanvasElement {
  const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
  if (normalizedRotation === 0) {
    return canvas;
  }

  const quarterTurn = normalizedRotation % 180 !== 0;
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = quarterTurn ? canvas.height : canvas.width;
  rotatedCanvas.height = quarterTurn ? canvas.width : canvas.height;

  const context = rotatedCanvas.getContext('2d');
  if (!context) {
    return canvas;
  }

  context.save();
  context.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  context.rotate(normalizedRotation * (Math.PI / 180));
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  context.restore();
  return rotatedCanvas;
}

export function clearCanvas(canvas?: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

export function applyCanvasGrayscale(
  canvas?: HTMLCanvasElement | null
): HTMLCanvasElement | null | undefined {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return canvas;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
    );
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}
