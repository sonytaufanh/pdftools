export async function canvasToBlob(canvas, mimeType, quality = 0.92) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
  if (blob) return blob;

  const response = await fetch(canvas.toDataURL(mimeType, quality));
  return response.blob();
}

export async function canvasToArrayBuffer(canvas, mimeType = 'image/jpeg', quality = 0.9) {
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return blob.arrayBuffer();
}

export function clearCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

export function applyCanvasGrayscale(canvas) {
  const context = canvas?.getContext('2d');
  if (!context) return canvas;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round((0.299 * data[index]) + (0.587 * data[index + 1]) + (0.114 * data[index + 2]));
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}
