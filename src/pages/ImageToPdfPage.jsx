import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Download, Eye, ImagePlus, Images, RotateCw, Trash2 } from 'lucide-react';
import PaginationControls from '../components/PaginationControls';
import PagePreviewModal from '../components/PagePreviewModal';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { getFileBaseName } from '../lib/formatters';
import { preprocessImageForPdf, readImageMetrics } from '../lib/imageProcessing';
import { requestSaveTarget } from '../lib/saveFile';
import { isSupportedImageLikeFile, normalizeMediaFile } from '../lib/mediaFiles';
import { useFlipListAnimation } from '../lib/useFlipListAnimation';
import { useCardDragImage } from '../lib/dragImage';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

const PAGE_TEMPLATES = [
  {
    value: 'a4-auto',
    label: 'A4 Auto',
    description: 'Portrait or landscape follows each image.'
  },
  {
    value: 'a4-portrait',
    label: 'A4 Portrait',
    description: 'All pages use portrait A4.'
  },
  {
    value: 'a4-landscape',
    label: 'A4 Landscape',
    description: 'All pages use landscape A4.'
  }
];

const A4_PAGE = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
  margin: 36
};

const GRID_PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

function getTemplatePageSize(template, processedImage) {
  if (template === 'a4-portrait') return A4_PAGE.portrait;
  if (template === 'a4-landscape') return A4_PAGE.landscape;
  return processedImage.pixelWidth > processedImage.pixelHeight
    ? A4_PAGE.landscape
    : A4_PAGE.portrait;
}

function formatImageSize(width, height) {
  if (!width || !height) return 'Image size unavailable';
  return `${Math.round(width)} x ${Math.round(height)} px`;
}

