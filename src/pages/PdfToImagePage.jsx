import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, FileImage, Image as ImageIcon, Upload, X } from 'lucide-react';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { canvasToBlob, clearCanvas } from '../lib/canvas';
import { formatBytes, getPdfBaseName } from '../lib/formatters';
import { destroyPdfProxy, getPdfJsLib } from '../lib/pdfjs';
import { readPdfPreview } from '../lib/pdfPreview';
import { requestSaveTarget } from '../lib/saveFile';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';
import { parsePageSelection } from '../lib/pageRange';

function getSafePageCount(value) {
  return Math.max(1, Number(value) || 1);
}

const SCALE_OPTIONS = [
  { value: 1, label: 'Layar - 72 DPI' },
  { value: 1.5, label: 'Sedang - 108 DPI' },
  { value: 2, label: 'Tinggi - 144 DPI' },
  { value: 3, label: 'Cetak - 216 DPI' }
];

export default function PdfToImagePage() {
  const fileInputRef = useRef(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [format, setFormat] = useState('jpg');
  const [scale, setScale] = useState(2);
  const [pageRange, setPageRange] = useState('');
  const [status, setStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isFileDropActive, setIsFileDropActive] = useState(false);

  async function handleFileUpload(event) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus({
        tone: 'error',
        title: 'Hanya file PDF yang didukung',
        detail: 'Pilih dokumen PDF terlebih dahulu.'
      });
      return;
    }

    setIsProcessing(true);
    setStatus({ tone: 'loading', title: 'Membaca PDF', detail: `Menyiapkan ${file.name}.` });
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
      setPageRange('');
      setStatus({
        tone: 'success',
        title: 'PDF siap',
        detail: `${pageCount} halaman siap diekspor.`
      });
    } catch (error) {
      console.error(error);
      setPdfFile(null);
      setStatus({
        tone: 'error',
        title: 'Gagal membaca PDF',
        detail: error.message || 'PDF tidak bisa dibuka.'
      });
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  function clearFile() {
    setPdfFile(null);
    setPageRange('');
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
    const requestedPages = parsePageSelection(pageRange, expectedPageCount);

    if (!requestedPages.length) {
      setStatus({
        tone: 'error',
        title: 'Tidak ada halaman valid',
        detail: 'Gunakan range seperti 1-3,5 atau biarkan kosong untuk mengekspor semua halaman.'
      });
      return;
    }

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const extension = format === 'png' ? 'png' : 'jpg';
    const singleSelection = requestedPages.length === 1;
    const saveTarget = await requestSaveTarget({
      suggestedName: singleSelection
        ? `${baseName}_page_${requestedPages[0]}.${extension}`
        : `${baseName}_${format}_images.zip`,
      mimeType: singleSelection ? mimeType : 'application/zip',
      extensions: [singleSelection ? `.${extension}` : '.zip'],
      description: singleSelection ? `Gambar ${format.toUpperCase()}` : 'Arsip ZIP'
    });
    if (!saveTarget) {
      setStatus({
        tone: 'info',
        title: 'Ekspor dibatalkan',
        detail: `${requestedPages.length} halaman siap diekspor.`
      });
      return;
    }

    setIsProcessing(true);
    setStatus({
      tone: 'loading',
      title: 'Mengekspor gambar',
      detail: `Merender ${requestedPages.length} halaman sebagai ${format.toUpperCase()}.`
    });
    setProgress({ current: 0, total: requestedPages.length });

    let pdfProxy = null;
    try {
      const pdfjsLib = getPdfJsLib();
      const arrayBuffer = await pdfFile.file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      pdfProxy = await loadingTask.promise;
      const totalPages = getSafePageCount(pdfProxy.numPages || expectedPageCount);
      const pagesToRender = requestedPages.filter(pageNumber => pageNumber <= totalPages);

      if (!pagesToRender.length) {
        throw new Error('Halaman yang dipilih di luar rentang dokumen.');
      }

      const isMultiple = pagesToRender.length > 1;
      const zip = isMultiple ? new JSZip() : null;
      const padding = String(Math.max(...pagesToRender)).length;
      let singleImageBlob = null;

      for (let index = 0; index < pagesToRender.length; index += 1) {
        const pageNumber = pagesToRender[index];
        let page = null;
        let canvas = null;

        try {
          page = await pdfProxy.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas tidak didukung.');

          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          const imageBlob = await canvasToBlob(canvas, mimeType, 0.92);

          if (isMultiple) {
            zip.file(
              `${baseName}_page_${String(pageNumber).padStart(padding, '0')}.${extension}`,
              imageBlob
            );
          } else {
            singleImageBlob = imageBlob;
          }
        } finally {
          page?.cleanup();
          clearCanvas(canvas);
        }

        setProgress({ current: index + 1, total: pagesToRender.length });
      }

      if (isMultiple) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await saveTarget.save(zipBlob);
        setStatus({
          tone: 'success',
          title: 'Gambar diekspor',
          detail: `${saveTarget.name} tersimpan dengan ${pagesToRender.length} file gambar.`
        });
      } else {
        await saveTarget.save(singleImageBlob);
        setStatus({
          tone: 'success',
          title: 'Gambar diekspor',
          detail: `${saveTarget.name} tersimpan.`
        });
      }
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Ekspor gagal',
        detail: error.message || 'Gagal mengonversi PDF ke gambar.'
      });
    } finally {
      await destroyPdfProxy(pdfProxy);
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  const selectedPageCount = pdfFile
    ? parsePageSelection(pageRange, getSafePageCount(pdfFile.pageCount)).length
    : 0;

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
            <h2 className="brand-title converter-title">PDF ke Gambar</h2>
            <p className="brand-subtitle">Ekspor setiap halaman PDF jadi gambar JPG atau PNG.</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Pilih PDF
            </button>
            <button
              className="primary-button"
              onClick={convertPdfToImages}
              disabled={!pdfFile || isProcessing}
            >
              <Download size={16} />
              {selectedPageCount === 1 ? `Ekspor ${format.toUpperCase()}` : 'Ekspor ZIP'}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="application/pdf,.pdf"
          onChange={handleFileUpload}
        />
        <StatusBanner status={status} />

        {!pdfFile ? (
          <button
            type="button"
            className="dropzone converter-upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileImage size={56} />
            <span className="field-value">Pilih PDF untuk diekspor</span>
            <span className="muted">
              Tentukan range halaman dan resolusi, lalu ekspor sebagai JPG atau PNG. Banyak halaman
              akan dibungkus jadi ZIP.
            </span>
          </button>
        ) : (
          <div className="converter-grid">
            <article className="converter-file-card">
              <div className="converter-preview">
                <img src={pdfFile.previewUrl} alt={`${pdfFile.name} preview`} />
              </div>
              <div className="converter-file-info">
                <div>
                  <span className="field-label">PDF Terpilih</span>
                  <div className="converter-file-name">{pdfFile.name}</div>
                </div>
                <div className="compress-meta-grid">
                  <div>
                    <span className="field-label">Halaman</span>
                    <span className="field-value">{pdfFile.pageCount}</span>
                  </div>
                  <div>
                    <span className="field-label">Ukuran</span>
                    <span className="field-value">{formatBytes(pdfFile.size)}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="toast-close compress-clear-button"
                onClick={clearFile}
                aria-label="Hapus PDF terpilih"
                title="Hapus PDF terpilih"
              >
                <X size={16} />
              </button>
            </article>

            <section className="converter-settings">
              <span className="field-label">Format Gambar</span>
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

              <div className="converter-field">
                <label className="field-label" htmlFor="pdf-to-image-range">
                  Halaman
                </label>
                <input
                  id="pdf-to-image-range"
                  className="converter-input"
                  type="text"
                  inputMode="numeric"
                  placeholder={`Semua halaman (1-${pdfFile.pageCount})`}
                  value={pageRange}
                  onChange={event => setPageRange(event.target.value)}
                />
                <span className="converter-field-hint">
                  {pageRange.trim()
                    ? `${selectedPageCount} dari ${pdfFile.pageCount} halaman dipilih`
                    : 'Biarkan kosong untuk semua halaman. Contoh: 1-3,5'}
                </span>
              </div>

              <div className="converter-field">
                <label className="field-label" htmlFor="pdf-to-image-scale">
                  Resolusi
                </label>
                <select
                  id="pdf-to-image-scale"
                  className="converter-select"
                  value={scale}
                  onChange={event => setScale(Number(event.target.value))}
                >
                  {SCALE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="converter-note">
                <ImageIcon size={18} />
                {format === 'jpg'
                  ? 'JPG menghasilkan file lebih kecil untuk dibagikan.'
                  : 'PNG lebih tajam untuk teks dan garis.'}
              </div>
            </section>
          </div>
        )}
      </section>

      {isProcessing && <ProcessingOverlay progress={progress} />}
    </div>
  );
}
