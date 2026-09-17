import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Eye, ImagePlus, Images, RotateCw, Trash2 } from 'lucide-react';
import CardMoveControls from '../components/CardMoveControls';
import PaginationControls from '../components/PaginationControls';
import PagePreviewModal from '../components/PagePreviewModal';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { getFileBaseName } from '../lib/formatters';
import { moveItem } from '../lib/listReorder';
import { preprocessImageForPdf, readImageMetrics } from '../lib/imageProcessing';
import { requestSaveTarget } from '../lib/saveFile';
import { clearSession, loadSession, saveSession } from '../lib/sessionStore';
import { isSupportedImageLikeFile, normalizeMediaFile } from '../lib/mediaFiles';
import { useBeforeUnload } from '../lib/useBeforeUnload';
import { useFlipListAnimation } from '../lib/useFlipListAnimation';
import { applyCardDragImage } from '../lib/dragImage';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

const PAGE_TEMPLATES = [
  {
    value: 'a4-auto',
    label: 'A4 Otomatis',
    description: 'Potret atau lanskap mengikuti tiap gambar.'
  },
  {
    value: 'a4-portrait',
    label: 'A4 Potret',
    description: 'Semua halaman potret A4.'
  },
  {
    value: 'a4-landscape',
    label: 'A4 Lanskap',
    description: 'Semua halaman lanskap A4.'
  },
  {
    value: 'letter-auto',
    label: 'Letter Otomatis',
    description: 'US Letter, orientasi mengikuti tiap gambar.'
  },
  {
    value: 'legal-auto',
    label: 'Legal Otomatis',
    description: 'US Legal, orientasi mengikuti tiap gambar.'
  }
];

const PAGE_SIZES = {
  a4: {
    portrait: { width: 595.28, height: 841.89 },
    landscape: { width: 841.89, height: 595.28 }
  },
  letter: {
    portrait: { width: 612, height: 792 },
    landscape: { width: 792, height: 612 }
  },
  legal: {
    portrait: { width: 612, height: 1008 },
    landscape: { width: 1008, height: 612 }
  }
};

const PAGE_MARGIN = 36;

const QUALITY_OPTIONS = [
  { value: 0.7, label: 'File lebih kecil' },
  { value: 0.85, label: 'Seimbang' },
  { value: 0.95, label: 'Kualitas terbaik' }
];

const GRID_PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

function getTemplatePageSize(template, processedImage) {
  const [sizeKey, orientation] = template.split('-');
  const size = PAGE_SIZES[sizeKey] ?? PAGE_SIZES.a4;

  if (orientation === 'portrait') return size.portrait;
  if (orientation === 'landscape') return size.landscape;
  return processedImage.pixelWidth > processedImage.pixelHeight ? size.landscape : size.portrait;
}

function formatImageSize(width, height) {
  if (!width || !height) return 'Ukuran gambar tidak tersedia';
  return `${Math.round(width)} x ${Math.round(height)} px`;
}

