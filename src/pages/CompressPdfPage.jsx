import { useMemo, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Archive, Download, FileText, SlidersHorizontal, Upload, X } from 'lucide-react';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { canvasToArrayBuffer, clearCanvas } from '../lib/canvas';
import { formatBytes, getPdfBaseName } from '../lib/formatters';
import { destroyPdfProxy, getPdfJsLib } from '../lib/pdfjs';
import { readPdfPreview } from '../lib/pdfPreview';
import { requestPdfSaveTarget } from '../lib/saveFile';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

const COMPRESSION_PRESETS = [
  {
    id: 'best',
    label: 'Kualitas Terbaik',
    description: 'Halaman lebih jelas dengan kualitas output tertinggi.',
    scale: 1.75,
    quality: 0.84
  },
  {
    id: 'balanced',
    label: 'Seimbang',
    description: 'Kualitas bagus dengan ukuran file lebih kecil.',
    scale: 1.35,
    quality: 0.72
  },
  {
    id: 'small',
    label: 'Kecil',
    description: 'Ukuran paling kecil untuk dikirim via email.',
    scale: 1,
    quality: 0.56
  }
];

const FALLBACK_ESTIMATE_RATIOS = {
  best: 0.82,
  balanced: 0.68,
  small: 0.48
};

const TARGET_SIZE_OPTIONS = [
  { value: 0.5, label: '500 KB' },
  { value: 1, label: '1 MB' },
  { value: 2, label: '2 MB' },
  { value: 5, label: '5 MB' }
];

const MIN_SAVINGS_BYTES = 1024;

function getEstimatePageNumbers(pageCount) {
  return Array.from(new Set([1, Math.ceil(pageCount / 2), pageCount])).filter(
    pageNumber => pageNumber >= 1 && pageNumber <= pageCount
  );
}

function getFallbackCompressionEstimates(fileSize) {
  return Object.fromEntries(
    COMPRESSION_PRESETS.map(preset => [
      preset.id,
      Math.max(1, Math.round(fileSize * (FALLBACK_ESTIMATE_RATIOS[preset.id] ?? 1)))
    ])
  );
}

function estimatePdfBytes(sampleBytes, sampleCount, pageCount) {
  if (!sampleCount || !pageCount) return 0;
  const averagePageBytes = sampleBytes / sampleCount;
  const pdfOverheadBytes = 4096 + pageCount * 1400;
  return Math.max(1, Math.round(averagePageBytes * pageCount + pdfOverheadBytes));
}

function isMeaningfullySmaller(outputSize, originalSize) {
  return originalSize - outputSize >= MIN_SAVINGS_BYTES;
}

function getAvailablePresetIds(sizeValues, originalSize) {
  if (!originalSize) return [];
  return COMPRESSION_PRESETS.filter(preset =>
    isMeaningfullySmaller(sizeValues[preset.id], originalSize)
  ).map(preset => preset.id);
}

function chooseAvailablePresetId(sizeValues, originalSize, preferredId) {
  const availablePresetIds = getAvailablePresetIds(sizeValues, originalSize);
  return availablePresetIds.includes(preferredId)
    ? preferredId
    : (availablePresetIds[0] ?? preferredId ?? COMPRESSION_PRESETS[0].id);
}

function findPresetIdForTarget(sizeValues, targetBytes) {
  const sizes = COMPRESSION_PRESETS.map(preset => ({
    id: preset.id,
    size: sizeValues[preset.id]
  })).filter(entry => Number.isFinite(entry.size) && entry.size > 0);

  const withinTarget = sizes.filter(entry => entry.size <= targetBytes);
  if (withinTarget.length) {
    // Pick the largest output that still fits: best quality under the target.
    return withinTarget.reduce((best, entry) => (entry.size > best.size ? entry : best)).id;
  }

  if (!sizes.length) return null;
  return sizes.reduce((best, entry) => (entry.size < best.size ? entry : best)).id;
}

