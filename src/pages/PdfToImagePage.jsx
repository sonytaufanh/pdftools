import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { Archive, Download, FileImage, Image as ImageIcon, Upload, X } from 'lucide-react';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { canvasToBlob, clearCanvas } from '../lib/canvas';
import { formatBytes, getPdfBaseName } from '../lib/formatters';
import { getPdfJsLib } from '../lib/pdfjs';
import { readPdfPreview } from '../lib/pdfPreview';
import { requestSaveTarget } from '../lib/saveFile';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

function getSafePageCount(value) {
  return Math.max(1, Number(value) || 1);
}

function isSinglePagePdf(value) {
  return getSafePageCount(value) === 1;
}

export default function PdfToImagePage() {
  const fileInputRef = useRef(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [format, setFormat] = useState('jpg');
  const [status, setStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isFileDropActive, setIsFileDropActive] = useState(false);

  async function handleFileUpload(event) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus({ tone: 'error', title: 'Only PDF files are supported', detail: 'Choose a PDF document first.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ tone: 'loading', title: 'Reading PDF', detail: `Preparing ${file.name}.` });
    setProgress({ current: 0, total: 1 });

    try {
      const preview = await readPdfPreview(file);
      const pageCount = getSafePageCount(preview.pageCount);
      setPdfFile({
        file,
        name: file.name,
        size: file.size,
        pageCount,
        previewUrl: preview.previewUrl
      });
      setStatus({ tone: 'success', title: 'PDF ready', detail: `${pageCount} page${pageCount === 1 ? '' : 's'} ready to export.` });
    } catch (error) {
      console.error(error);
      setPdfFile(null);
      setStatus({ tone: 'error', title: 'Unable to read PDF', detail: error.message || 'The PDF could not be opened.' });
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  function clearFile() {
    setPdfFile(null);
    setStatus(null);
  }

  function handleFileDragOver(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsFileDropActive(true);
  }

  function handleFileDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsFileDropActive(false);
    }
  }

  function handleFileDrop(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsFileDropActive(false);
    handleFileUpload({ target: { files: getDroppedFiles(event), value: '' } });
  }

  async function convertPdfToImages() {
    if (!pdfFile || isProcessing) return;

    const baseName = getPdfBaseName(pdfFile.name);
    const expectedPageCount = getSafePageCount(pdfFile.pageCount);
    const expectedSinglePage = isSinglePagePdf(expectedPageCount);
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const extension = format === 'png' ? 'png' : 'jpg';
    const saveTarget = await requestSaveTarget({
      suggestedName: expectedSinglePage
        ? `${baseName}.${extension}`
        : `${baseName}_${format}_images.zip`,
      mimeType: expectedSinglePage ? mimeType : 'application/zip',
      extensions: [expectedSinglePage ? `.${extension}` : '.zip'],
      description: expectedSinglePage ? `${format.toUpperCase()} image` : 'ZIP archive'
    });
    if (!saveTarget) {
      setStatus({ tone: 'info', title: 'Export canceled', detail: `${expectedPageCount} page${expectedSinglePage ? '' : 's'} ready to export.` });
      return;
    }

    setIsProcessing(true);
    setStatus({ tone: 'loading', title: 'Exporting images', detail: `Rendering pages as ${format.toUpperCase()}.` });
    setProgress({ current: 0, total: expectedPageCount });

    let pdfProxy = null;
    try {
      const pdfjsLib = getPdfJsLib();
      const arrayBuffer = await pdfFile.file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      pdfProxy = await loadingTask.promise;
      const totalPages = getSafePageCount(pdfProxy.numPages || expectedPageCount);
      const zip = totalPages === 1 ? null : new JSZip();
      const padding = String(totalPages).length;
      let singleImageBlob = null;

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        let page = null;
        let canvas = null;

        try {
          page = await pdfProxy.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2 });
          canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is not supported.');

          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          const imageBlob = await canvasToBlob(canvas, mimeType, 0.92);
          if (totalPages === 1) {
            singleImageBlob = imageBlob;
          } else {
            zip.file(`${baseName}_page_${String(pageNumber).padStart(padding, '0')}.${extension}`, imageBlob);
          }
        } finally {
          page?.cleanup();
          clearCanvas(canvas);
        }

        setProgress({ current: pageNumber, total: totalPages });
      }

      if (totalPages === 1) {
        await saveTarget.save(singleImageBlob);
        setStatus({ tone: 'success', title: 'Image exported', detail: `${saveTarget.name} saved.` });
      } else {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await saveTarget.save(zipBlob);
        setStatus({ tone: 'success', title: 'Images exported', detail: `${saveTarget.name} saved with ${totalPages} image files.` });
      }
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'error', title: 'Export failed', detail: error.message || 'Unable to convert the PDF to images.' });
    } finally {
      if (pdfProxy) await pdfProxy.destroy();
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  return (
    <div
      className={isFileDropActive ? 'converter-view file-drop-active' : 'converter-view'}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <section className="panel converter-panel">
        <div className="toolbar converter-toolbar">
          <div>
            <h2 className="brand-title converter-title">PDF to Image</h2>
            <p className="brand-subtitle">Export every PDF page into JPG or PNG images.</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Choose PDF
            </button>
            <button className="primary-button" onClick={convertPdfToImages} disabled={!pdfFile || isProcessing}>
              <Download size={16} />
              {isSinglePagePdf(pdfFile?.pageCount) ? `Export ${format.toUpperCase()}` : 'Export ZIP'}
            </button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" hidden accept="application/pdf,.pdf" onChange={handleFileUpload} />
        <StatusBanner status={status} />

        {!pdfFile ? (
          <button type="button" className="dropzone converter-upload-zone" onClick={() => fileInputRef.current?.click()}>
            <FileImage size={56} />
            <span className="field-value">Choose a PDF to export</span>
            <span className="muted">One-page PDFs export directly as JPG or PNG; multi-page PDFs export as ZIP.</span>
          </button>
        ) : (
          <div className="converter-grid">
            <article className="converter-file-card">
              <div className="converter-preview">
                <img src={pdfFile.previewUrl} alt={`${pdfFile.name} preview`} />
              </div>
              <div className="converter-file-info">
                <div>
                  <span className="field-label">Selected PDF</span>
                  <div className="converter-file-name">{pdfFile.name}</div>
                </div>
                <div className="compress-meta-grid">
                  <div>
                    <span className="field-label">Pages</span>
                    <span className="field-value">{pdfFile.pageCount}</span>
                  </div>
                  <div>
                    <span className="field-label">Size</span>
                    <span className="field-value">{formatBytes(pdfFile.size)}</span>
                  </div>
                </div>
              </div>
              <button type="button" className="toast-close compress-clear-button" onClick={clearFile} aria-label="Remove selected PDF" title="Remove selected PDF">
                <X size={16} />
              </button>
            </article>

            <section className="converter-settings">
              <span className="field-label">Format Image</span>
              <div className="toggle-button converter-format-toggle">
                {[
                  { value: 'jpg', label: 'JPG' },
                  { value: 'png', label: 'PNG' }
                ].map(option => (
                  <button
                    key={option.value}
                    className={format === option.value ? 'active' : ''}
                    onClick={() => setFormat(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="converter-note">
                <ImageIcon size={18} />
                {format === 'jpg' ? 'JPG creates smaller files for sharing.' : 'PNG keeps sharper edges and text-heavy pages.'}
              </div>
            </section>
          </div>
        )}
      </section>

      {isProcessing && <ProcessingOverlay progress={progress} />}
    </div>
  );
}