export default function ImageToPdfPage() {
  const inputRef = useRef(null);
  const previousUrlsRef = useRef([]);
  const [images, setImages] = useState([]);
  const [pageTemplate, setPageTemplate] = useState('a4-auto');
  const [imageQuality, setImageQuality] = useState(0.85);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState(null);
  const [currentImagePage, setCurrentImagePage] = useState(1);
  const [imagePageSize, setImagePageSize] = useState(20);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const [previewImageId, setPreviewImageId] = useState(null);
  const { setItemRef: setCardRef, rememberPositions } = useFlipListAnimation(
    images,
    image => image.id
  );

  useBeforeUnload(images.length > 0);
  const dragIndexRef = useRef(null);
  const isHydratedRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const totalImagePages = Math.max(1, Math.ceil(images.length / imagePageSize));
  const safeCurrentImagePage = Math.min(currentImagePage, totalImagePages);
  const visibleImageStartIndex = (safeCurrentImagePage - 1) * imagePageSize;
  const visibleImageEndIndex = Math.min(visibleImageStartIndex + imagePageSize, images.length);
  const visibleImages = useMemo(
    () => images.slice(visibleImageStartIndex, visibleImageEndIndex),
    [images, visibleImageEndIndex, visibleImageStartIndex]
  );
  const activePreviewIndex = previewImageId
    ? images.findIndex(image => image.id === previewImageId)
    : -1;
  const activePreviewImage = activePreviewIndex >= 0 ? images[activePreviewIndex] : null;

  useEffect(() => {
    const currentUrls = images.map(image => image.previewUrl).filter(Boolean);
    previousUrlsRef.current
      .filter(url => !currentUrls.includes(url))
      .forEach(url => URL.revokeObjectURL(url));
    previousUrlsRef.current = currentUrls;
  }, [images]);

  useEffect(
    () => () => {
      previousUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    (async () => {
      try {
        const saved = await loadSession('image-to-pdf');
        if (!saved) return;

        const restored = (saved.images ?? [])
          .filter(item => item?.file)
          .map(item => ({
            id: item.id || crypto.randomUUID(),
            file: item.file,
            name: item.name || item.file.name,
            rotation: item.rotation ?? 0,
            width: item.width || 1,
            height: item.height || 1,
            previewUrl: URL.createObjectURL(item.file)
          }));

        if (restored.length) {
          setImages(restored);
          if (saved.pageTemplate) setPageTemplate(saved.pageTemplate);
        }
      } catch (error) {
        console.error(error);
      } finally {
        isHydratedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) return undefined;

    if (!images.length) {
      void clearSession('image-to-pdf');
      return undefined;
    }

    const handle = window.setTimeout(() => {
      void saveSession('image-to-pdf', {
        pageTemplate,
        images: images.map(({ id, file, name, rotation, width, height }) => ({
          id,
          file,
          name,
          rotation,
          width,
          height
        }))
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [images, pageTemplate]);

  useEffect(() => {
    setCurrentImagePage(prev => Math.min(Math.max(1, prev), totalImagePages));
  }, [totalImagePages]);

  useEffect(() => {
    if (previewImageId && !images.some(image => image.id === previewImageId)) {
      setPreviewImageId(null);
    }
  }, [images, previewImageId]);

  async function addImages(selectedFiles) {
    const allFiles = Array.from(selectedFiles ?? []);
    if (!allFiles.length) return;

    const files = allFiles.filter(isSupportedImageLikeFile);
    const skippedCount = allFiles.length - files.length;

    if (!files.length) {
      setStatus({
        tone: 'error',
        title: 'Tidak ada gambar yang didukung',
        detail: 'Pilih gambar JPG, PNG, atau HEIC.'
      });
      return;
    }

    setIsProcessing(true);
    setStatus({
      tone: 'loading',
      title: 'Memuat gambar',
      detail: `Menyiapkan ${files.length} file.`
    });
    setLoadingProgress({ current: 0, total: files.length });

    try {
      const nextImages = [];
      const failedFiles = [];
      for (let index = 0; index < files.length; index += 1) {
        const sourceFile = files[index];
        try {
          const file = await normalizeMediaFile(sourceFile);
          const metrics = await readImageMetrics(file);
          nextImages.push({
            id: crypto.randomUUID(),
            file,
            name: sourceFile.name === file.name ? file.name : `${sourceFile.name} -> ${file.name}`,
            previewUrl: URL.createObjectURL(file),
            rotation: 0,
            width: metrics.width,
            height: metrics.height
          });
        } catch (error) {
          console.error(`Unable to load image: ${sourceFile.name}`, error);
          failedFiles.push(sourceFile.name);
        }
        setLoadingProgress({ current: index + 1, total: files.length });
      }

      if (!nextImages.length) {
        setStatus({
          tone: 'error',
          title: 'Gagal memuat gambar',
          detail: failedFiles.length
            ? `${failedFiles.length} gambar tidak bisa dibuka.`
            : 'Gambar yang dipilih tidak bisa dibuka.'
        });
        return;
      }

      rememberPositions();
      setImages(prev => [...prev, ...nextImages]);
      setCurrentImagePage(
        Math.max(1, Math.ceil((images.length + nextImages.length) / imagePageSize))
      );

      const issueDetails = [];
      if (skippedCount) {
        issueDetails.push(`${skippedCount} file tidak didukung dilewati`);
      }
      if (failedFiles.length) {
        issueDetails.push(`${failedFiles.length} gambar tidak bisa dibuka`);
      }

      setStatus({
        tone: issueDetails.length ? 'info' : 'success',
        title: issueDetails.length ? 'Gambar ditambahkan dengan peringatan' : 'Gambar ditambahkan',
        detail: `${nextImages.length} gambar siap diekspor ke PDF${issueDetails.length ? `. ${issueDetails.join('; ')}.` : '.'}`
      });
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Gagal memuat gambar',
        detail: error.message || 'Gambar yang dipilih tidak bisa dibuka.'
      });
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  async function handleImageUpload(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await addImages(files);
  }

  function removeImage(id) {
    rememberPositions();
    if (previewImageId === id) {
      setPreviewImageId(null);
    }
    setImages(prev => prev.filter(image => image.id !== id));
  }

  function rotateImage(id) {
    setImages(prev =>
      prev.map(image =>
        image.id === id ? { ...image, rotation: (image.rotation ?? 0) + 90 } : image
      )
    );
  }

  function moveImageByOffset(imageId, offset) {
    const fromIndex = images.findIndex(image => image.id === imageId);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= images.length) return;

    rememberPositions();
    setImages(prev => moveItem(prev, fromIndex, toIndex));
  }

  function moveImage(fromIndex, toIndex) {
    rememberPositions();
    setImages(prev => {
      if (
        fromIndex === null ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= prev.length
      ) {
        return prev;
      }

      return moveItem(prev, fromIndex, toIndex);
    });
  }

  function handleDragStart(event, index) {
    dragIndexRef.current = index;
    setDraggedIndex(index);
    setDropTargetIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    applyCardDragImage(event);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = event.clientY > rect.top + rect.height / 2;
    const nextIndex = isAfter ? index + 1 : index;
    setDropTargetIndex(Math.min(nextIndex, images.length));

    const adjustedIndex = dragIndexRef.current < nextIndex ? nextIndex - 1 : nextIndex;
    if (adjustedIndex === dragIndexRef.current) return;

    moveImage(dragIndexRef.current, adjustedIndex);
    dragIndexRef.current = adjustedIndex;
    setDraggedIndex(adjustedIndex);
  }

  function handleDrop(event) {
    event.preventDefault();
    handleDragEnd();
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDraggedIndex(null);
    setDropTargetIndex(null);
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
    addImages(getDroppedFiles(event));
  }

  async function convertImagesToPdf() {
    if (!images.length || isProcessing) return;
    const defaultName =
      images.length === 1
        ? `${getFileBaseName(images[0].name, 'gambar')}.pdf`
        : 'Gambar_Ke_PDF.pdf';
    const saveTarget = await requestSaveTarget({
      suggestedName: defaultName,
      mimeType: 'application/pdf',
      extensions: ['.pdf'],
      description: 'Dokumen PDF'
    });
    if (!saveTarget) return;

    setIsProcessing(true);
    setStatus({
      tone: 'loading',
      title: 'Membuat PDF',
      detail: `Menulis ${images.length} halaman ke PDF.`
    });
    setLoadingProgress({ current: 0, total: images.length });

    try {
      const pdfDoc = await PDFDocument.create();

      for (let index = 0; index < images.length; index += 1) {
        const item = images[index];
        const processed = await preprocessImageForPdf(item.file, item.rotation, {
          quality: imageQuality
        });
        const embeddedImage = await pdfDoc.embedJpg(processed.bytes);
        const pageSize = getTemplatePageSize(pageTemplate, processed);
        const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
        const margin = PAGE_MARGIN;
        const maxWidth = pageSize.width - margin * 2;
        const maxHeight = pageSize.height - margin * 2;
        const scale = Math.min(maxWidth / processed.pixelWidth, maxHeight / processed.pixelHeight);
        const drawWidth = processed.pixelWidth * scale;
        const drawHeight = processed.pixelHeight * scale;
        const x = (pageSize.width - drawWidth) / 2;
        const y = (pageSize.height - drawHeight) / 2;

        page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });
        setLoadingProgress({ current: index + 1, total: images.length });
      }

      const bytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        compress: true
      });
      await saveTarget.save(new Blob([bytes], { type: 'application/pdf' }));
      setStatus({
        tone: 'success',
        title: 'PDF tersimpan',
        detail: `${saveTarget.name} tersimpan.`
      });
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Gagal membuat PDF',
        detail: error.message || 'Gambar tidak bisa dikonversi ke PDF.'
      });
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
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
            <h2 className="brand-title converter-title">Gambar ke PDF</h2>
            <p className="brand-subtitle">Buat satu PDF dari file JPG, PNG, atau HEIC.</p>
          </div>
          <div className="merge-actions">
            <button
              className="secondary-button"
              onClick={() => inputRef.current?.click()}
              disabled={isProcessing}
            >
              <ImagePlus size={16} />
              Tambah Gambar
            </button>
            <button
              className="primary-button"
              onClick={convertImagesToPdf}
              disabled={!images.length || isProcessing}
            >
              <Download size={16} />
              Simpan PDF
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/jpg,image/heic,.png,.jpg,.jpeg,.heic"
          onChange={handleImageUpload}
        />
        <StatusBanner status={status} />

        {images.length === 0 ? (
          <button
            type="button"
            className="dropzone converter-upload-zone"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
          >
            <Images size={56} />
            <span className="field-value">Pilih beberapa gambar untuk membuat PDF</span>
            <span className="muted">Seret gambar JPG, PNG, atau HEIC ke sini.</span>
          </button>
        ) : (
          <>
            <section className="image-to-pdf-template-panel">
              <div className="image-to-pdf-template-copy">
                <span className="field-label">Template PDF</span>
                <div className="field-value">Ukuran halaman &amp; kualitas gambar</div>
                <div className="image-to-pdf-template-meta">
                  {images.length} gambar - margin 0,5 inci
                </div>
                <label className="converter-field image-to-pdf-quality">
                  <span className="field-label">Kualitas gambar</span>
                  <select
                    className="converter-select"
                    value={imageQuality}
                    onChange={event => setImageQuality(Number(event.target.value))}
                  >
                    {QUALITY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div
                className="image-to-pdf-template-options"
                role="radiogroup"
                aria-label="Template halaman PDF"
              >
                {PAGE_TEMPLATES.map(template => (
                  <button
                    key={template.value}
                    type="button"
                    role="radio"
                    aria-checked={pageTemplate === template.value}
                    className={pageTemplate === template.value ? 'active' : ''}
                    onClick={() => setPageTemplate(template.value)}
                  >
                    <span>{template.label}</span>
                    <small>{template.description}</small>
                  </button>
                ))}
              </div>
            </section>

            <PaginationControls
              totalItems={images.length}
              pageSize={imagePageSize}
              currentPage={safeCurrentImagePage}
              onPageChange={setCurrentImagePage}
              itemLabel="Gambar"
              pageSizeOptions={GRID_PAGE_SIZE_OPTIONS}
              onPageSizeChange={nextSize => {
                setImagePageSize(nextSize);
                setCurrentImagePage(1);
              }}
            />

            <div className="page-grid image-to-pdf-grid">
              {visibleImages.map((image, localIndex) => {
                const index = visibleImageStartIndex + localIndex;
                const frameRotation = image.rotation ?? 0;
                const effectiveRotation = ((frameRotation % 360) + 360) % 360;
                const quarterTurn = effectiveRotation % 180 !== 0;
                const isPortrait = quarterTurn
                  ? image.width > image.height
                  : image.height >= image.width;

                return (
                  <article
                    key={image.id}
                    ref={element => setCardRef(image.id, element)}
                    className={[
                      'page-card',
                      'image-to-pdf-card',
                      isPortrait ? 'portrait-card' : 'landscape-card',
                      draggedIndex === index ? 'dragging' : '',
                      dropTargetIndex === index ? 'drop-target-before' : '',
                      dropTargetIndex === images.length && index === images.length - 1
                        ? 'drop-target-after'
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable
                    onDragStart={event => handleDragStart(event, index)}
                    onDragOver={event => handleDragOver(event, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="page-preview">
                      <div
                        className={[
                          'page-preview-frame',
                          image.height >= image.width ? 'source-portrait' : 'source-landscape'
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ transform: `rotate(${frameRotation}deg)` }}
                      >
                        <img src={image.previewUrl} alt={image.name} />
                      </div>
                      <div className="page-count-badge">
                        {formatImageSize(image.width, image.height)}
                      </div>
                      <div className="page-badge">#{index + 1}</div>
                      <div className="orientation-badge">{isPortrait ? 'Potret' : 'Lanskap'}</div>
                      <div className="rotation-badge">{effectiveRotation}&deg;</div>
                      <CardMoveControls
                        label={`gambar ${index + 1}`}
                        canMoveBackward={index > 0}
                        canMoveForward={index < images.length - 1}
                        onMoveBackward={() => moveImageByOffset(image.id, -1)}
                        onMoveForward={() => moveImageByOffset(image.id, 1)}
                      />
                    </div>
                    <div className="image-to-pdf-card-copy">
                      <div className="filename image-to-pdf-file-name" title={image.name}>
                        {image.name}
                      </div>
                    </div>
                    <div className="page-footer image-to-pdf-footer">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setPreviewImageId(image.id)}
                      >
                        <Eye size={16} />
                        Pratinjau
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => rotateImage(image.id)}
                        title="Putar 90 derajat"
                      >
                        <RotateCw size={16} />
                        Putar
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => removeImage(image.id)}
                      >
                        <Trash2 size={16} />
                        Hapus
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <PagePreviewModal
        open={Boolean(activePreviewImage)}
        titleId="image-preview-title"
        pageLabel={
          activePreviewImage
            ? `Gambar ${activePreviewIndex + 1}: ${activePreviewImage.name}`
            : 'Pratinjau Gambar'
        }
        imageUrl={activePreviewImage?.previewUrl || ''}
        isLoading={false}
        rotation={activePreviewImage?.rotation ?? 0}
        canGoPrev={activePreviewIndex > 0}
        canGoNext={activePreviewIndex >= 0 && activePreviewIndex < images.length - 1}
        onClose={() => setPreviewImageId(null)}
        onPrev={() => {
          if (activePreviewIndex > 0) {
            setPreviewImageId(images[activePreviewIndex - 1].id);
          }
        }}
        onNext={() => {
          if (activePreviewIndex >= 0 && activePreviewIndex < images.length - 1) {
            setPreviewImageId(images[activePreviewIndex + 1].id);
          }
        }}
      />

      {isProcessing && <ProcessingOverlay loadingProgress={loadingProgress} />}
    </div>
  );
}
