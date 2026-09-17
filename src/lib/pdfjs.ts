import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export function getPdfJsLib(): typeof pdfjsLib {
  return pdfjsLib;
}

export interface DestroyablePdfProxy {
  destroy?: () => Promise<unknown> | unknown;
  cleanup?: () => Promise<unknown> | unknown;
  loadingTask?: { destroy?: () => Promise<unknown> | unknown };
}

export async function destroyPdfProxy(
  pdfProxy: DestroyablePdfProxy | null | undefined
): Promise<void> {
  if (!pdfProxy) return;

  try {
    // pdf.js v6 removed PDFDocumentProxy.destroy(); the loading task owns teardown.
    if (typeof pdfProxy.loadingTask?.destroy === 'function') {
      await pdfProxy.loadingTask.destroy();
      return;
    }
    if (typeof pdfProxy.destroy === 'function') {
      await pdfProxy.destroy();
      return;
    }
    if (typeof pdfProxy.cleanup === 'function') {
      await pdfProxy.cleanup();
    }
  } catch (error) {
    console.warn('[PDFTools] Unable to release the PDF document.', error);
  }
}