export default function ImageToPdfPage() {
  const inputRef = useRef(null);
  const previousUrlsRef = useRef([]);
  const [images, setImages] = useState([]);
  const [pageTemplate, setPageTemplate] = useState('a4-auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState(null);
  const [currentImagePage, setCurrentImagePage] = useState(1);
  const [imagePageSize, setImagePageSize] = useState(20);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const [previewImageId, setPreviewImageId] = useState(null);
  const { setItemRef: setCardRef, rememberPositions } = useFlipListAnimation(images, image => image.id);
  const dragIndexRef = useRef(null);
  const totalImagePages = Math.max(1, Math.ceil(images.length / imagePageSize));
  const safeCurrentImagePage = Math.min(currentImagePage, totalImagePages);
  const visibleImageStartIndex = (safeCurrentImagePage - 1) * imagePageSize;
  const visibleImageEndIndex = Math.min(visibleImageStartIndex + imagePageSize, images.length);
  const visibleImages = useMemo(
    () => images.slice(visibleImageStartIndex, visibleImageEndIndex),
    [images, visibleImageEndIndex, visibleImageStartIndex]
  );
  const activePreviewIndex = previewImageId ? images.findIndex(image => image.id === previewImageId) : -1;
  const activePreviewImage = activePreviewIndex >= 0 ? images[activePreviewIndex] : null;

  useEffect(() => {
    const currentUrls = images.map(image => image.previewUrl).filter(Boolean);
    previousUrlsRef.current
      .filter(url => !currentUrls.includes(url))
      .forEach(url => URL.revokeObjectURL(url));
    previousUrlsRef.current = currentUrls;
  }, [images]);

  useEffect(() => () => {
    previousUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

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
        title: 'No supported images',
        detail: 'Choose JPG, PNG, or HEIC images.'
      });
      return;
    }

    setIsProcessing(true);
    setStatus({ tone: 'loading', title: 'Loading images', detail: `Preparing ${files.length} file${files.length === 1 ? '' : 's'}.` });
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
          title: 'Unable to load images',
          detail: failedFiles.length
            ? `${failedFiles.length} image${failedFiles.length === 1 ? '' : 's'} could not be opened.`
            : 'The selected images could not be opened.'
        });
        return;
      }

      rememberPositions();
      setImages(prev => [...prev, ...nextImages]);
      setCurrentImagePage(Math.max(1, Math.ceil((images.length + nextImages.length) / imagePageSize)));

      const issueDetails = [];
      if (skippedCount) {
        issueDetails.push(`${skippedCount} unsupported file${skippedCount === 1 ? '' : 's'} skipped`);
      }
      if (failedFiles.length) {
        issueDetails.push(`${failedFiles.length} image${failedFiles.length === 1 ? '' : 's'} could not be opened`);
      }

      setStatus({
        tone: issueDetails.length ? 'info' : 'success',
        title: issueDetails.length ? 'Images added with warnings' : 'Images added',
        detail: `${nextImages.length} image${nextImages.length === 1 ? '' : 's'} ready for PDF export${issueDetails.length ? `. ${issueDetails.join('; ')}.` : '.'}`
      });
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'error', title: 'Unable to load images', detail: error.message || 'The selected images could not be opened.' });
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
    setImages(prev => prev.map(image => (
      image.id === id ? { ...image, rotation: (image.rotation ?? 0) + 90 } : image
    )));
  }

  function moveImage(fromIndex, toIndex) {
    rememberPositions();
    setImages(prev => {
      if (fromIndex === null || fromIndex === toIndex || fromIndex < 0 || fromIndex >= prev.length) {
        return prev;
      }

      const nextImages = [...prev];
      const [movedImage] = nextImages.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const safeIndex = Math.max(0, Math.min(adjustedIndex, nextImages.length));
      nextImages.splice(safeIndex, 0, movedImage);
      return nextImages;
    });
  }

  function handleDragStart(event, index) {
    dragIndexRef.current = index;
    setDraggedIndex(index);
    setDropTargetIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    useCardDragImage(event);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = event.clientY > rect.top + (rect.height / 2);
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
    const defaultName = images.length === 1 ? `${getFileBaseName(images[0].name, 'images')}.pdf` : 'Images_To_PDF.pdf';
    const saveTarget = await requestSaveTarget({
      suggestedName: defaultName,
      mimeType: 'application/pdf',
      extensions: ['.pdf'],
      description: 'PDF document'
    });
    if (!saveTarget) return;

    setIsProcessing(true);
    setStatus({ tone: 'loading', title: 'Creating PDF', detail: `Writing ${images.length} page${images.length === 1 ? '' : 's'} to PDF.` });
    setLoadingProgress({ current: 0, total: images.length });

    try {
      const pdfDoc = await PDFDocument.create();

      for (let index = 0; index < images.length; index += 1) {
        const item = images[index];
        const processed = await preprocessImageForPdf(item.file, item.rotation);
        const embeddedImage = await pdfDoc.embedJpg(processed.bytes);
        const pageSize = getTemplatePageSize(pageTemplate, processed);
        const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
        const margin = A4_PAGE.margin;
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
      setStatus({ tone: 'success', title: 'PDF saved', detail: `${saveTarget.name} saved.` });
    } catch (error) {
      console.error(error);
      setStatus({ tone: 'error', title: 'Unable to create PDF', detail: error.message || 'The images could not be converted to PDF.' });
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
            <h2 className="brand-title converter-title">Image to PDF</h2>
            <p className="brand-subtitle">Create a single PDF from JPG, PNG, or HEIC files.</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isProcessing}>
              <ImagePlus size={16} />
              Add Images
            </button>
            <button className="primary-button" onClick={convertImagesToPdf} disabled={!images.length || isProcessing}>
              <Download size={16} />
              Save PDF
            </button>
          </div>
        </div>

        <input ref={inputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/jpg,image/heic,.png,.jpg,.jpeg,.heic" onChange={handleImageUpload} />
        <StatusBanner status={status} />

        {images.length === 0 ? (
          <button type="button" className="dropzone converter-upload-zone" onClick={() => inputRef.current?.click()} disabled={isProcessing}>
            <Images size={56} />
            <span className="field-value">Choose multiple images to create a PDF</span>
            <span className="muted">Drop JPG, PNG, or HEIC images here.</span>
          </button>
        ) : (
          <>
            <section className="image-to-pdf-template-panel">
              <div className="image-to-pdf-template-copy">
                <span className="field-label">PDF Template</span>
                <div className="field-value">Standard A4</div>
                <div className="image-to-pdf-template-meta">
                  {images.length} image{images.length === 1 ? '' : 's'} - 0.5 inch margin
                </div>
              </div>
              <div className="image-to-pdf-template-options" role="radiogroup" aria-label="PDF page template">
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
              itemLabel="Images"
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
                const isPortrait = quarterTurn ? image.width > image.height : image.height >= image.width;

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
                      dropTargetIndex === images.length && index === images.length - 1 ? 'drop-target-after' : ''
                    ].filter(Boolean).join(' ')}
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
                          image.height >= image.width ? 'source-portrait' : 'source-landscape',
                        ].filter(Boolean).join(' ')}
                        style={{ transform: `rotate(${frameRotation}deg)` }}
                      >
                        <img src={image.previewUrl} alt={image.name} />
                      </div>
                      <div className="page-count-badge">{formatImageSize(image.width, image.height)}</div>
                      <div className="page-badge">#{index + 1}</div>
                      <div className="orientation-badge">{isPortrait ? 'Portrait' : 'Landscape'}</div>
                      <div className="rotation-badge">{effectiveRotation}&deg;</div>
                    </div>
                    <div className="image-to-pdf-card-copy">
                      <div className="filename image-to-pdf-file-name" title={image.name}>{image.name}</div>
                    </div>
                    <div className="page-footer image-to-pdf-footer">
                      <button type="button" className="ghost-button" onClick={() => setPreviewImageId(image.id)}>
                        <Eye size={16} />
                        Preview
                      </button>
                      <button type="button" className="ghost-button" onClick={() => rotateImage(image.id)} title="Rotate 90 degrees">
                        <RotateCw size={16} />
                        Rotate
                      </button>
                      <button type="button" className="danger-button" onClick={() => removeImage(image.id)}>
                        <Trash2 size={16} />
                        Remove
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
        pageLabel={activePreviewImage ? `Image ${activePreviewIndex + 1}: ${activePreviewImage.name}` : 'Image Preview'}
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
