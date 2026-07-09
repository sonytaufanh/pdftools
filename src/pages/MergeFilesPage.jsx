import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { Check, CheckSquare, Eye, FileCheck, Files, FileStack, Palette, PlusCircle, RotateCw, Trash2, Ungroup } from 'lucide-react';
import PaginationControls from '../components/PaginationControls';
import PagePreviewModal from '../components/PagePreviewModal';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import { applyCanvasGrayscale, canvasToArrayBuffer, clearCanvas } from '../lib/canvas';
import { preprocessImageForPdf } from '../lib/imageProcessing';
import { getPdfJsLib } from '../lib/pdfjs';
import { requestPdfSaveTarget } from '../lib/saveFile';
import { isSupportedImageLikeFile, normalizeMediaFile } from '../lib/mediaFiles';
import { useFlipListAnimation } from '../lib/useFlipListAnimation';
import { useCardDragImage } from '../lib/dragImage';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';

function getPreviewPageCount(item) {
  if (!item) return 1;
  if (item.type === 'pdf') return Math.max(1, Number(item.pageCount) || 1);
  if (item.type === 'pdf-group') return Math.max(1, item.pages?.length || Number(item.pageCount) || 1);
  return 1;
}

function getPreviewPageInfo(item, previewPageIndex = 0) {
  const pageCount = getPreviewPageCount(item);
  const safePageIndex = Math.min(pageCount - 1, Math.max(0, previewPageIndex));

  if (!item) {
    return { label: 'Page 1 of 1', pageCount: 1, safePageIndex: 0, renderPageIndex: 0, rotation: 0 };
  }

  if (item.type === 'pdf-page') {
    const sourcePageNumber = (item.pageIndex ?? 0) + 1;
    const sourcePageCount = Math.max(sourcePageNumber, Number(item.sourcePageCount) || sourcePageNumber);
    return {
      label: `Page ${sourcePageNumber} of ${sourcePageCount}`,
      pageCount: 1,
      safePageIndex: 0,
      renderPageIndex: item.pageIndex ?? 0,
      rotation: item.rotation ?? 0
    };
  }

  if (item.type === 'pdf-group') {
    const groupPage = item.pages?.[safePageIndex] ?? item.pages?.[0] ?? {};
    const sourcePageNumber = (groupPage.pageIndex ?? 0) + 1;
    const sourcePageCount = Math.max(sourcePageNumber, Number(groupPage.sourcePageCount) || Number(item.sourcePageCount) || sourcePageNumber);
    return {
      label: `Group page ${safePageIndex + 1} of ${pageCount} - Source page ${sourcePageNumber} of ${sourcePageCount}`,
      pageCount,
      safePageIndex,
      renderPageIndex: groupPage.pageIndex ?? 0,
      rotation: (groupPage.rotation ?? 0) + (item.rotation ?? 0)
    };
  }

  if (item.type === 'pdf') {
    return {
      label: `Page ${safePageIndex + 1} of ${pageCount}`,
      pageCount,
      safePageIndex,
      renderPageIndex: safePageIndex,
      rotation: item.rotation ?? 0
    };
  }

  return {
    label: 'Page 1 of 1',
    pageCount: 1,
    safePageIndex: 0,
    renderPageIndex: 0,
    rotation: item.rotation ?? 0
  };
}

function PreviewModal({
  open,
  item,
  imageUrl,
  isLoading,
  previewPageIndex,
  canGoPrev,
  canGoNext,
  canGoPrevPage,
  canGoNextPage,
  onClose,
  onPrev,
  onNext,
  onPrevPage,
  onNextPage
}) {
  if (!open || !item) return null;

  const pageInfo = getPreviewPageInfo(item, previewPageIndex);
  const canGoPrevPreview = canGoPrevPage || canGoPrev;
  const canGoNextPreview = canGoNextPage || canGoNext;
  const usesRenderedRotation = item.type === 'pdf' || item.type === 'pdf-page' || item.type === 'pdf-group';

  return (
    <PagePreviewModal
      open={open}
      titleId="merge-preview-title"
      pageLabel={pageInfo.label}
      imageUrl={imageUrl}
      isLoading={isLoading}
      rotation={usesRenderedRotation ? 0 : pageInfo.rotation}
      canGoPrev={canGoPrevPreview}
      canGoNext={canGoNextPreview}
      onClose={onClose}
      onPrev={canGoPrevPage ? onPrevPage : onPrev}
      onNext={canGoNextPage ? onNextPage : onNext}
    />
  );
}

function rotateCanvas(canvas, rotationDegrees) {
  const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
  if (normalizedRotation === 0) {
    return canvas;
  }

  const quarterTurn = normalizedRotation % 180 !== 0;
  const rotatedCanvas = document.createElement('canvas');
  rotatedCanvas.width = quarterTurn ? canvas.height : canvas.width;
  rotatedCanvas.height = quarterTurn ? canvas.width : canvas.height;

  const context = rotatedCanvas.getContext('2d');
  if (!context) {
    return canvas;
  }

  context.save();
  context.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  context.rotate(normalizedRotation * (Math.PI / 180));
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  context.restore();
  return rotatedCanvas;
}

