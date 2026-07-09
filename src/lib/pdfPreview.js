import { clearCanvas } from './canvas';
import { getPdfJsLib } from './pdfjs';

export async function renderPdfBytesPreview(arrayBuffer, { scale = 0.5, quality = 0.82 } = {}) {
  const pdfjsLib = getPdfJsLib();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfProxy = await loadingTask.promise;

  let page = null;
  let canvas = null;

  try {
    page = await pdfProxy.getPage(1);
    const viewport = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not supported in this browser.');
    }

    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    return {
      pageCount: pdfProxy.numPages || 1,
      previewUrl: canvas.toDataURL('image/jpeg', quality)
    };
  } finally {
    page?.cleanup();
    clearCanvas(canvas);
    await pdfProxy.destroy();
  }
}

export async function readPdfPreview(file, options) {
  const arrayBuffer = await file.arrayBuffer();
  return renderPdfBytesPreview(arrayBuffer, options);
}
