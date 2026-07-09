import { useMemo, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Archive, Download, FileText, SlidersHorizontal, Upload, X } from 'lucide-react';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { canvasToArrayBuffer, clearCanvas } from '../lib/canvas';
import { formatBytes, getPdfBaseName } from '../lib/formatters';
import { getPdfJsLib } from '../lib/pdfjs';
import { readPdfPreview } from '../lib/pdfPreview';
import { requestPdfSaveTarget } from '../lib/saveFile';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

const COMPRESSION_PRESETS = [
  {
    id: 'best',
    label: 'Best Quality',
    description: 'Keeps pages clearer with the highest output quality.',
    scale: 1.75,
    quality: 0.84
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good quality with a smaller file size.',
    scale: 1.35,
    quality: 0.72
  },
  {
    id: 'small',
    label: 'Small',
    description: 'Smallest size for sharing by email.',
    scale: 1,
    quality: 0.56
  }
];

const FALLBACK_ESTIMATE_RATIOS = {
  best: 0.82,
  balanced: 0.68,
  small: 0.48
};

const MIN_SAVINGS_BYTES = 1024;

function getEstimatePageNumbers(pageCount) {
  return Array.from(new Set([1, Math.ceil(pageCount / 2), pageCount]))
    .filter(pageNumber => pageNumber >= 1 && pageNumber <= pageCount);
}

function getFallbackCompressionEstimates(fileSize) {
  return Object.fromEntries(COMPRESSION_PRESETS.map(preset => [
    preset.id,
    Math.max(1, Math.round(fileSize * (FALLBACK_ESTIMATE_RATIOS[preset.id] ?? 1)))
  ]));
}

function estimatePdfBytes(sampleBytes, sampleCount, pageCount) {
  if (!sampleCount || !pageCount) return 0;
  const averagePageBytes = sampleBytes / sampleCount;
  const pdfOverheadBytes = 4096 + (pageCount * 1400);
  return Math.max(1, Math.round((averagePageBytes * pageCount) + pdfOverheadBytes));
}

function isMeaningfullySmaller(outputSize, originalSize) {
  return originalSize - outputSize >= MIN_SAVINGS_BYTES;
}

function getAvailablePresetIds(sizeValues, originalSize) {
  if (!originalSize) return [];
  return COMPRESSION_PRESETS
    .filter(preset => isMeaningfullySmaller(sizeValues[preset.id], originalSize))
    .map(preset => preset.id);
}