function GroupChangesModal({ open, fileName, message, onSaveEdited, onDiscardChanges }) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="merge-group-confirm-title">
      <div className="confirm-modal simple-confirm-modal merge-group-confirm-modal">
        <div className="confirm-header">
          <h2 id="merge-group-confirm-title" className="confirm-title">Breakdown Changes</h2>
        </div>
        <div className="confirm-body">
          <p className="confirm-text">
            {message || `${fileName} has breakdown changes. Save the edited pages as one group, or restore the original file?`}
          </p>
        </div>
        <div className="confirm-footer">
          <div className="confirm-actions">
            <button type="button" className="confirm-button secondary" onClick={onDiscardChanges}>
              Restore
            </button>
            <button type="button" className="confirm-button primary" onClick={onSaveEdited}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const GRID_PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

export default function MergeFilesPage({ onSessionChange = () => {} }) {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [currentFilePage, setCurrentFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState(20);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const [previewFileId, setPreviewFileId] = useState(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [isPreviewModalLoading, setIsPreviewModalLoading] = useState(false);
  const [groupConfirmAction, setGroupConfirmAction] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState(null);
  const { setItemRef: setFileCardRef, rememberPositions } = useFlipListAnimation(uploadedFiles, file => file.id);

  const imgInputRef = useRef(null);
  const dragItem = useRef(null);
  const previousBlobUrlsRef = useRef([]);
  const maxFileSizeMb = 500;
  const totalFilePages = Math.max(1, Math.ceil(uploadedFiles.length / filePageSize));
  const safeCurrentFilePage = Math.min(currentFilePage, totalFilePages);
  const visibleFileStartIndex = (safeCurrentFilePage - 1) * filePageSize;
  const visibleFileEndIndex = Math.min(visibleFileStartIndex + filePageSize, uploadedFiles.length);
  const visibleUploadedFiles = useMemo(
    () => uploadedFiles.slice(visibleFileStartIndex, visibleFileEndIndex),
    [uploadedFiles, visibleFileEndIndex, visibleFileStartIndex]
  );

  useEffect(() => {
    const currentBlobUrls = uploadedFiles
      .map(file => file.preview)
      .filter(preview => preview?.startsWith('blob:'));

    previousBlobUrlsRef.current
      .filter(url => !currentBlobUrls.includes(url))
      .forEach(url => URL.revokeObjectURL(url));

    previousBlobUrlsRef.current = currentBlobUrls;
  }, [uploadedFiles]);

  useEffect(() => {
    onSessionChange(uploadedFiles.length > 0);
  }, [onSessionChange, uploadedFiles.length]);

  useEffect(() => {
    setCurrentFilePage(prev => Math.min(Math.max(1, prev), totalFilePages));
  }, [totalFilePages]);

  useEffect(() => () => {
    previousBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    onSessionChange(false);
  }, []);

  const activePreviewIndex = previewFileId ? uploadedFiles.findIndex(file => file.id === previewFileId) : -1;
  const activePreviewItem = activePreviewIndex >= 0 ? uploadedFiles[activePreviewIndex] : null;
  const activePreviewPageInfo = getPreviewPageInfo(activePreviewItem, previewPageIndex);
  const selectedFileCount = selectedFileIds.length;
  const allFilesSelected = uploadedFiles.length > 0 && selectedFileCount === uploadedFiles.length;

  useEffect(() => {
    setPreviewPageIndex(0);
  }, [previewFileId]);

  useEffect(() => {
    const validIds = new Set(uploadedFiles.map(file => file.id));
    setSelectedFileIds(prev => {
      const nextSelected = prev.filter(id => validIds.has(id));
      return nextSelected.length === prev.length ? prev : nextSelected;
    });
  }, [uploadedFiles]);

  useEffect(() => {
    if (!activePreviewItem) {
      setPreviewImageUrl('');
      setIsPreviewModalLoading(false);
      return;
    }

    let isCancelled = false;

    const renderPreview = async () => {
      setIsPreviewModalLoading(true);
      let pdfProxy = null;
      let page = null;
      let canvas = null;
      let previewCanvas = null;
      try {
        if (activePreviewItem.type === 'pdf' || activePreviewItem.type === 'pdf-page' || activePreviewItem.type === 'pdf-group') {
          const pageInfo = getPreviewPageInfo(activePreviewItem, previewPageIndex);
          const arrayBuffer = await activePreviewItem.file.arrayBuffer();
          const pdfjsLib = getPdfJsLib();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          pdfProxy = await loadingTask.promise;
          const pageNumber = pageInfo.renderPageIndex + 1;
          page = await pdfProxy.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.8 });
          canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          previewCanvas = rotateCanvas(canvas, pageInfo.rotation ?? 0);
          if (isGrayscale) {
            applyCanvasGrayscale(previewCanvas);
          }
          if (!isCancelled) {
            setPreviewImageUrl(previewCanvas.toDataURL('image/jpeg', 0.92));
          }
          return;
        }

        if (!isCancelled) {
          setPreviewImageUrl(activePreviewItem.preview || '');
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          setPreviewImageUrl(activePreviewItem.preview || '');
        }
      } finally {
        page?.cleanup();
        clearCanvas(canvas);
        if (previewCanvas && previewCanvas !== canvas) {
          clearCanvas(previewCanvas);
        }
        if (pdfProxy) {
          await pdfProxy.destroy();
        }
        if (!isCancelled) {
          setIsPreviewModalLoading(false);
        }
      }
    };

    renderPreview();

    return () => {
      isCancelled = true;
    };
  }, [activePreviewItem, previewPageIndex, isGrayscale]);

  async function renderPdfPageThumbnail(pdfProxy, pageNumber, scale = 0.5) {
    const canvas = document.createElement('canvas');
    let page = null;

    try {
      page = await pdfProxy.getPage(pageNumber);
      const sizeViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return {
        preview: canvas.toDataURL('image/jpeg', 0.8),
        width: sizeViewport.width,
        height: sizeViewport.height
      };
    } finally {
      page?.cleanup();
      clearCanvas(canvas);
    }
  }

  async function generatePdfThumbnail(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = getPdfJsLib();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfProxy = await loadingTask.promise;
    try {
      const thumbnail = await renderPdfPageThumbnail(pdfProxy, 1);
      return {
        ...thumbnail,
        pageCount: pdfProxy.numPages || 1
      };
    } finally {
      await pdfProxy.destroy();
    }
  }

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const rejectedFiles = [];

    const validFiles = files.filter(file => {
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        rejectedFiles.push(`${file.name}: exceeds ${maxFileSizeMb}MB`);
        return false;
      }
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf && !isSupportedImageLikeFile(file)) {
        rejectedFiles.push(`${file.name}: unsupported file type`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) {
      setStatus({
        tone: 'error',
        title: 'No supported files added',
        detail: rejectedFiles.length ? rejectedFiles.join('; ') : 'Use PDF, JPG, PNG, or HEIC files.'
      });
      event.target.value = '';
      return;
    }

    const nextFiles = await Promise.all(
      validFiles.map(async file => {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const sourceFile = file;
        const normalizedFile = isPdf ? file : await normalizeMediaFile(file);
        let preview = '';
        let width = 1;
        let height = 1;
        let pageCount = 1;
        if (isPdf) {
          try {
            const pdfPreview = await generatePdfThumbnail(file);
            preview = pdfPreview.preview;
            width = pdfPreview.width;
            height = pdfPreview.height;
            pageCount = pdfPreview.pageCount;
          } catch (error) {
            console.error(error);
          }
        } else {
          preview = URL.createObjectURL(normalizedFile);
          try {
            const imageBitmap = await createImageBitmap(normalizedFile);
            width = imageBitmap.width;
            height = imageBitmap.height;
            imageBitmap.close();
          } catch (error) {
            console.error(error);
          }
        }

        return {
          file: normalizedFile,
          sourceName: sourceFile.name,
          id: crypto.randomUUID(),
          preview,
          type: isPdf ? 'pdf' : 'image',
          rotation: 0,
          width,
          height,
          pageCount
        };
      })
    );

    setUploadedFiles(prev => [...prev, ...nextFiles]);
    setStatus({
      tone: rejectedFiles.length ? 'info' : 'success',
      title: rejectedFiles.length ? 'Files added with warnings' : 'Files added',
      detail: `${nextFiles.length} file${nextFiles.length === 1 ? '' : 's'} ready to merge${rejectedFiles.length ? `. Skipped: ${rejectedFiles.join('; ')}.` : '.'}`
    });
    event.target.value = '';
  }

  function removeFile(id) {
    if (previewFileId === id) {
      setPreviewFileId(null);
    }
    rememberPositions();
    setSelectedFileIds(prev => prev.filter(fileId => fileId !== id));
    setUploadedFiles(prev => {
      const target = prev.find(file => file.id === id);
      if (target?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter(file => file.id !== id);
    });
  }

  function toggleFileSelection(id) {
    setSelectedFileIds(prev => (
      prev.includes(id) ? prev.filter(fileId => fileId !== id) : [...prev, id]
    ));
  }

  function toggleAllFilesSelection() {
    setSelectedFileIds(allFilesSelected ? [] : uploadedFiles.map(file => file.id));
  }

  function removeSelectedFiles() {
    if (selectedFileIds.length === 0) return;

    const selectedIds = new Set(selectedFileIds);
    if (previewFileId && selectedIds.has(previewFileId)) {
      setPreviewFileId(null);
    }

    rememberPositions();
    setUploadedFiles(prev => {
      prev.forEach(file => {
        if (selectedIds.has(file.id) && file.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(file.preview);
        }
      });
      return prev.filter(file => !selectedIds.has(file.id));
    });
    setSelectedFileIds([]);
  }

  function rotateFile(id) {
    setUploadedFiles(prev => prev.map(item => (
      item.id === id ? { ...item, rotation: (item.rotation ?? 0) + 90 } : item
    )));
  }

  function rotateSelectedFiles() {
    if (selectedFileIds.length === 0) return;
    const selectedIds = new Set(selectedFileIds);
    setUploadedFiles(prev => prev.map(item => (
      selectedIds.has(item.id) ? { ...item, rotation: (item.rotation ?? 0) + 90 } : item
    )));
  }

  function reorderFiles(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex === null || toIndex === null) return;

    rememberPositions();
    setUploadedFiles(prev => {
      const nextFiles = [...prev];
      const [movedFile] = nextFiles.splice(fromIndex, 1);
      nextFiles.splice(toIndex, 0, movedFile);
      return nextFiles;
    });
  }

  function handleDragStart(event, index) {
    dragItem.current = index;
    setDraggedIndex(index);
    setDropTargetIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    useCardDragImage(event);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    if (dragItem.current === null || dragItem.current === index) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const isBeforeMidpoint = event.clientY < bounds.top + bounds.height / 2;
    const nextIndex = isBeforeMidpoint ? index : index + 1;
    setDropTargetIndex(Math.min(nextIndex, uploadedFiles.length));

    const adjustedIndex = dragItem.current < nextIndex ? nextIndex - 1 : nextIndex;
    if (adjustedIndex === dragItem.current) return;

    reorderFiles(dragItem.current, adjustedIndex);
    dragItem.current = adjustedIndex;
    setDraggedIndex(adjustedIndex);
  }

  function handleDrop(event) {
    event.preventDefault();
    handleDragEnd();
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDropTargetIndex(null);
    dragItem.current = null;
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

  function getFirstGroupPage(file) {
    return file?.type === 'pdf-group' ? file.pages?.[0] : null;
  }

  function getCardRotation(file) {
    const firstGroupPage = getFirstGroupPage(file);
    return (file.rotation ?? 0) + (firstGroupPage?.rotation ?? 0);
  }

  function getCardWidth(file) {
    return getFirstGroupPage(file)?.width ?? file.width;
  }

  function getCardHeight(file) {
    return getFirstGroupPage(file)?.height ?? file.height;
  }

  function getCardPreview(file) {
    return getFirstGroupPage(file)?.preview ?? file.preview;
  }

  function getEffectiveRotation(file) {
    return ((getCardRotation(file) % 360) + 360) % 360;
  }

  function isPortrait(file) {
    const effectiveRotation = getEffectiveRotation(file);
    const quarterTurn = effectiveRotation % 180 !== 0;
    const sourceWidth = getCardWidth(file) ?? 1;
    const sourceHeight = getCardHeight(file) ?? 1;
    const width = quarterTurn ? sourceHeight : sourceWidth;
    const height = quarterTurn ? sourceWidth : sourceHeight;
    return height >= width;
  }

  function isSourcePortrait(file) {
    return (getCardHeight(file) ?? 1) >= (getCardWidth(file) ?? 1);
  }

  function canBreakdownFile(file) {
    return (file.type === 'pdf' || file.type === 'pdf-group') && (Number(file.pageCount) || 1) > 1;
  }

  function canGroupBackPages(file) {
    return file?.type === 'pdf-page';
  }

  function formatPageCount(file) {
    if (file.type === 'pdf-page') {
      const pageNumber = (file.pageIndex ?? 0) + 1;
      const sourcePageCount = Math.max(pageNumber, Number(file.sourcePageCount) || Number(file.pageCount) || pageNumber);
      return `Page ${pageNumber} of ${sourcePageCount}`;
    }

    const pageCount = Math.max(1, Number(file.pageCount) || 1);
    return `${pageCount} ${pageCount === 1 ? 'Page' : 'Pages'}`;
  }

  function getBreakdownGroupState(id) {
    const targetPage = uploadedFiles.find(file => file.id === id);
    if (!canGroupBackPages(targetPage)) return null;

    const sourceFileId = targetPage.sourceFileId;
    const sourcePageCount = Math.max(1, Number(targetPage.sourcePageCount) || 1);
    const sourcePages = uploadedFiles.filter(file => file.type === 'pdf-page' && file.sourceFileId === sourceFileId);
    const pagePositions = sourcePages
      .map(file => ({ file, index: uploadedFiles.findIndex(item => item.id === file.id) }))
      .filter(entry => entry.index >= 0)
      .sort((a, b) => a.index - b.index);

    const hasAllPages = sourcePages.length === sourcePageCount &&
      Array.from({ length: sourcePageCount }, (_, pageIndex) => (
        sourcePages.some(file => file.pageIndex === pageIndex)
      )).every(Boolean);
    const isStillOriginalOrder = pagePositions.length > 0 && pagePositions.every((entry, index) => (
      entry.index === pagePositions[0].index + index && entry.file.pageIndex === index
    ));
    const hasOriginalRotation = pagePositions.every(entry => (
      (entry.file.rotation ?? 0) === (entry.file.sourceRotation ?? 0)
    ));
    const changeReasons = [
      !hasAllPages ? 'some pages were removed' : '',
      !isStillOriginalOrder ? 'pages were reordered or separated' : '',
      !hasOriginalRotation ? 'some pages were rotated' : ''
    ].filter(Boolean);

    return {
      targetId: id,
      targetPage,
      sourceFileId,
      sourcePageCount,
      sourcePages,
      pagePositions,
      hasChanges: changeReasons.length > 0,
      message: changeReasons.length
        ? `${targetPage.file.name} has changes: ${changeReasons.join(', ')}. Save the edited pages as one group, or restore the original file?`
        : ''
    };
  }

  function restoreOriginalGroup(state) {
    if (!state?.sourcePages?.length) return;

    if (state.sourcePages.some(file => file.id === previewFileId)) {
      setPreviewFileId(null);
    }

    const firstPage = state.pagePositions[0]?.file ?? state.sourcePages[0];
    const restoredFile = {
      file: firstPage.file,
      id: crypto.randomUUID(),
      preview: firstPage.sourcePreview || firstPage.preview,
      type: 'pdf',
      rotation: firstPage.sourceRotation ?? 0,
      width: firstPage.sourceWidth ?? firstPage.width,
      height: firstPage.sourceHeight ?? firstPage.height,
      pageCount: state.sourcePageCount
    };
    const sourcePageIds = new Set(state.sourcePages.map(file => file.id));

    setUploadedFiles(prev => {
      const firstIndex = prev.findIndex(file => sourcePageIds.has(file.id));
      if (firstIndex < 0) return prev;

      const nextFiles = [];
      prev.forEach((file, index) => {
        if (index === firstIndex) {
          nextFiles.push(restoredFile);
        }
        if (!sourcePageIds.has(file.id)) {
          nextFiles.push(file);
        }
      });
      return nextFiles;
    });
  }

  function saveEditedGroup(state) {
    if (!state?.pagePositions?.length) return;

    if (state.sourcePages.some(file => file.id === previewFileId)) {
      setPreviewFileId(null);
    }

    const firstPage = state.pagePositions[0].file;
    const groupedPages = state.pagePositions.map(entry => ({
      file: entry.file.file,
      preview: entry.file.preview,
      type: 'pdf-page',
      rotation: entry.file.rotation ?? 0,
      width: entry.file.width,
      height: entry.file.height,
      pageCount: 1,
      pageIndex: entry.file.pageIndex,
      sourcePageCount: entry.file.sourcePageCount,
      sourceFileId: entry.file.sourceFileId,
      sourcePreview: entry.file.sourcePreview,
      sourceWidth: entry.file.sourceWidth,
      sourceHeight: entry.file.sourceHeight,
      sourceRotation: entry.file.sourceRotation ?? 0
    }));
    const editedGroup = {
      file: firstPage.file,
      id: crypto.randomUUID(),
      preview: firstPage.preview,
      type: 'pdf-group',
      rotation: 0,
      width: firstPage.width,
      height: firstPage.height,
      pageCount: groupedPages.length,
      pages: groupedPages,
      sourceFileId: firstPage.sourceFileId,
      sourcePageCount: firstPage.sourcePageCount,
      sourcePreview: firstPage.sourcePreview,
      sourceWidth: firstPage.sourceWidth,
      sourceHeight: firstPage.sourceHeight
    };
    const sourcePageIds = new Set(state.sourcePages.map(file => file.id));

    setUploadedFiles(prev => {
      const firstIndex = prev.findIndex(file => sourcePageIds.has(file.id));
      if (firstIndex < 0) return prev;

      const nextFiles = [];
      prev.forEach((file, index) => {
        if (index === firstIndex) {
          nextFiles.push(editedGroup);
        }
        if (!sourcePageIds.has(file.id)) {
          nextFiles.push(file);
        }
      });
      return nextFiles;
    });
  }

  async function breakdownFile(id) {
    const targetIndex = uploadedFiles.findIndex(file => file.id === id);
    const targetFile = uploadedFiles[targetIndex];
    if (targetIndex < 0 || !canBreakdownFile(targetFile)) return;

    if (targetFile.type === 'pdf-group') {
      const pageItems = (targetFile.pages ?? []).map(page => ({
        ...page,
        id: crypto.randomUUID(),
        type: 'pdf-page',
        pageCount: 1,
        sourceFileId: page.sourceFileId ?? targetFile.sourceFileId ?? targetFile.id,
        sourcePageCount: page.sourcePageCount ?? targetFile.sourcePageCount ?? targetFile.pageCount,
        sourcePreview: page.sourcePreview ?? targetFile.sourcePreview ?? targetFile.preview,
        sourceWidth: page.sourceWidth ?? targetFile.sourceWidth ?? targetFile.width,
        sourceHeight: page.sourceHeight ?? targetFile.sourceHeight ?? targetFile.height,
        sourceRotation: page.sourceRotation ?? 0
      }));

      setUploadedFiles(prev => {
        const currentIndex = prev.findIndex(file => file.id === id);
        if (currentIndex < 0) return prev;
        const nextFiles = [...prev];
        nextFiles.splice(currentIndex, 1, ...pageItems);
        return nextFiles;
      });
      return;
    }

    setIsProcessing(true);
    setLoadingProgress({ current: 0, total: targetFile.pageCount });
    let pdfProxy = null;

    try {
      const arrayBuffer = await targetFile.file.arrayBuffer();
      const pdfjsLib = getPdfJsLib();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      pdfProxy = await loadingTask.promise;
      const pageCount = pdfProxy.numPages || targetFile.pageCount;
      const pageItems = [];

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        setLoadingProgress({ current: pageIndex + 1, total: pageCount });
        const thumbnail = await renderPdfPageThumbnail(pdfProxy, pageIndex + 1);
        pageItems.push({
          file: targetFile.file,
          id: crypto.randomUUID(),
          preview: thumbnail.preview,
          type: 'pdf-page',
          rotation: targetFile.rotation ?? 0,
          width: thumbnail.width,
          height: thumbnail.height,
          pageCount: 1,
          pageIndex,
          sourcePageCount: pageCount,
          sourceFileId: targetFile.sourceFileId ?? targetFile.id,
          sourcePreview: targetFile.preview,
          sourceWidth: targetFile.width,
          sourceHeight: targetFile.height,
          sourceRotation: targetFile.rotation ?? 0
        });
      }

      if (previewFileId === id) {
        setPreviewFileId(null);
      }

      setUploadedFiles(prev => {
        const currentIndex = prev.findIndex(file => file.id === id);
        if (currentIndex < 0) return prev;
        const nextFiles = [...prev];
        nextFiles.splice(currentIndex, 1, ...pageItems);
        return nextFiles;
      });
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Breakdown failed',
        detail: 'The selected PDF pages could not be prepared.'
      });
    } finally {
      if (pdfProxy) {
        await pdfProxy.destroy();
      }
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  function groupBackPages(id) {
    const state = getBreakdownGroupState(id);
    if (!state) return;

    if (state.hasChanges) {
      setGroupConfirmAction({
        targetId: id,
        fileName: state.targetPage.file.name,
        message: `${state.targetPage.file.name} has breakdown changes. Save the edited pages as one group, or restore the original file?`
      });
      return;
    }

    restoreOriginalGroup(state);
  }

  async function convertAndMergeFiles() {
    if (uploadedFiles.length === 0) return;
    const saveTarget = await requestPdfSaveTarget('Merged_Document');
    if (!saveTarget) return;

    setIsProcessing(true);

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      let pageNumber = 1;

      async function openPdfProxy(file) {
        const pdfjsLib = getPdfJsLib();
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        return loadingTask.promise;
      }

      async function addRenderedPdfPage(pdfProxy, sourcePageIndex, rotation = 0) {
        let page = null;
        let canvas = null;
        let outputCanvas = null;
        try {
          page = await pdfProxy.getPage(sourcePageIndex + 1);
          const renderScale = 2;
          const renderViewport = page.getViewport({ scale: renderScale });
          canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is not supported.');

          canvas.width = Math.max(1, Math.round(renderViewport.width));
          canvas.height = Math.max(1, Math.round(renderViewport.height));
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport: renderViewport }).promise;
          outputCanvas = rotateCanvas(canvas, rotation);
          applyCanvasGrayscale(outputCanvas);

          const imageBytes = await canvasToArrayBuffer(outputCanvas, 'image/jpeg', 0.86);
          const image = await pdfDoc.embedJpg(imageBytes);
          const pageWidth = outputCanvas.width / renderScale;
          const pageHeight = outputCanvas.height / renderScale;
          const outputPage = pdfDoc.addPage([pageWidth, pageHeight]);
          outputPage.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
          outputPage.drawText(String(pageNumber), { x: pageWidth / 2 - 10, y: 20, size: 10, font });
          pageNumber += 1;
        } finally {
          page?.cleanup();
          clearCanvas(canvas);
          if (outputCanvas && outputCanvas !== canvas) {
            clearCanvas(outputCanvas);
          }
        }
      }

      async function addRenderedPdfPages(item, pageEntries) {
        if (!pageEntries.length) return;

        const pdfProxy = await openPdfProxy(item.file);
        try {
          for (const entry of pageEntries) {
            await addRenderedPdfPage(pdfProxy, entry.pageIndex, entry.rotation);
          }
        } finally {
          await pdfProxy.destroy();
        }
      }

      for (let idx = 0; idx < uploadedFiles.length; idx += 1) {
        setLoadingProgress({ current: idx + 1, total: uploadedFiles.length });
        const item = uploadedFiles[idx];

        if (item.type === 'pdf-group') {
          if (isGrayscale) {
            const groupPages = item.pages ?? [];
            await addRenderedPdfPages(item, groupPages.map(sourcePage => ({
              pageIndex: sourcePage.pageIndex ?? 0,
              rotation: ((sourcePage.rotation ?? 0) + (item.rotation ?? 0)) % 360
            })));
            continue;
          }

          const arrayBuffer = await item.file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(arrayBuffer);
          const groupPages = item.pages ?? [];
          const copiedPages = await pdfDoc.copyPages(sourcePdf, groupPages.map(page => page.pageIndex ?? 0));
          copiedPages.forEach((page, copiedIndex) => {
            const sourcePage = groupPages[copiedIndex] ?? {};
            const rotation = (sourcePage.rotation ?? 0) + (item.rotation ?? 0);
            if (rotation) {
              page.setRotation(degrees((((page.getRotation().angle ?? 0) + rotation) % 360 + 360) % 360));
            }
            pdfDoc.addPage(page);
            const { width } = page.getSize();
            page.drawText(String(pageNumber), { x: width / 2 - 10, y: 20, size: 10, font });
            pageNumber += 1;
          });
          continue;
        }

        if (item.type === 'pdf' || item.type === 'pdf-page') {
          if (isGrayscale) {
            if (item.type === 'pdf-page') {
              await addRenderedPdfPages(item, [{
                pageIndex: item.pageIndex ?? 0,
                rotation: getEffectiveRotation(item)
              }]);
            } else {
              const pageCount = item.pageCount || 1;
              await addRenderedPdfPages(
                item,
                Array.from({ length: pageCount }, (_, pageIndex) => ({
                  pageIndex,
                  rotation: getEffectiveRotation(item)
                }))
              );
            }
            continue;
          }

          const arrayBuffer = await item.file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(arrayBuffer);
          const pageIndices = item.type === 'pdf-page'
            ? [item.pageIndex ?? 0]
            : sourcePdf.getPageIndices();
          const copiedPages = await pdfDoc.copyPages(sourcePdf, pageIndices);
          copiedPages.forEach(page => {
            if (item.rotation) {
              page.setRotation(degrees((((page.getRotation().angle ?? 0) + getEffectiveRotation(item)) % 360 + 360) % 360));
            }
            pdfDoc.addPage(page);
            const { width } = page.getSize();
            page.drawText(String(pageNumber), { x: width / 2 - 10, y: 20, size: 10, font });
            pageNumber += 1;
          });
        } else {
          const normalizedRotation = ((item.rotation ?? 0) % 360 + 360) % 360;
          const processed = await preprocessImageForPdf(item.file, normalizedRotation, { grayscale: isGrayscale });
          const embeddedImage = await pdfDoc.embedJpg(processed.bytes);

          const isLandscape = processed.pixelWidth > processed.pixelHeight;
          const pageSize = isLandscape ? { width: 841.89, height: 595.28 } : { width: 595.28, height: 841.89 };
          const page = pdfDoc.addPage([pageSize.width, pageSize.height]);

          const margin = 36; // 0.5 inch
          const maxWidth = pageSize.width - margin * 2;
          const maxHeight = pageSize.height - margin * 2;
          const scale = Math.min(maxWidth / processed.pixelWidth, maxHeight / processed.pixelHeight);
          const drawWidth = processed.pixelWidth * scale;
          const drawHeight = processed.pixelHeight * scale;
          const x = (pageSize.width - drawWidth) / 2;
          const y = (pageSize.height - drawHeight) / 2;

          page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });
          page.drawText(String(pageNumber), { x: pageSize.width / 2 - 10, y: 20, size: 10, font });
          pageNumber += 1;
        }
      }

      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        compress: true
      });
      await saveTarget.save(new Blob([pdfBytes], { type: 'application/pdf' }));
      setStatus({
        tone: 'success',
        title: 'Merged PDF saved',
        detail: `${saveTarget.name} saved.`
      });
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Merge failed',
        detail: error.message || 'The selected files could not be merged.'
      });
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  function handleSaveEditedGroup() {
    const state = groupConfirmAction?.targetId ? getBreakdownGroupState(groupConfirmAction.targetId) : null;
    if (state) {
      saveEditedGroup(state);
    }
    setGroupConfirmAction(null);
  }

  function handleDiscardGroupChanges() {
    const state = groupConfirmAction?.targetId ? getBreakdownGroupState(groupConfirmAction.targetId) : null;
    if (state) {
      restoreOriginalGroup(state);
    }
    setGroupConfirmAction(null);
  }

  return (
    <>
      <section
        className={isFileDropActive ? 'panel merge-main-panel file-drop-active' : 'panel merge-main-panel'}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
        <div className="toolbar merge-main-toolbar">
          <div>
            <h2 className="brand-title merge-title">File Merger & Converter</h2>
            <p className="brand-subtitle">Combine images and PDFs into a single PDF</p>
          </div>
          <div className="merge-actions">
            <button className="secondary-button" onClick={() => imgInputRef.current?.click()}>
              <PlusCircle size={16} />
              Add Files
            </button>
            <button
              type="button"
              className={isGrayscale ? 'pdf-filter-button active' : 'pdf-filter-button'}
              onClick={() => setIsGrayscale(prev => !prev)}
            >
              <Palette size={16} />
              {isGrayscale ? 'B&W ON' : 'COLOR'}
            </button>
            {uploadedFiles.length > 0 && (
              <button className="primary-button" onClick={convertAndMergeFiles}>
                <FileCheck size={16} />
                Merge & Download
              </button>
            )}
          </div>
        </div>

        <input ref={imgInputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/jpg,image/heic,.heic,application/pdf,.pdf" onChange={handleFileUpload} />
        <StatusBanner status={status} />

        {uploadedFiles.length === 0 ? (
          <button type="button" className="dropzone merge-empty-dropzone" onClick={() => imgInputRef.current?.click()}>
            <Files size={56} />
            <span className="field-value">No files added yet</span>
            <span className="muted">Drop PDF or image files here to start merging.</span>
          </button>
        ) : (
          <>
            <div className="toolbar merge-selection-toolbar">
              <div className="page-actions merge-selection-actions">
                <button type="button" className="ghost-button" onClick={toggleAllFilesSelection}>
                  <CheckSquare size={16} />
                  {allFilesSelected ? 'Deselect' : 'Select All'}
                </button>
                {selectedFileCount > 0 && (
                  <>
                    <button type="button" className="ghost-button" onClick={rotateSelectedFiles}>
                      <RotateCw size={16} />
                      Rotate ({selectedFileCount})
                    </button>
                    <button type="button" className="danger-button" onClick={removeSelectedFiles}>
                      <Trash2 size={16} />
                      Remove ({selectedFileCount})
                    </button>
                  </>
                )}
              </div>
              {selectedFileCount > 0 && (
                <span className="merge-selection-summary">{selectedFileCount} selected</span>
              )}
            </div>

            <PaginationControls
              totalItems={uploadedFiles.length}
              pageSize={filePageSize}
              currentPage={safeCurrentFilePage}
              onPageChange={setCurrentFilePage}
              itemLabel="Files"
              pageSizeOptions={GRID_PAGE_SIZE_OPTIONS}
              onPageSizeChange={nextSize => {
                setFilePageSize(nextSize);
                setCurrentFilePage(1);
              }}
            />
            <section className="page-grid merge-file-grid">
              {visibleUploadedFiles.map((file, localIndex) => {
                const index = visibleFileStartIndex + localIndex;
                const isSelected = selectedFileIds.includes(file.id);
                return (
              <article
                key={file.id}
                ref={element => setFileCardRef(file.id, element)}
                className={[
                  'page-card',
                  isSelected ? 'selected' : '',
                  isPortrait(file) ? 'portrait-card' : 'landscape-card',
                  draggedIndex === index ? 'dragging' : '',
                  dropTargetIndex === index ? 'drop-target-before' : '',
                  dropTargetIndex === uploadedFiles.length && index === uploadedFiles.length - 1 ? 'drop-target-after' : ''
                ].filter(Boolean).join(' ')}
                draggable
                onDragStart={event => handleDragStart(event, index)}
                onDragOver={event => handleDragOver(event, index)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              >
                <button
                  type="button"
                  className="page-checkbox"
                  aria-label={isSelected ? `Deselect ${file.file.name}` : `Select ${file.file.name}`}
                  aria-pressed={isSelected}
                  onClick={() => toggleFileSelection(file.id)}
                >
                  {isSelected && <Check size={18} />}
                </button>
                <div className="page-preview" onClick={() => toggleFileSelection(file.id)}>
                  {getCardPreview(file) ? (
                    <div
                      className={[
                        'page-preview-frame',
                        isSourcePortrait(file) ? 'source-portrait' : 'source-landscape',
                        isGrayscale ? 'grayscale' : ''
                      ].filter(Boolean).join(' ')}
                      style={{ transform: `rotate(${getCardRotation(file)}deg)` }}
                    >
                      <img src={getCardPreview(file)} alt={file.file.name} />
                    </div>
                  ) : (
                    <div className={`page-preview-placeholder ${isSourcePortrait(file) ? 'source-portrait' : 'source-landscape'}`}>
                      <div className="preview-skeleton" />
                      <span>Preview is not available</span>
                    </div>
                  )}
                  <div className="page-count-badge">{formatPageCount(file)}</div>
                  <div className="page-badge">#{index + 1}</div>
                  <div className="orientation-badge">{isPortrait(file) ? 'Portrait' : 'Landscape'}</div>
                  <div className="rotation-badge">{getEffectiveRotation(file)}&deg;</div>
                </div>
                <div className={canBreakdownFile(file) || canGroupBackPages(file) ? 'page-footer merge-page-footer four-actions' : 'page-footer merge-page-footer'}>
                  <button className="ghost-button" onClick={() => setPreviewFileId(file.id)}>
                    <Eye size={16} />
                    Preview
                  </button>
                  {canBreakdownFile(file) && (
                    <button className="ghost-button" onClick={() => breakdownFile(file.id)} title="Break PDF into page cards">
                      <Ungroup size={16} />
                      Breakdown
                    </button>
                  )}
                  {canGroupBackPages(file) && (
                    <button className="ghost-button" onClick={() => groupBackPages(file.id)} title="Group pages back into one file">
                      <FileStack size={16} />
                      Group
                    </button>
                  )}
                  <button className="ghost-button" onClick={() => rotateFile(file.id)} title="Rotate 90 degrees">
                    <RotateCw size={16} />
                    Rotate
                  </button>
                  <button className="danger-button" onClick={() => removeFile(file.id)}>
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              </article>
                );
              })}
            </section>
          </>
        )}
      </section>

      <PreviewModal
        open={Boolean(activePreviewItem)}
        item={activePreviewItem}
        imageUrl={previewImageUrl}
        isLoading={isPreviewModalLoading}
        previewPageIndex={previewPageIndex}
        canGoPrev={activePreviewIndex > 0}
        canGoNext={activePreviewIndex >= 0 && activePreviewIndex < uploadedFiles.length - 1}
        canGoPrevPage={previewPageIndex > 0}
        canGoNextPage={previewPageIndex < activePreviewPageInfo.pageCount - 1}
        onClose={() => setPreviewFileId(null)}
        onPrev={() => {
          if (activePreviewIndex > 0) {
            setPreviewFileId(uploadedFiles[activePreviewIndex - 1].id);
          }
        }}
        onNext={() => {
          if (activePreviewIndex >= 0 && activePreviewIndex < uploadedFiles.length - 1) {
            setPreviewFileId(uploadedFiles[activePreviewIndex + 1].id);
          }
        }}
        onPrevPage={() => setPreviewPageIndex(current => Math.max(0, current - 1))}
        onNextPage={() => setPreviewPageIndex(current => Math.min(activePreviewPageInfo.pageCount - 1, current + 1))}
      />
      <GroupChangesModal
        open={Boolean(groupConfirmAction)}
        fileName={groupConfirmAction?.fileName}
        message={groupConfirmAction?.message}
        onSaveEdited={handleSaveEditedGroup}
        onDiscardChanges={handleDiscardGroupChanges}
      />
      {isProcessing && <ProcessingOverlay loadingProgress={loadingProgress} />}
    </>
  );
}