async function estimateCompressionSizes(file, pageCount, onProgress) {
  const pdfjsLib = getPdfJsLib();
  const arrayBuffer = await file.arrayBuffer();
  const fallbackEstimates = getFallbackCompressionEstimates(file.size || arrayBuffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfProxy = await loadingTask.promise;
  const samplePageNumbers = getEstimatePageNumbers(pageCount);
  const sampleTotals = Object.fromEntries(COMPRESSION_PRESETS.map(preset => [preset.id, 0]));
  const sampleCounts = Object.fromEntries(COMPRESSION_PRESETS.map(preset => [preset.id, 0]));
  const totalSteps = samplePageNumbers.length * COMPRESSION_PRESETS.length;
  let currentStep = 0;

  try {
    for (const pageNumber of samplePageNumbers) {
      let page = null;

      try {
        page = await pdfProxy.getPage(pageNumber);

        for (const preset of COMPRESSION_PRESETS) {
          let canvas = null;
          try {
            const viewport = page.getViewport({ scale: preset.scale });
            canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            if (!context) {
              throw new Error('Canvas tidak didukung di browser ini.');
            }

            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;

            const imageBytes = await canvasToArrayBuffer(canvas, 'image/jpeg', preset.quality);
            sampleTotals[preset.id] += imageBytes.byteLength;
            sampleCounts[preset.id] += 1;
          } catch (error) {
            console.warn(`Estimate sampling failed for ${preset.id} on page ${pageNumber}.`, error);
          } finally {
            clearCanvas(canvas);
          }
          currentStep += 1;
          onProgress?.({ current: currentStep, total: totalSteps });
        }
      } catch (error) {
        console.warn(`Estimate sampling skipped for page ${pageNumber}.`, error);
        currentStep += COMPRESSION_PRESETS.length;
        onProgress?.({ current: currentStep, total: totalSteps });
      } finally {
        page?.cleanup();
      }
    }

    return Object.fromEntries(
      COMPRESSION_PRESETS.map(preset => [
        preset.id,
        sampleCounts[preset.id] > 0
          ? estimatePdfBytes(sampleTotals[preset.id], sampleCounts[preset.id], pageCount)
          : fallbackEstimates[preset.id]
      ])
    );
  } finally {
    await destroyPdfProxy(pdfProxy);
  }
}

export default function CompressPdfPage() {
  const fileInputRef = useRef(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState(COMPRESSION_PRESETS[0].id);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [presetEstimates, setPresetEstimates] = useState({ status: 'idle', values: {} });
  const [presetActualSizes, setPresetActualSizes] = useState({});
  const [targetSizeMb, setTargetSizeMb] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isFileDropActive, setIsFileDropActive] = useState(false);

  const selectedPreset = useMemo(
    () =>
      COMPRESSION_PRESETS.find(preset => preset.id === selectedPresetId) ?? COMPRESSION_PRESETS[0],
    [selectedPresetId]
  );
  const presetSizeValues = useMemo(
    () => ({ ...presetEstimates.values, ...presetActualSizes }),
    [presetEstimates.values, presetActualSizes]
  );
  const availablePresetIds = useMemo(
    () => (pdfFile ? getAvailablePresetIds(presetSizeValues, pdfFile.size) : []),
    [pdfFile, presetSizeValues]
  );
  const visiblePresets = useMemo(() => {
    if (!pdfFile || presetEstimates.status !== 'ready') return COMPRESSION_PRESETS;
    return COMPRESSION_PRESETS.filter(preset => availablePresetIds.includes(preset.id));
  }, [availablePresetIds, pdfFile, presetEstimates.status]);
  const canCompressSelectedPreset = Boolean(
    pdfFile && presetEstimates.status === 'ready' && availablePresetIds.includes(selectedPreset.id)
  );

  function applyTargetSize(sizeMb) {
    const nextTarget = targetSizeMb === sizeMb ? null : sizeMb;
    setTargetSizeMb(nextTarget);

    if (nextTarget === null || presetEstimates.status !== 'ready') return;

    const targetBytes = nextTarget * 1024 * 1024;
    const nextPresetId = findPresetIdForTarget(presetSizeValues, targetBytes);
    if (!nextPresetId) return;

    setSelectedPresetId(nextPresetId);
    const estimatedSize = presetSizeValues[nextPresetId];
    const reachable = Number.isFinite(estimatedSize) && estimatedSize <= targetBytes;
    setStatus({
      tone: reachable ? 'info' : 'error',
      title: reachable ? 'Preset sesuai target' : 'Target mungkin tidak tercapai',
      detail: `Perkiraan preset terdekat ${formatBytes(estimatedSize || 0)}.`
    });
  }

  async function handleFileUpload(event) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus({
        tone: 'error',
        title: 'Hanya file PDF yang didukung',
        detail: 'Pilih file PDF sebelum mengompres.'
      });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: 1 });
    setStatus({
      tone: 'loading',
      title: 'Memuat PDF',
      detail: 'Menyiapkan pratinjau dan jumlah halaman.'
    });
    setResult(null);
    setPresetEstimates({ status: 'loading', values: {} });
    setPresetActualSizes({});
    setSelectedPresetId(COMPRESSION_PRESETS[0].id);
    setTargetSizeMb(null);

    try {
      const preview = await readPdfPreview(file, { scale: 0.46, quality: 0.82 });
      const nextPdfFile = {
        file,
        name: file.name,
        size: file.size,
        pageCount: preview.pageCount,
        previewUrl: preview.previewUrl
      };
      setPdfFile(nextPdfFile);
      setStatus({
        tone: 'loading',
        title: 'Memperkirakan ukuran hasil',
        detail: 'Mengambil sampel halaman untuk preset Kualitas Terbaik, Seimbang, dan Kecil.'
      });

      try {
        const estimates = await estimateCompressionSizes(file, preview.pageCount, setProgress);
        const availableIds = getAvailablePresetIds(estimates, file.size);
        setPresetEstimates({ status: 'ready', values: estimates });
        setSelectedPresetId(
          chooseAvailablePresetId(estimates, file.size, COMPRESSION_PRESETS[0].id)
        );
        setStatus({
          tone: availableIds.length ? 'success' : 'info',
          title: availableIds.length ? 'PDF siap' : 'PDF sudah optimal',
          detail: availableIds.length
            ? `${preview.pageCount} halaman dimuat. Hanya preset yang diperkirakan di bawah ukuran asli yang ditampilkan.`
            : `${preview.pageCount} halaman dimuat, tapi tidak ada preset yang diperkirakan di bawah ukuran asli.`
        });
      } catch (estimateError) {
        console.error(estimateError);
        const fallbackEstimates = getFallbackCompressionEstimates(file.size);
        const availableIds = getAvailablePresetIds(fallbackEstimates, file.size);
        setPresetEstimates({ status: 'ready', values: fallbackEstimates });
        setSelectedPresetId(
          chooseAvailablePresetId(fallbackEstimates, file.size, COMPRESSION_PRESETS[0].id)
        );
        setStatus({
          tone: availableIds.length ? 'success' : 'info',
          title: availableIds.length ? 'PDF siap' : 'PDF sudah optimal',
          detail: availableIds.length
            ? `${preview.pageCount} halaman dimuat dengan perkiraan cadangan. Hanya preset di bawah ukuran asli yang ditampilkan.`
            : `${preview.pageCount} halaman dimuat, tapi tidak ada preset yang diperkirakan di bawah ukuran asli.`
        });
      }
    } catch (error) {
      console.error(error);
      setPdfFile(null);
      setPresetEstimates({ status: 'idle', values: {} });
      setStatus({
        tone: 'error',
        title: 'Gagal membaca PDF',
        detail: error.message || 'File yang dipilih tidak bisa dibuka.'
      });
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  function clearFile() {
    setPdfFile(null);
    setResult(null);
    setStatus(null);
    setTargetSizeMb(null);
    setPresetEstimates({ status: 'idle', values: {} });
    setPresetActualSizes({});
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

  async function compressPdf() {
    if (!pdfFile || isProcessing) return;

    if (!canCompressSelectedPreset) {
      setStatus({
        tone: 'info',
        title: 'Tidak ada hasil lebih kecil',
        detail: 'Pilih preset yang diperkirakan di bawah ukuran file asli sebelum mengompres.'
      });
      return;
    }

    const saveTarget = await requestPdfSaveTarget(
      `${getPdfBaseName(pdfFile.name)}_compressed`,
      'dokumen-terkompresi'
    );
    if (!saveTarget) return;

    setIsProcessing(true);
    setResult(null);
    setStatus({
      tone: 'loading',
      title: 'Mengompres PDF',
      detail: `Menggunakan preset ${selectedPreset.label}.`
    });
    setProgress({ current: 0, total: pdfFile.pageCount });

    let pdfProxy = null;

    try {
      const sourceBytes = await pdfFile.file.arrayBuffer();
      const pdfjsLib = getPdfJsLib();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
      pdfProxy = await loadingTask.promise;
      const outputPdf = await PDFDocument.create();
      const totalPages = pdfProxy.numPages || pdfFile.pageCount;

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        let page = null;
        let canvas = null;

        try {
          page = await pdfProxy.getPage(pageNumber);
          const sourceViewport = page.getViewport({ scale: 1 });
          const renderViewport = page.getViewport({ scale: selectedPreset.scale });
          canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Canvas is not supported in this browser.');
          }

          canvas.width = Math.max(1, Math.round(renderViewport.width));
          canvas.height = Math.max(1, Math.round(renderViewport.height));
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport: renderViewport }).promise;

          const imageBytes = await canvasToArrayBuffer(
            canvas,
            'image/jpeg',
            selectedPreset.quality
          );
          const image = await outputPdf.embedJpg(imageBytes);
          const outputPage = outputPdf.addPage([sourceViewport.width, sourceViewport.height]);
          outputPage.drawImage(image, {
            x: 0,
            y: 0,
            width: sourceViewport.width,
            height: sourceViewport.height
          });
        } finally {
          page?.cleanup();
          clearCanvas(canvas);
        }

        setProgress({ current: pageNumber, total: totalPages });
      }

      const outputBytes = await outputPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        compress: true
      });

      const outputBlob = new Blob([outputBytes], { type: 'application/pdf' });
      const savedBytes = pdfFile.size - outputBlob.size;
      const savedPercent =
        pdfFile.size > 0 ? Math.max(0, Math.round((savedBytes / pdfFile.size) * 100)) : 0;
      const updatedSizeValues = {
        [selectedPreset.id]: outputBlob.size
      };
      const nextSizeValues = {
        ...presetSizeValues,
        ...updatedSizeValues
      };

      setPresetActualSizes(prev => ({
        ...prev,
        ...updatedSizeValues
      }));
      setPresetEstimates(prev => ({
        ...prev,
        values: {
          ...prev.values,
          ...updatedSizeValues
        }
      }));

      if (!isMeaningfullySmaller(outputBlob.size, pdfFile.size)) {
        const nextPresetId = chooseAvailablePresetId(
          nextSizeValues,
          pdfFile.size,
          selectedPreset.id
        );
        const nextAvailablePresetIds = getAvailablePresetIds(nextSizeValues, pdfFile.size);
        if (nextAvailablePresetIds.includes(nextPresetId)) {
          setSelectedPresetId(nextPresetId);
        }

        setResult({
          originalSize: pdfFile.size,
          compressedSize: outputBlob.size,
          savedBytes,
          savedPercent: 0,
          wasSaved: false
        });
        setStatus({
          tone: 'info',
          title: 'Hasil tidak lebih kecil',
          detail: `Tidak ada file yang disimpan. ${selectedPreset.label} menghasilkan ${formatBytes(outputBlob.size)}, sedangkan aslinya ${formatBytes(pdfFile.size)}. Preset ini sekarang disembunyikan.`
        });
        return;
      }

      await saveTarget.save(outputBlob);

      setResult({
        originalSize: pdfFile.size,
        compressedSize: outputBlob.size,
        savedBytes,
        savedPercent,
        wasSaved: true
      });
      setStatus({
        tone: 'success',
        title: 'Kompresi selesai',
        detail: `${saveTarget.name} tersimpan. Hemat ${formatBytes(savedBytes)} (${savedPercent}%).`
      });
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Kompresi gagal',
        detail: error.message || 'Gagal mengompres PDF ini.'
      });
    } finally {
      if (pdfProxy) {
        await destroyPdfProxy(pdfProxy);
      }
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  return (
    <div
      className={isFileDropActive ? 'compress-view file-drop-active' : 'compress-view'}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <section className="panel compress-panel">
        <div className="toolbar compress-toolbar">
          <div>
            <h2 className="brand-title compress-title">Kompres PDF</h2>
            <p className="brand-subtitle">Kecilkan ukuran PDF langsung di browser</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Pilih PDF
            </button>
            {pdfFile && (
              <button className="ghost-button" onClick={clearFile} disabled={isProcessing}>
                <X size={16} />
                Hapus PDF
              </button>
            )}
            <button
              className="primary-button"
              onClick={compressPdf}
              disabled={!canCompressSelectedPreset || isProcessing}
            >
              <Download size={16} />
              Kompres &amp; Unduh
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
            className="dropzone compress-upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <Archive size={56} />
            <span className="field-value">Pilih PDF untuk dikompres</span>
            <span className="muted">Seret PDF ke sini atau pilih dari perangkat Anda.</span>
          </button>
        ) : (
          <div className="compress-grid">
            <article className="compress-file-card">
              <div className="compress-preview">
                {pdfFile.previewUrl ? (
                  <img src={pdfFile.previewUrl} alt={`${pdfFile.name} preview`} />
                ) : (
                  <FileText size={48} />
                )}
              </div>
              <div className="compress-file-info">
                <div>
                  <div className="field-label">File Terpilih</div>
                  <div className="compress-file-name">{pdfFile.name}</div>
                </div>
                <div className="compress-meta-grid">
                  <div>
                    <span className="field-label">Ukuran</span>
                    <span className="field-value">{formatBytes(pdfFile.size)}</span>
                  </div>
                  <div>
                    <span className="field-label">Halaman</span>
                    <span className="field-value">{pdfFile.pageCount}</span>
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

            <section className="compress-settings">
              <div className="compress-settings-header">
                <div>
                  <div className="field-label">Level Kompresi</div>
                  <div className="field-value">Pilih kualitas output</div>
                </div>
                <SlidersHorizontal size={20} />
              </div>

              <div className="compress-target-field">
                <span className="field-label">Target ukuran (opsional)</span>
                <div className="compress-target-options" role="group" aria-label="Target ukuran">
                  {TARGET_SIZE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        targetSizeMb === option.value
                          ? 'compress-target-button active'
                          : 'compress-target-button'
                      }
                      aria-pressed={targetSizeMb === option.value}
                      disabled={presetEstimates.status !== 'ready'}
                      onClick={() => applyTargetSize(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <span className="converter-field-hint">
                  Pilih target, lalu preset terbaik di bawah ukuran itu dipakai otomatis. Klik lagi
                  untuk membatalkan.
                </span>
              </div>

              <div className="compress-preset-grid" role="radiogroup" aria-label="Level kompresi">
                {visiblePresets.map(preset => {
                  const actualSize = presetActualSizes[preset.id];
                  const estimatedSize = presetEstimates.values[preset.id];
                  const fallbackSize = pdfFile
                    ? getFallbackCompressionEstimates(pdfFile.size)[preset.id]
                    : null;
                  const displayEstimate = estimatedSize ?? fallbackSize;
                  const sizeLabel = actualSize
                    ? `${formatBytes(actualSize)} aktual`
                    : presetEstimates.status === 'loading'
                      ? 'Memperkirakan...'
                      : displayEstimate
                        ? `~${formatBytes(displayEstimate)} perk.`
                        : 'Menunggu perkiraan';

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedPresetId === preset.id}
                      className={[
                        'compress-preset-button',
                        selectedPresetId === preset.id ? 'active' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setTargetSizeMb(null);
                      }}
                    >
                      <span className="compress-preset-title">
                        <span>{preset.label}</span>
                        <strong>{sizeLabel}</strong>
                      </span>
                      <small>{preset.description}</small>
                    </button>
                  );
                })}
              </div>

              {pdfFile && presetEstimates.status === 'ready' && visiblePresets.length === 0 && (
                <div className="compress-empty-note">
                  Tidak ada preset kompresi yang diperkirakan di bawah ukuran file asli.
                </div>
              )}

              {result && (
                <div
                  className={result.savedBytes > 0 ? 'compress-result' : 'compress-result warning'}
                >
                  <div>
                    <span className="field-label">Asli</span>
                    <span className="field-value">{formatBytes(result.originalSize)}</span>
                  </div>
                  <div>
                    <span className="field-label">{result.wasSaved ? 'Terkompresi' : 'Hasil'}</span>
                    <span className="field-value">{formatBytes(result.compressedSize)}</span>
                  </div>
                  <div>
                    <span className="field-label">Hemat</span>
                    <span className="field-value">
                      {result.savedBytes > 0 ? `${result.savedPercent}%` : '0%'}
                    </span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {isProcessing && <ProcessingOverlay progress={progress} label="Mengompres..." />}
    </div>
  );
}
