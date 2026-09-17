import type { PDFPageProxy } from 'pdfjs-dist';
import { clearCanvas } from './canvas';
import { destroyPdfProxy, getPdfJsLib } from './pdfjs';

interface PreviewOptions {
  scale?: number;
  quality?: number;
}

export interface PdfPreviewResult {
  pageCount: number;
  previewUrl: string;
}

export async function renderPdfBytesPreview(
  arrayBuffer: ArrayBuffer,
  { scale = 0.5, quality = 0.82 }: PreviewOptions = {}
): Promise<PdfPreviewResult> {
  const pdfjsLib = getPdfJsLib();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfProxy = await loadingTask.promise;

  let page: PDFPageProxy | null = null;
  let canvas: HTMLCanvasElement | null = null;

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
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return {
      pageCount: pdfProxy.numPages || 1,
      previewUrl: canvas.toDataURL('image/jpeg', quality)
    };
  } finally {
    page?.cleanup();
    clearCanvas(canvas);
    await destroyPdfProxy(pdfProxy);
  }
}

export async function readPdfPreview(
  file: Blob,
  options?: PreviewOptions
): Promise<PdfPreviewResult> {
  const arrayBuffer = await file.arrayBuffer();
  return renderPdfBytesPreview(arrayBuffer, options);
}