function chooseAvailablePresetId(sizeValues, originalSize, preferredId) {
  const availablePresetIds = getAvailablePresetIds(sizeValues, originalSize);
  return availablePresetIds.includes(preferredId)
    ? preferredId
    : availablePresetIds[0] ?? preferredId ?? COMPRESSION_PRESETS[0].id;
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
              throw new Error('Canvas is not supported in this browser.');
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

    return Object.fromEntries(COMPRESSION_PRESETS.map(preset => [
      preset.id,
      sampleCounts[preset.id] > 0
        ? estimatePdfBytes(sampleTotals[preset.id], sampleCounts[preset.id], pageCount)
        : fallbackEstimates[preset.id]
    ]));
  } finally {
    await pdfProxy.destroy();
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isFileDropActive, setIsFileDropActive] = useState(false);

  const selectedPreset = useMemo(
    () => COMPRESSION_PRESETS.find(preset => preset.id === selectedPresetId) ?? COMPRESSION_PRESETS[0],
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
  const visiblePresets = useMemo(
    () => {
      if (!pdfFile || presetEstimates.status !== 'ready') return COMPRESSION_PRESETS;
      return COMPRESSION_PRESETS.filter(preset => availablePresetIds.includes(preset.id));
    },
    [availablePresetIds, pdfFile, presetEstimates.status]
  );
  const canCompressSelectedPreset = Boolean(
    pdfFile &&
    presetEstimates.status === 'ready' &&
    availablePresetIds.includes(selectedPreset.id)
  );

  async function handleFileUpload(event) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatus({ tone: 'error', title: 'Only PDF files are supported', detail: 'Choose a PDF file before compressing.' });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: 1 });
    setStatus({ tone: 'loading', title: 'Loading PDF', detail: 'Preparing preview and page count.' });
    setResult(null);
    setPresetEstimates({ status: 'loading', values: {} });
    setPresetActualSizes({});
    setSelectedPresetId(COMPRESSION_PRESETS[0].id);

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
        setStatus({ tone: 'loading', title: 'Estimating output size', detail: 'Sampling pages for Best Quality, Balanced, and Small presets.' });

      try {
        const estimates = await estimateCompressionSizes(file, preview.pageCount, setProgress);
        const availableIds = getAvailablePresetIds(estimates, file.size);
        setPresetEstimates({ status: 'ready', values: estimates });
        setSelectedPresetId(chooseAvailablePresetId(estimates, file.size, COMPRESSION_PRESETS[0].id));
        setStatus({
          tone: availableIds.length ? 'success' : 'info',
          title: availableIds.length ? 'PDF ready' : 'PDF already optimized',
          detail: availableIds.length
            ? `${preview.pageCount} page${preview.pageCount === 1 ? '' : 's'} loaded. Showing only presets estimated below the original size.`
            : `${preview.pageCount} page${preview.pageCount === 1 ? '' : 's'} loaded, but no preset is estimated below the original size.`
        });
      } catch (estimateError) {
        console.error(estimateError);
        const fallbackEstimates = getFallbackCompressionEstimates(file.size);
        const availableIds = getAvailablePresetIds(fallbackEstimates, file.size);
        setPresetEstimates({ status: 'ready', values: fallbackEstimates });
        setSelectedPresetId(chooseAvailablePresetId(fallbackEstimates, file.size, COMPRESSION_PRESETS[0].id));
        setStatus({
          tone: availableIds.length ? 'success' : 'info',
          title: availableIds.length ? 'PDF ready' : 'PDF already optimized',
          detail: availableIds.length
            ? `${preview.pageCount} page${preview.pageCount === 1 ? '' : 's'} loaded with fallback size estimates. Showing only presets below the original size.`
            : `${preview.pageCount} page${preview.pageCount === 1 ? '' : 's'} loaded, but no preset is estimated below the original size.`
        });
      }
    } catch (error) {
      console.error(error);
      setPdfFile(null);
      setPresetEstimates({ status: 'idle', values: {} });
      setStatus({ tone: 'error', title: 'Unable to read PDF', detail: error.message || 'The selected file could not be opened.' });
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  function clearFile() {
    setPdfFile(null);
    setResult(null);
    setStatus(null);
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
        title: 'No smaller output available',
        detail: 'Choose a preset estimated below the original file size before compressing.'
      });
      return;
    }

    const saveTarget = await requestPdfSaveTarget(`${getPdfBaseName(pdfFile.name)}_compressed`, 'compressed-document');
    if (!saveTarget) return;

    setIsProcessing(true);
    setResult(null);
    setStatus({ tone: 'loading', title: 'Compressing PDF', detail: `Using ${selectedPreset.label} settings.` });
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

          const imageBytes = await canvasToArrayBuffer(canvas, 'image/jpeg', selectedPreset.quality);
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
      const savedPercent = pdfFile.size > 0 ? Math.max(0, Math.round((savedBytes / pdfFile.size) * 100)) : 0;
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
        const nextPresetId = chooseAvailablePresetId(nextSizeValues, pdfFile.size, selectedPreset.id);
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
          title: 'Output is not smaller',
          detail: `Nothing was saved. ${selectedPreset.label} would create ${formatBytes(outputBlob.size)}, while the original is ${formatBytes(pdfFile.size)}. This preset is now hidden.`
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
        title: 'Compression complete',
        detail: `${saveTarget.name} saved. Saved ${formatBytes(savedBytes)} (${savedPercent}%).`
      });
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'error', title: 'Compression failed', detail: error.message || 'Unable to compress this PDF.' });
    } finally {
      if (pdfProxy) {
        await pdfProxy.destroy();
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
            <h2 className="brand-title compress-title">Compress PDF</h2>
            <p className="brand-subtitle">Reduce PDF size directly in the browser</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Choose PDF
            </button>
            {pdfFile && (
              <button className="ghost-button" onClick={clearFile} disabled={isProcessing}>
                <X size={16} />
                Clear PDF
              </button>
            )}
            <button className="primary-button" onClick={compressPdf} disabled={!canCompressSelectedPreset || isProcessing}>
              <Download size={16} />
              Compress & Download
            </button>
          </div>
        </div>

        <input ref={fileInputRef} type="file" hidden accept="application/pdf,.pdf" onChange={handleFileUpload} />
        <StatusBanner status={status} />

        {!pdfFile ? (
          <button type="button" className="dropzone compress-upload-zone" onClick={() => fileInputRef.current?.click()}>
            <Archive size={56} />
            <span className="field-value">Choose a PDF to compress</span>
            <span className="muted">Drop a PDF here or choose one from your device.</span>
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
                  <div className="field-label">Selected File</div>
                  <div className="compress-file-name">{pdfFile.name}</div>
                </div>
                <div className="compress-meta-grid">
                  <div>
                    <span className="field-label">Size</span>
                    <span className="field-value">{formatBytes(pdfFile.size)}</span>
                  </div>
                  <div>
                    <span className="field-label">Pages</span>
                    <span className="field-value">{pdfFile.pageCount}</span>
                  </div>
                </div>
              </div>
              <button type="button" className="toast-close compress-clear-button" onClick={clearFile} aria-label="Remove selected PDF" title="Remove selected PDF">
                <X size={16} />
              </button>
            </article>

            <section className="compress-settings">
              <div className="compress-settings-header">
                <div>
                  <div className="field-label">Level Compression</div>
                  <div className="field-value">Choose output quality</div>
                </div>
                <SlidersHorizontal size={20} />
              </div>

              <div className="compress-preset-grid" role="radiogroup" aria-label="Level compression">
                {visiblePresets.map(preset => {
                  const actualSize = presetActualSizes[preset.id];
                  const estimatedSize = presetEstimates.values[preset.id];
                  const fallbackSize = pdfFile ? getFallbackCompressionEstimates(pdfFile.size)[preset.id] : null;
                  const displayEstimate = estimatedSize ?? fallbackSize;
                  const sizeLabel = actualSize
                    ? `${formatBytes(actualSize)} actual`
                    : presetEstimates.status === 'loading'
                      ? 'Estimating...'
                      : displayEstimate
                        ? `~${formatBytes(displayEstimate)} est.`
                        : 'Estimate pending';

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedPresetId === preset.id}
                      className={[
                        'compress-preset-button',
                        selectedPresetId === preset.id ? 'active' : ''
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedPresetId(preset.id)}
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
                  No compression preset is estimated below the original file size.
                </div>
              )}

              {result && (
                <div className={result.savedBytes > 0 ? 'compress-result' : 'compress-result warning'}>
                  <div>
                    <span className="field-label">Original</span>
                    <span className="field-value">{formatBytes(result.originalSize)}</span>
                  </div>
                  <div>
                    <span className="field-label">{result.wasSaved ? 'Compressed' : 'Output'}</span>
                    <span className="field-value">{formatBytes(result.compressedSize)}</span>
                  </div>
                  <div>
                    <span className="field-label">Saved</span>
                    <span className="field-value">{result.savedBytes > 0 ? `${result.savedPercent}%` : '0%'}</span>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {isProcessing && <ProcessingOverlay progress={progress} label="Compressing..." />}
    </div>
  );
}
