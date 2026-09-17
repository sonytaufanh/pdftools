import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import PaginationControls from '../components/PaginationControls';
import PagePreviewModal from '../components/PagePreviewModal';
import CardMoveControls from '../components/CardMoveControls';
import ModalOverlay from '../components/ModalOverlay';
import ProcessingOverlay from '../components/ProcessingOverlay';
import StatusBanner from '../components/StatusBanner';
import {
  applyCanvasGrayscale,
  canvasToArrayBuffer,
  canvasToBlob,
  clearCanvas,
  rotateCanvas
} from '../lib/canvas';
import { destroyPdfProxy, getPdfJsLib } from '../lib/pdfjs';
import { moveItem } from '../lib/listReorder';
import { isRenderCancelled, renderPageWithCancellation } from '../lib/pdfRender';
import { clearSession, loadSession, saveSession } from '../lib/sessionStore';
import { useBeforeUnload } from '../lib/useBeforeUnload';
import { useFlipListAnimation } from '../lib/useFlipListAnimation';
import { applyCardDragImage } from '../lib/dragImage';
import { getDroppedFiles, hasDraggedFiles } from '../lib/dropFiles';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  CheckSquare,
  Download,
  Eye,
  FilePlus,
  FileText,
  Info,
  Palette,
  RotateCw,
  Scissors,
  Trash2,
  Upload,
  X
} from 'lucide-react';

const WATERMARK_FONT_OPTIONS = [
  {
    value: 'helvetica',
    label: 'Helvetica',
    canvas: 'Helvetica, Arial, sans-serif',
    pdf: StandardFonts.Helvetica
  },
  {
    value: 'helveticaBold',
    label: 'Helvetica Bold',
    canvas: 'Helvetica, Arial, sans-serif',
    pdf: StandardFonts.HelveticaBold
  },
  {
    value: 'timesRoman',
    label: 'Times Roman',
    canvas: '"Times New Roman", Georgia, serif',
    pdf: StandardFonts.TimesRoman
  },
  {
    value: 'timesBold',
    label: 'Times Bold',
    canvas: '"Times New Roman", Georgia, serif',
    pdf: StandardFonts.TimesRomanBold
  },
  {
    value: 'courierBold',
    label: 'Courier Bold',
    canvas: '"Courier New", monospace',
    pdf: StandardFonts.CourierBold
  }
];

const DEFAULT_WATERMARK_SETTINGS = {
  enabled: false,
  type: 'text',
  text: '',
  font: 'helveticaBold',
  size: 18,
  color: '#0f172a',
  position: 'center',
  imageDataUrl: '',
  imageName: ''
};

const WATERMARK_SIZE_LIMITS = {
  text: { min: 1, max: 36 },
  image: { min: 1, max: 48 }
};

const WATERMARK_POSITION_OPTIONS = [
  { value: 'center', label: 'Tengah' },
  { value: 'top', label: 'Atas' },
  { value: 'bottom', label: 'Bawah' },
  { value: 'top-left', label: 'Kiri atas' },
  { value: 'top-right', label: 'Kanan atas' },
  { value: 'bottom-left', label: 'Kiri bawah' },
  { value: 'bottom-right', label: 'Kanan bawah' }
];

function getWatermarkFontOption(value) {
  return WATERMARK_FONT_OPTIONS.find(option => option.value === value) ?? WATERMARK_FONT_OPTIONS[1];
}

function hasActiveWatermark(settings) {
  if (!settings) return false;
  if (!settings.enabled) return false;
  return settings.type === 'image' ? Boolean(settings.imageDataUrl) : Boolean(settings.text.trim());
}

function getWatermarkSignature(settings) {
  if (!hasActiveWatermark(settings)) return 'none';
  return settings.type === 'image'
    ? `image|${settings.size}|${settings.position}|${settings.imageName}|${settings.imageDataUrl.slice(0, 64)}|${settings.imageDataUrl.length}`
    : `text|${settings.text.trim()}|${settings.font}|${settings.size}|${settings.color}|${settings.position}`;
}

function getWatermarkAnchor(width, height, position = 'center') {
  const insetX = width * 0.16;
  const insetY = height * 0.16;
  const [vertical, horizontal] = position === 'center' ? ['middle', 'center'] : position.split('-');

  const x = horizontal === 'left' ? insetX : horizontal === 'right' ? width - insetX : width / 2;
  const y = vertical === 'top' ? height - insetY : vertical === 'bottom' ? insetY : height / 2;

  return { x, y };
}

function rotatePoint(x, y, degreesValue) {
  const radians = degreesValue * (Math.PI / 180);
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians)
  };
}

function getWatermarkTextAngle(width, height) {
  return width > height ? 0 : -45;
}

function getPdfWatermarkTextAngle(width, height) {
  const canvasAngle = getWatermarkTextAngle(width, height);
  return canvasAngle === 0 ? 0 : Math.abs(canvasAngle);
}

function getWatermarkSizeLimits(type) {
  return WATERMARK_SIZE_LIMITS[type] ?? WATERMARK_SIZE_LIMITS.text;
}

function clampWatermarkSize(value, type = 'text', fallback = DEFAULT_WATERMARK_SETTINGS.size) {
  const limits = getWatermarkSizeLimits(type);
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(numericValue)));
}

function hexToRgbColor(hexColor) {
  const normalized = hexColor.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map(char => `${char}${char}`)
          .join('')
      : normalized;

  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map(toast => {
        const Icon =
          toast.tone === 'error' ? AlertTriangle : toast.tone === 'success' ? CheckCircle2 : Info;
        return (
          <div key={toast.id} className={`toast-card ${toast.tone ?? 'info'}`}>
            <div className="toast-icon">
              <Icon size={16} />
            </div>
            <div className="toast-copy">
              <div className="toast-title">{toast.title}</div>
              {toast.detail && <div className="toast-detail">{toast.detail}</div>}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ActionConfirmModal({
  open,
  tone = 'warning',
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  return (
    <ModalOverlay open={open} onClose={onCancel} labelledBy="action-confirm-title">
      <div className={`confirm-modal simple-confirm-modal action-confirm-modal ${tone}`}>
        <div className="confirm-header">
          <h2 id="action-confirm-title" className="confirm-title">
            {title}
          </h2>
        </div>
        <div className="confirm-body">
          <p className="confirm-text">{message}</p>
        </div>
        <div className="confirm-footer">
          <div className="confirm-actions">
            <button type="button" className="confirm-button secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={`confirm-button ${tone === 'danger' ? 'danger' : 'primary'}`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PageCard({
  page,
  visualIndex,
  selected,
  isGrayscale,
  exportFormat,
  watermarkSignature,
  isDragging,
  isDropTarget,
  onToggleSelection,
  onRotate,
  onDownload,
  onEnsurePreview,
  onPreview,
  onCardRef,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  canMoveBackward,
  canMoveForward,
  onMoveBackward,
  onMoveForward
}) {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const rotationOffset = page.rotationOffset ?? 0;
  const baseWidth = page.pageWidth ?? 1;
  const baseHeight = page.pageHeight ?? 1;
  const sourceIsPortrait = baseHeight >= baseWidth;
  // Use continuous degrees for the CSS transform (0, 90, 180, 270, 360, ...)
  // so the 270 -> 0 transition animates forward (to 360) instead of snapping back.
  const userRotation = ((rotationOffset % 360) + 360) % 360;
  const rotatesAxes = userRotation % 180 !== 0;
  const displayWidth = rotatesAxes ? baseHeight : baseWidth;
  const displayHeight = rotatesAxes ? baseWidth : baseHeight;
  const isPortrait = displayHeight >= displayWidth;
  const frameRotation = rotationOffset;

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    onEnsurePreview(page.index);
  }, [isGrayscale, isVisible, onEnsurePreview, page.index, watermarkSignature]);

  return (
    <article
      ref={element => {
        cardRef.current = element;
        onCardRef(page.index, element);
      }}
      className={[
        'page-card',
        selected ? 'selected' : '',
        isPortrait ? 'portrait-card' : 'landscape-card',
        isDragging ? 'dragging' : '',
        isDropTarget ? 'drop-target-before' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={event => onDragStart(event, page.index)}
      onDragOver={event => onDragOver(event, page.index)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button className="page-checkbox" onClick={() => onToggleSelection(page.index)}>
        {selected && <Check size={18} />}
      </button>
      <div className="page-preview" onClick={() => onToggleSelection(page.index)}>
        {page.previewUrl ? (
          <div
            className={[
              'page-preview-frame',
              sourceIsPortrait ? 'source-portrait' : 'source-landscape',
              isGrayscale ? 'grayscale' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ transform: `rotate(${frameRotation}deg)` }}
          >
            <img src={page.previewUrl} alt={`Halaman ${visualIndex + 1}`} />
          </div>
        ) : (
          <div
            className={`page-preview-placeholder ${sourceIsPortrait ? 'source-portrait' : 'source-landscape'}`}
          >
            <div
              className={page.isPreviewLoading ? 'preview-skeleton loading' : 'preview-skeleton'}
            />
            <span>
              {page.isPreviewLoading
                ? 'Merender pratinjau...'
                : 'Pratinjau dimuat sesuai permintaan'}
            </span>
          </div>
        )}
        <div className="page-badge">#{visualIndex + 1}</div>
        <div className="orientation-badge">{isPortrait ? 'Potret' : 'Lanskap'}</div>
        <div className="rotation-badge">{userRotation}&deg;</div>
        <CardMoveControls
          label={`page ${visualIndex + 1}`}
          canMoveBackward={canMoveBackward}
          canMoveForward={canMoveForward}
          onMoveBackward={onMoveBackward}
          onMoveForward={onMoveForward}
        />
      </div>
      <div className="page-footer">
        <button className="ghost-button" onClick={() => onPreview(page.index)}>
          <Eye size={16} />
          Pratinjau
        </button>
        <button className="ghost-button" onClick={() => onRotate(page.index)}>
          <RotateCw size={16} />
          Putar
        </button>
        <button className="danger-button" onClick={() => onDownload(page)}>
          <Download size={16} />
          {exportFormat.toUpperCase()}
        </button>
      </div>
    </article>
  );
}

const initialRanges = [{ id: 1, start: 1, end: 1 }];
const normalizeRotation = value => ((value % 360) + 360) % 360;
const GRID_PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

export default function PDFToolsPage({ onSessionChange = () => {} }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPages, setSelectedPages] = useState([]);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [watermarkSettings, setWatermarkSettings] = useState(DEFAULT_WATERMARK_SETTINGS);
  const [draftWatermarkColor, setDraftWatermarkColor] = useState(DEFAULT_WATERMARK_SETTINGS.color);
  const [draftWatermarkSize, setDraftWatermarkSize] = useState(
    String(DEFAULT_WATERMARK_SETTINGS.size)
  );
  const [fileName, setFileName] = useState('');
  const [openingFileName, setOpeningFileName] = useState('');
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  const [openingError, setOpeningError] = useState('');
  const [isRangeSplitterEnabled, setIsRangeSplitterEnabled] = useState(false);
  const [ranges, setRanges] = useState(initialRanges);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState(null);
  const [processingState, setProcessingState] = useState({ label: 'Memproses...', detail: '' });
  const [toasts, setToasts] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [isPreviewModalLoading, setIsPreviewModalLoading] = useState(false);
  const [draggedPageIndex, setDraggedPageIndex] = useState(null);
  const [dropTargetPageIndex, setDropTargetPageIndex] = useState(null);
  const [currentPageBatch, setCurrentPageBatch] = useState(1);
  const [pageBatchSize, setPageBatchSize] = useState(20);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const { setItemRef: setPageCardRef, rememberPositions } = useFlipListAnimation(
    pages,
    page => page.index
  );

  useBeforeUnload(Boolean(pdfDoc));

  const fileInputRef = useRef(null);
  const watermarkImageInputRef = useRef(null);
  const pdfProxyRef = useRef(null);
  const sourcePdfRef = useRef(null);
  const pagesRef = useRef([]);
  const dragPageIndexRef = useRef(null);
  const previewAbortRef = useRef(new Map());
  const isHydratedRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const initialPreviewQueuedRef = useRef(false);
  const toastTimeoutsRef = useRef(new Map());
  const watermarkImageAssetRef = useRef({ src: '', promise: null, image: null });
  const maxFileSizeMb = 500;
  const fastOpenThresholdMb = 25;

  const allSelected = useMemo(
    () => pages.length > 0 && selectedPages.length === pages.length,
    [pages.length, selectedPages.length]
  );
  const selectedCount = selectedPages.length;
  const watermarkSignature = useMemo(
    () => getWatermarkSignature(watermarkSettings),
    [watermarkSettings]
  );
  const totalPageBatches = Math.max(1, Math.ceil(pages.length / pageBatchSize));
  const safeCurrentPageBatch = Math.min(currentPageBatch, totalPageBatches);
  const visiblePageStartIndex = (safeCurrentPageBatch - 1) * pageBatchSize;
  const visiblePageEndIndex = Math.min(visiblePageStartIndex + pageBatchSize, pages.length);
  const visiblePages = useMemo(
    () => pages.slice(visiblePageStartIndex, visiblePageEndIndex),
    [pages, visiblePageEndIndex, visiblePageStartIndex]
  );

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    setCurrentPageBatch(prev => Math.min(Math.max(1, prev), totalPageBatches));
  }, [totalPageBatches]);

  useEffect(() => {
    onSessionChange(Boolean(pdfDoc));
  }, [onSessionChange, pdfDoc]);

  useEffect(() => {
    setDraftWatermarkColor(watermarkSettings.color);
  }, [watermarkSettings.color]);

  useEffect(() => {
    setDraftWatermarkSize(String(watermarkSettings.size));
  }, [watermarkSettings.size]);

  useEffect(() => {
    if (!pdfDoc || !pages.length || initialPreviewQueuedRef.current) {
      return;
    }

    initialPreviewQueuedRef.current = true;
    const preloadInitialPreviews = async () => {
      const firstPreviewCount = Math.min(pagesRef.current.length, 4);
      for (let i = 0; i < firstPreviewCount; i += 1) {
        await ensurePreview(i);
      }
    };

    preloadInitialPreviews();
  }, [pdfDoc, pages]);

  useEffect(
    () => () => {
      toastTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout));
      abortAllPreviews();
      releasePdfProxy();
    },
    []
  );

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    (async () => {
      const source = await loadSession('pdf-tools:source');
      const state = source ? await loadSession('pdf-tools:state') : null;
      try {
        if (source?.blob) {
          const bytes = await source.blob.arrayBuffer();
          await openPdfFromSource(
            {
              name: source.fileName || 'document.pdf',
              size: bytes.byteLength,
              arrayBuffer: async () => bytes
            },
            state
          );
        }
      } catch (error) {
        console.error(error);
      } finally {
        isHydratedRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) return;

    if (!pdfDoc) {
      void clearSession('pdf-tools:source');
      void clearSession('pdf-tools:state');
      return;
    }

    void saveSession('pdf-tools:source', {
      fileName,
      blob: new Blob([pdfDoc], { type: 'application/pdf' })
    });
  }, [fileName, pdfDoc]);

  useEffect(() => {
    if (!isHydratedRef.current || !pdfDoc) return undefined;

    const handle = window.setTimeout(() => {
      void saveSession('pdf-tools:state', {
        order: pages.map(page => page.index),
        rotations: Object.fromEntries(pages.map(page => [page.index, page.rotationOffset ?? 0])),
        isGrayscale,
        exportFormat,
        watermarkSettings,
        ranges,
        isRangeSplitterEnabled,
        pageBatchSize,
        currentPageBatch
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [
    currentPageBatch,
    exportFormat,
    isGrayscale,
    isRangeSplitterEnabled,
    pageBatchSize,
    pages,
    pdfDoc,
    ranges,
    watermarkSettings
  ]);

  useEffect(() => {
    if (previewPageIndex === null) return undefined;

    let isCancelled = false;
    const controller = new AbortController();

    const renderPreviewModal = async () => {
      const pageState = pagesRef.current.find(page => page.index === previewPageIndex);
      if (!pageState) return;

      setIsPreviewModalLoading(true);
      let canvas = null;
      let previewCanvas = null;
      try {
        canvas = await renderPageToCanvas(
          pageState,
          1.8,
          isGrayscale,
          watermarkSettings,
          null,
          controller.signal
        );
        previewCanvas = rotateCanvas(canvas, pageState.rotationOffset ?? 0);
        const nextImageUrl = previewCanvas.toDataURL('image/jpeg', 0.92);
        if (isCancelled) return;
        setPreviewImageUrl(nextImageUrl);
      } catch (error) {
        if (isRenderCancelled(error)) return;
        console.error(error);
        if (!isCancelled) {
          setPreviewImageUrl('');
          pushToast(
            'Page preview could not be rendered.',
            `Page ${previewPageIndex + 1} is still available for download.`,
            'error'
          );
        }
      } finally {
        clearCanvas(canvas);
        if (previewCanvas && previewCanvas !== canvas) {
          clearCanvas(previewCanvas);
        }
        if (!isCancelled) {
          setIsPreviewModalLoading(false);
        }
      }
    };

    renderPreviewModal();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [isGrayscale, pages, previewPageIndex, watermarkSignature]);

  useEffect(() => {
    if (previewPageIndex === null) return undefined;

    const handleKeydown = event => {
      if (event.key === 'Escape') {
        setPreviewPageIndex(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        setPreviewPageIndex(currentIndex =>
          currentIndex !== null && currentIndex > 0 ? currentIndex - 1 : currentIndex
        );
        return;
      }
      if (event.key === 'ArrowRight') {
        setPreviewPageIndex(currentIndex =>
          currentIndex !== null && currentIndex < pagesRef.current.length - 1
            ? currentIndex + 1
            : currentIndex
        );
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [previewPageIndex]);

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  }

  function pushToast(title, detail = '', tone = 'info') {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, title, detail, tone }]);
    const timeout = window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
      toastTimeoutsRef.current.delete(id);
    }, 3800);
    toastTimeoutsRef.current.set(id, timeout);
  }

  function dismissToast(id) {
    const timeout = toastTimeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }

  function closePagePreview() {
    setPreviewPageIndex(null);
    setPreviewImageUrl('');
    setIsPreviewModalLoading(false);
  }

  function openPagePreview(pageIndex) {
    setPreviewPageIndex(pageIndex);
    setPreviewImageUrl('');
  }

  function getDisplayRotation(pageState) {
    return (pageState.originalRotation ?? 0) + (pageState.rotationOffset ?? 0);
  }

  function getEffectiveRotation(pageState) {
    return normalizeRotation(getDisplayRotation(pageState));
  }

  async function requestDownloadTarget(filename) {
    const extensionMatch = filename.match(/(\.[^.]+)$/);
    const extension = extensionMatch?.[1] ?? '';
    const defaultBase = extension ? filename.slice(0, -extension.length) : filename;
    const suggestedName = filename;
    const mimeType =
      extension.toLowerCase() === '.pdf'
        ? 'application/pdf'
        : extension.toLowerCase() === '.zip'
          ? 'application/zip'
          : extension.toLowerCase() === '.png'
            ? 'image/png'
            : extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: `${extension.replace('.', '').toUpperCase() || 'File'} file`,
              accept: { [mimeType]: extension ? [extension] : [] }
            }
          ]
        });

        return {
          name: handle.name || suggestedName,
          async save(blob) {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          }
        };
      } catch (error) {
        if (error?.name === 'AbortError') return null;
        console.warn(error);
      }
    }

    const requestedName = window.prompt('Output name', defaultBase);
    if (requestedName === null) return null;
    const trimmedName = requestedName.trim() || defaultBase;
    const finalName =
      extension && !trimmedName.toLowerCase().endsWith(extension.toLowerCase())
        ? `${trimmedName}${extension}`
        : trimmedName;

    return {
      name: finalName,
      async save(blob) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = finalName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    };
  }

  function getOutputBaseName() {
    return (fileName || 'Document').trim().replace(/\.pdf$/i, '') || 'Document';
  }

  async function loadWatermarkImage(dataUrl) {
    if (!dataUrl) return null;
    const cached = watermarkImageAssetRef.current;
    if (cached.src === dataUrl && cached.image) {
      return cached.image;
    }
    if (cached.src === dataUrl && cached.promise) {
      return cached.promise;
    }

    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        watermarkImageAssetRef.current = { src: dataUrl, promise: null, image };
        resolve(image);
      };
      image.onerror = () => {
        watermarkImageAssetRef.current = { src: '', promise: null, image: null };
        reject(new Error('Unable to load watermark image.'));
      };
      image.src = dataUrl;
    });

    watermarkImageAssetRef.current = { src: dataUrl, promise, image: null };
    return promise;
  }

  async function applyCanvasWatermark(canvas, watermark) {
    if (!hasActiveWatermark(watermark)) return canvas;

    const context = canvas.getContext('2d');
    if (!context) return canvas;

    if (watermark.type === 'image' && watermark.imageDataUrl) {
      const image = await loadWatermarkImage(watermark.imageDataUrl);
      const scale = Math.max(1, Number(watermark.size) || DEFAULT_WATERMARK_SETTINGS.size) / 100;
      const maxWidth = canvas.width * scale;
      const maxHeight = canvas.height * scale;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
      const drawWidth = image.width * ratio;
      const drawHeight = image.height * ratio;
      const anchor = getWatermarkAnchor(canvas.width, canvas.height, watermark.position);
      context.save();
      context.globalAlpha = 0.28;
      context.drawImage(
        image,
        anchor.x - drawWidth / 2,
        anchor.y - drawHeight / 2,
        drawWidth,
        drawHeight
      );
      context.restore();
      return canvas;
    }

    const normalizedText = watermark.text.trim();
    if (!normalizedText) return canvas;

    const fontOption = getWatermarkFontOption(watermark.font);
    const fontSize = Math.max(
      8,
      Math.round(
        Math.min(canvas.width, canvas.height) *
          ((Number(watermark.size) || DEFAULT_WATERMARK_SETTINGS.size) / 100)
      )
    );
    const anchor = getWatermarkAnchor(canvas.width, canvas.height, watermark.position);
    const watermarkAngle = getWatermarkTextAngle(canvas.width, canvas.height);
    context.save();
    context.translate(anchor.x, anchor.y);
    context.rotate(watermarkAngle * (Math.PI / 180));
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${watermark.font.includes('Bold') ? '700' : '500'} ${fontSize}px ${fontOption.canvas}`;
    context.fillStyle = watermark.color;
    context.globalAlpha = 0.18;
    context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    context.lineWidth = Math.max(2, Math.round(fontSize * 0.04));
    context.strokeText(normalizedText, 0, 0);
    context.fillText(normalizedText, 0, 0);
    context.restore();
    return canvas;
  }

  async function applyPdfWatermark(page, pdfInstance, watermark) {
    if (!hasActiveWatermark(watermark)) return;

    const { width, height } = page.getSize();
    const sizeRatio = (Number(watermark.size) || DEFAULT_WATERMARK_SETTINGS.size) / 100;

    if (watermark.type === 'image' && watermark.imageDataUrl) {
      const imageBytes = await fetch(watermark.imageDataUrl).then(response =>
        response.arrayBuffer()
      );
      const isPng = watermark.imageDataUrl.startsWith('data:image/png');
      const image = isPng
        ? await pdfInstance.embedPng(imageBytes)
        : await pdfInstance.embedJpg(imageBytes);
      const maxWidth = width * sizeRatio;
      const maxHeight = height * sizeRatio;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const anchor = getWatermarkAnchor(width, height, watermark.position);
      page.drawImage(image, {
        x: anchor.x - drawWidth / 2,
        y: anchor.y - drawHeight / 2,
        width: drawWidth,
        height: drawHeight,
        opacity: 0.28
      });
      return;
    }

    const normalizedText = watermark.text.trim();
    if (!normalizedText) return;

    const fontOption = getWatermarkFontOption(watermark.font);
    const font = await pdfInstance.embedFont(fontOption.pdf);
    const fontSize = Math.max(8, Math.round(Math.min(width, height) * sizeRatio));
    const textWidth = font.widthOfTextAtSize(normalizedText, fontSize);
    const anchor = getWatermarkAnchor(width, height, watermark.position);
    const watermarkAngle = getPdfWatermarkTextAngle(width, height);
    const centerOffset = rotatePoint(textWidth / 2, fontSize / 2, watermarkAngle);

    page.drawText(normalizedText, {
      x: anchor.x - centerOffset.x,
      y: anchor.y - centerOffset.y,
      font,
      size: fontSize,
      rotate: degrees(watermarkAngle),
      color: hexToRgbColor(watermark.color),
      opacity: 0.16
    });
  }

  async function ensurePageMetadata(pageIndex) {
    const currentPage = pagesRef.current.find(page => page.index === pageIndex);
    if (!currentPage || currentPage.originalRotation !== null || !pdfProxyRef.current) {
      return currentPage;
    }

    const pdfPage = await pdfProxyRef.current.getPage(pageIndex + 1);
    let updatedPage;
    try {
      const originalRotation = pdfPage.rotate || 0;
      const viewport = pdfPage.getViewport({ scale: 1, rotation: originalRotation });
      updatedPage = {
        ...currentPage,
        originalRotation,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      };
    } finally {
      pdfPage.cleanup();
    }

    setPages(prev => prev.map(page => (page.index === pageIndex ? updatedPage : page)));
    pagesRef.current = pagesRef.current.map(page =>
      page.index === pageIndex ? updatedPage : page
    );
    return updatedPage;
  }

  async function renderPageToCanvas(
    pageState,
    scale = 2.5,
    forceGrayscale = false,
    watermark = watermarkSettings,
    rotationOverride = null,
    signal = null
  ) {
    let pdfProxy = pdfProxyRef.current;
    if (!pdfProxy) {
      const pdfjsLib = getPdfJsLib();
      const loadingTask = pdfjsLib.getDocument({ data: pdfDoc.slice(0) });
      pdfProxy = await loadingTask.promise;
      pdfProxyRef.current = pdfProxy;
    }

    const resolvedPage = (await ensurePageMetadata(pageState.index)) ?? pageState;
    let page = null;
    let canvas = null;
    let shouldKeepCanvas = false;

    try {
      page = await pdfProxy.getPage(pageState.index + 1);
      const viewportRotation = rotationOverride ?? resolvedPage.originalRotation ?? 0;
      const viewport = page.getViewport({ scale, rotation: viewportRotation });
      canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await renderPageWithCancellation(page, context, viewport, signal);

      if (forceGrayscale) {
        applyCanvasGrayscale(canvas);
      }

      await applyCanvasWatermark(canvas, watermark);
      shouldKeepCanvas = true;
      return canvas;
    } finally {
      page?.cleanup();
      if (!shouldKeepCanvas) {
        clearCanvas(canvas);
      }
    }
  }

  async function ensurePreview(pageIndex) {
    if (!pdfProxyRef.current && pdfDoc) {
      const pdfjsLib = getPdfJsLib();
      const loadingTask = pdfjsLib.getDocument({
        data: pdfDoc.slice(0),
        disableAutoFetch: true,
        disableStream: true
      });
      pdfProxyRef.current = await loadingTask.promise;
    }

    const targetPage = pagesRef.current.find(page => page.index === pageIndex);
    if (!targetPage || targetPage.isPreviewLoading || !pdfProxyRef.current) {
      return;
    }

    const previewSignature = `${isGrayscale ? 'bw' : 'color'}|${watermarkSignature}`;
    if (targetPage.previewUrl && targetPage.previewSignature === previewSignature) {
      return;
    }

    previewAbortRef.current.get(pageIndex)?.abort();
    const controller = new AbortController();
    previewAbortRef.current.set(pageIndex, controller);

    setPages(prev =>
      prev.map(page => (page.index === pageIndex ? { ...page, isPreviewLoading: true } : page))
    );

    let canvas = null;
    try {
      const pageState = (await ensurePageMetadata(pageIndex)) ?? targetPage;
      canvas = await renderPageToCanvas(
        pageState,
        0.62,
        isGrayscale,
        watermarkSettings,
        null,
        controller.signal
      );
      const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
      const latestPage = pagesRef.current.find(page => page.index === pageIndex);
      const latestPreviewSignature = latestPage
        ? `${isGrayscale ? 'bw' : 'color'}|${watermarkSignature}`
        : previewSignature;

      if (latestPreviewSignature !== previewSignature) {
        setPages(prev =>
          prev.map(page => (page.index === pageIndex ? { ...page, isPreviewLoading: false } : page))
        );
        return;
      }

      setPages(prev =>
        prev.map(page =>
          page.index === pageIndex
            ? {
                ...page,
                previewUrl,
                previewSignature,
                isPreviewLoading: false,
                pageWidth: pageState.pageWidth,
                pageHeight: pageState.pageHeight
              }
            : page
        )
      );
    } catch (error) {
      if (isRenderCancelled(error)) return;
      console.error(error);
      setPages(prev =>
        prev.map(page => (page.index === pageIndex ? { ...page, isPreviewLoading: false } : page))
      );
      pushToast(
        'Preview could not be rendered.',
        `Page ${pageIndex + 1} will remain available without thumbnail.`,
        'error'
      );
    } finally {
      if (previewAbortRef.current.get(pageIndex) === controller) {
        previewAbortRef.current.delete(pageIndex);
      }
      clearCanvas(canvas);
    }
  }

  function abortAllPreviews() {
    previewAbortRef.current.forEach(controller => controller.abort());
    previewAbortRef.current.clear();
  }

  function createPageSkeletons(pageCount, initialPreviewCount) {
    return Array.from({ length: pageCount }, (_, index) => ({
      index,
      originalRotation: null,
      pageWidth: null,
      pageHeight: null,
      rotationOffset: 0,
      previewUrl: null,
      previewSignature: '',
      isPreviewLoading: index < initialPreviewCount
    }));
  }

  function releasePdfProxy() {
    const pdfProxy = pdfProxyRef.current;
    pdfProxyRef.current = null;
    void destroyPdfProxy(pdfProxy);
  }

  async function renderInitialPreviewPage(pdfProxy, pageIndex) {
    let previewPage = null;
    let canvas = null;

    try {
      previewPage = await pdfProxy.getPage(pageIndex + 1);
      const originalRotation = previewPage.rotate || 0;
      const viewport = previewPage.getViewport({ scale: 0.62, rotation: originalRotation });
      const pageViewport = previewPage.getViewport({ scale: 1, rotation: originalRotation });
      canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await previewPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return {
        originalRotation,
        pageWidth: pageViewport.width,
        pageHeight: pageViewport.height,
        previewUrl: canvas.toDataURL('image/jpeg', 0.9),
        previewSignature: 'color|none',
        isPreviewLoading: false
      };
    } finally {
      previewPage?.cleanup();
      clearCanvas(canvas);
    }
  }

  function applyLoadedSession(pagesData, state) {
    if (!state) return pagesData;

    if (Array.isArray(state.order) && state.order.length) {
      const pageMap = new Map(pagesData.map(page => [page.index, page]));
      const ordered = state.order
        .map(index => {
          const page = pageMap.get(index);
          if (!page) return null;
          return { ...page, rotationOffset: state.rotations?.[index] ?? page.rotationOffset ?? 0 };
        })
        .filter(Boolean);
      if (ordered.length) return ordered;
    }

    if (state.rotations) {
      return pagesData.map(page => ({
        ...page,
        rotationOffset: state.rotations[page.index] ?? page.rotationOffset ?? 0
      }));
    }

    return pagesData;
  }

  function finalizeLoadedDocument(arrayBuffer, pageCount, pagesData, state) {
    const restoredPages = applyLoadedSession(pagesData, state);

    setPdfDoc(arrayBuffer);
    setPages(restoredPages);
    setRanges(
      Array.isArray(state?.ranges) && state.ranges.length
        ? state.ranges
        : [{ id: Date.now(), start: 1, end: 1 }]
    );
    pagesRef.current = restoredPages;
    initialPreviewQueuedRef.current = false;

    if (state) {
      if (typeof state.isGrayscale === 'boolean') setIsGrayscale(state.isGrayscale);
      if (state.exportFormat) setExportFormat(state.exportFormat);
      if (state.watermarkSettings) {
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...state.watermarkSettings });
      }
      if (typeof state.isRangeSplitterEnabled === 'boolean') {
        setIsRangeSplitterEnabled(state.isRangeSplitterEnabled);
      }
      if (state.pageBatchSize) setPageBatchSize(state.pageBatchSize);
      if (state.currentPageBatch) setCurrentPageBatch(state.currentPageBatch);
    }

    setStatus({
      tone: 'success',
      title: 'Dokumen siap',
      detail: `${pageCount} halaman tersedia untuk diedit dan diekspor.`
    });
    pushToast('PDF loaded successfully.', `${pageCount} pages are ready for editing.`, 'success');
    setIsOpeningPdf(false);
    setOpeningFileName('');
  }

  async function handlePdfUpload(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      pushToast(
        'Hanya file PDF yang didukung.',
        'Pilih atau seret dokumen PDF terlebih dahulu.',
        'error'
      );
      return;
    }
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      pushToast(
        'File melebihi batas unggah.',
        `Ukuran maksimum yang didukung adalah ${maxFileSizeMb}MB.`,
        'error'
      );
      return;
    }

    await openPdfFromSource(file);
  }

  async function openPdfFromSource(source, sessionState = null) {
    releasePdfProxy();
    abortAllPreviews();
    sourcePdfRef.current = null;
    setSelectedPages([]);
    setCurrentPageBatch(1);
    setFileName(source.name.replace(/\.pdf$/i, ''));
    setOpeningFileName(source.name);
    setOpeningError('');
    setIsOpeningPdf(true);
    setStatus({
      tone: 'loading',
      title: 'Membaca file',
      detail: `Menyiapkan ${source.name} untuk analisis dokumen.`
    });

    try {
      const arrayBuffer = await withTimeout(
        source.arrayBuffer(),
        15000,
        'Timed out while reading the PDF file.'
      );
      setLoadingProgress({ current: 0, total: 0 });

      if (source.size <= fastOpenThresholdMb * 1024 * 1024) {
        setStatus({
          tone: 'loading',
          title: 'Membuka dokumen',
          detail: 'Menyiapkan struktur halaman dan pratinjau awal.'
        });
        const sourcePdf = await withTimeout(
          PDFDocument.load(arrayBuffer.slice(0)),
          10000,
          'Timed out while reading the PDF structure.'
        );
        const pageCount = sourcePdf.getPageCount();
        const pdfjsLib = getPdfJsLib();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer.slice(0),
          disableAutoFetch: true,
          disableStream: true
        });
        const pdfProxy = await withTimeout(
          loadingTask.promise,
          12000,
          'Timed out while preparing page previews.'
        );
        const initialPreviewCount = Math.min(pageCount, 4);
        const pagesData = createPageSkeletons(pageCount, initialPreviewCount);

        sourcePdfRef.current = sourcePdf;
        pdfProxyRef.current = pdfProxy;

        for (let i = 0; i < initialPreviewCount; i += 1) {
          setStatus({
            tone: 'loading',
            title: 'Merender pratinjau',
            detail: `Preparing page ${i + 1} of ${initialPreviewCount}.`
          });
          pagesData[i] = {
            ...pagesData[i],
            ...(await renderInitialPreviewPage(pdfProxy, i))
          };
        }

        finalizeLoadedDocument(arrayBuffer, pageCount, pagesData, sessionState);
        return;
      }

      setStatus({
        tone: 'loading',
        title: 'Membuka PDF besar',
        detail: 'Parsing dokumen berlanjut di latar belakang sementara workspace tetap responsif.'
      });

      requestAnimationFrame(async () => {
        try {
          const pdfjsLib = getPdfJsLib();
          const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer.slice(0),
            disableAutoFetch: true,
            disableStream: true
          });
          const pdfProxy = await withTimeout(
            loadingTask.promise,
            20000,
            'Timed out while opening the PDF document.'
          );
          const pageCount = pdfProxy.numPages;
          const initialPreviewCount = Math.min(pageCount, 4);
          const pagesData = createPageSkeletons(pageCount, initialPreviewCount);

          pdfProxyRef.current = pdfProxy;
          sourcePdfRef.current = null;

          for (let i = 0; i < initialPreviewCount; i += 1) {
            setStatus({
              tone: 'loading',
              title: 'Merender pratinjau',
              detail: `Menyiapkan halaman ${i + 1} dari ${initialPreviewCount}.`
            });
            pagesData[i] = {
              ...pagesData[i],
              ...(await renderInitialPreviewPage(pdfProxy, i))
            };
          }

          finalizeLoadedDocument(arrayBuffer, pageCount, pagesData, sessionState);
        } catch (error) {
          console.error(error);
          releasePdfProxy();
          setOpeningError(error.message || 'Error loading PDF.');
          setStatus({
            tone: 'error',
            title: 'PDF tidak bisa dibuka',
            detail: error.message || 'Gagal memuat PDF.'
          });
          pushToast('Document failed to open.', error.message || 'Error loading PDF.', 'error');
        } finally {
          setIsOpeningPdf(false);
          setOpeningFileName('');
        }
      });
    } catch (error) {
      console.error(error);
      releasePdfProxy();
      setOpeningError(error.message || 'Error loading PDF.');
      setStatus({
        tone: 'error',
        title: 'PDF could not be opened',
        detail: error.message || 'Error loading PDF.'
      });
      pushToast('Document failed to open.', error.message || 'Error loading PDF.', 'error');
      setIsOpeningPdf(false);
      setOpeningFileName('');
    } finally {
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  function resetDocumentState() {
    setPdfDoc(null);
    setPages([]);
    setSelectedPages([]);
    setCurrentPageBatch(1);
    setFileName('');
    setDraggedPageIndex(null);
    setDropTargetPageIndex(null);
    dragPageIndexRef.current = null;
    setIsRangeSplitterEnabled(false);
    setRanges(initialRanges);
    setIsGrayscale(false);
    setExportFormat('pdf');
    setWatermarkSettings(DEFAULT_WATERMARK_SETTINGS);
    if (watermarkImageInputRef.current) {
      watermarkImageInputRef.current.value = '';
    }
    watermarkImageAssetRef.current = { src: '', promise: null, image: null };
    setOpeningFileName('');
    setIsOpeningPdf(false);
    setOpeningError('');
    setStatus(null);
    abortAllPreviews();
    releasePdfProxy();
    sourcePdfRef.current = null;
    initialPreviewQueuedRef.current = false;
  }

  function requestConfirm(action) {
    setConfirmAction(action);
  }

  function reorderPagesByIndex(fromPageIndex, toPageIndex) {
    if (fromPageIndex === null || toPageIndex === null || fromPageIndex === toPageIndex)
      return fromPageIndex;

    let nextDraggedIndex = fromPageIndex;
    rememberPositions();
    setPages(prev => {
      const fromIndex = prev.findIndex(page => page.index === fromPageIndex);
      const toIndex = prev.findIndex(page => page.index === toPageIndex);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;

      const nextPages = [...prev];
      const [movedPage] = nextPages.splice(fromIndex, 1);
      nextPages.splice(toIndex, 0, movedPage);
      nextDraggedIndex = movedPage.index;
      return nextPages;
    });

    return nextDraggedIndex;
  }

  function movePageByOffset(pageIndex, offset) {
    const fromIndex = pages.findIndex(page => page.index === pageIndex);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= pages.length) return;

    rememberPositions();
    setPages(prev => moveItem(prev, fromIndex, toIndex));
    setStatus({
      tone: 'info',
      title: 'Urutan halaman diperbarui',
      detail: 'Ekspor akan menggunakan urutan visual halaman saat ini.'
    });
  }

  function handlePageDragStart(event, pageIndex) {
    dragPageIndexRef.current = pageIndex;
    setDraggedPageIndex(pageIndex);
    setDropTargetPageIndex(pageIndex);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(pageIndex));
    applyCardDragImage(event);
  }

  function handlePageDragOver(event, pageIndex) {
    event.preventDefault();
    const currentPageIndex = dragPageIndexRef.current;
    if (currentPageIndex === null || currentPageIndex === pageIndex) return;

    setDropTargetPageIndex(pageIndex);
    const nextDraggedIndex = reorderPagesByIndex(currentPageIndex, pageIndex);
    dragPageIndexRef.current = nextDraggedIndex;
    setDraggedPageIndex(nextDraggedIndex);
  }

  function handlePageDrop(event) {
    event.preventDefault();
    handlePageDragEnd();
  }

  function handlePageDragEnd() {
    const hadDrag = dragPageIndexRef.current !== null;
    dragPageIndexRef.current = null;
    setDraggedPageIndex(null);
    setDropTargetPageIndex(null);

    if (hadDrag) {
      setStatus({
        tone: 'info',
        title: 'Page order updated',
        detail: 'Exports will use the current visual page order.'
      });
    }
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
    handlePdfUpload({ target: { files: getDroppedFiles(event), value: '' } });
  }

  function updateWatermarkSettings(updates) {
    setWatermarkSettings(prev => ({ ...prev, ...updates }));
  }

  function applyWatermarkColor() {
    if (draftWatermarkColor === watermarkSettings.color) return;
    updateWatermarkSettings({ color: draftWatermarkColor });
  }

  function updateWatermarkSize(nextSize, type = watermarkSettings.type) {
    const clampedSize = clampWatermarkSize(nextSize, type, watermarkSettings.size);
    setDraftWatermarkSize(String(clampedSize));
    updateWatermarkSettings({ size: clampedSize });
  }

  function handleWatermarkSizeInputChange(value, type = watermarkSettings.type) {
    if (!/^\d*$/.test(value)) return;

    setDraftWatermarkSize(value);
    if (value === '') return;

    const limits = getWatermarkSizeLimits(type);
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue >= limits.min && numericValue <= limits.max) {
      updateWatermarkSettings({ size: numericValue });
    }
  }

  function commitWatermarkSize(type = watermarkSettings.type) {
    updateWatermarkSize(draftWatermarkSize, type);
  }

  function handleWatermarkTypeChange(type) {
    const nextSize = clampWatermarkSize(watermarkSettings.size, type);
    setDraftWatermarkSize(String(nextSize));
    updateWatermarkSettings({ type, size: nextSize });
  }

  function handleWatermarkEnabledChange(enabled) {
    updateWatermarkSettings({ enabled });
  }

  function handleRangeSplitterEnabledChange(enabled) {
    setIsRangeSplitterEnabled(enabled);
  }

  async function handleWatermarkImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Image watermark could not be loaded.'));
      reader.readAsDataURL(file);
    });

    watermarkImageAssetRef.current = { src: '', promise: null, image: null };
    setWatermarkSettings(prev => ({
      ...prev,
      enabled: true,
      type: 'image',
      imageDataUrl: dataUrl,
      imageName: file.name
    }));
  }

  function clearWatermarkImage() {
    if (watermarkImageInputRef.current) {
      watermarkImageInputRef.current.value = '';
    }
    watermarkImageAssetRef.current = { src: '', promise: null, image: null };
    setWatermarkSettings(prev => ({ ...prev, imageDataUrl: '', imageName: '' }));
  }

  function rotateSelectedPages() {
    if (selectedPages.length === 0) return;
    const selectedSet = new Set(selectedPages);
    rememberPositions();
    setPages(prev =>
      prev.map(page =>
        selectedSet.has(page.index)
          ? { ...page, rotationOffset: (page.rotationOffset ?? 0) + 90 }
          : page
      )
    );
    setStatus({
      tone: 'info',
      title: 'Halaman diputar',
      detail: `${selectedPages.length} halaman terpilih diputar searah jarum jam.`
    });
    pushToast(
      'Selected pages rotated.',
      `${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'} updated.`,
      'success'
    );
  }

  function handleConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction.action;
    setConfirmAction(null);

    if (action === 'delete-selected') {
      const nextPages = pages.filter(page => !selectedPages.includes(page.index));
      setPages(nextPages);
      setSelectedPages([]);
      setRanges(prev => prev.map(range => ({ ...range, start: 1, end: 1 })));
      setStatus({
        tone: 'info',
        title: 'Halaman dihapus',
        detail: `${selectedCount} halaman terpilih dihapus dari set kerja.`
      });
      pushToast(
        'Selected pages removed.',
        `${selectedCount} pages were deleted from the current session.`,
        'success'
      );
      return;
    }

    if (action === 'delete-ranges') {
      const pagesToDelete = new Set();
      ranges.forEach(range => {
        const start = Math.max(1, Math.min(range.start, range.end));
        const end = Math.min(pages.length, Math.max(range.start, range.end));
        for (let i = start; i <= end; i += 1) pagesToDelete.add(i);
      });
      const nextPages = pages.filter((_, idx) => !pagesToDelete.has(idx + 1));
      setPages(nextPages);
      setSelectedPages([]);
      setRanges([{ id: Date.now(), start: 1, end: 1 }]);
      setStatus({
        tone: 'info',
        title: 'Halaman rentang dihapus',
        detail: `${pagesToDelete.size} halaman dihapus dari salinan kerja saat ini.`
      });
      pushToast('Range pages removed.', `${pagesToDelete.size} pages were deleted.`, 'success');
      return;
    }

    if (action === 'reset-file') {
      resetDocumentState();
      pushToast('Document closed.', 'The current editing session has been cleared.', 'info');
      return;
    }

    if (action === 'clear-ranges') {
      setRanges([]);
      pushToast('Ranges cleared.', 'Range definitions have been removed.', 'info');
    }
  }

  function togglePageSelection(index) {
    setSelectedPages(prev =>
      prev.includes(index) ? prev.filter(item => item !== index) : [...prev, index]
    );
  }

  function deleteSelectedPages() {
    if (selectedPages.length === 0) return;
    requestConfirm({
      action: 'delete-selected',
      tone: 'danger',
      title: 'Hapus Halaman Terpilih',
      message: `${selectedPages.length} selected pages will be removed from the working session.`,
      confirmLabel: 'Hapus'
    });
  }

  function addRange() {
    setRanges(prev => [...prev, { id: Date.now(), start: 1, end: 1 }]);
  }

  function removeRange(id) {
    setRanges(prev => prev.filter(range => range.id !== id));
  }

  function updateRange(id, field, value) {
    let parsed = parseInt(value, 10) || 0;
    if (parsed < 1) parsed = 1;
    if (parsed > pages.length) parsed = pages.length;
    setRanges(prev => prev.map(range => (range.id === id ? { ...range, [field]: parsed } : range)));
  }

  function deletePagesInRange() {
    if (ranges.length === 0) return;
    const pagesToDelete = new Set();
    ranges.forEach(range => {
      const start = Math.max(1, Math.min(range.start, range.end));
      const end = Math.min(pages.length, Math.max(range.start, range.end));
      for (let i = start; i <= end; i += 1) pagesToDelete.add(i);
    });

    if (pagesToDelete.size === 0) {
      pushToast(
        'No valid range selected.',
        'Adjust the range values before deleting pages.',
        'error'
      );
      return;
    }

    const nextPages = pages.filter((_, idx) => !pagesToDelete.has(idx + 1));
    if (nextPages.length === 0) {
      requestConfirm({
        action: 'reset-file',
        tone: 'danger',
        title: 'Semua Halaman Akan Dihapus',
        message:
          'The selected ranges cover the entire document. The file will be closed from the workspace.',
        confirmLabel: 'Tutup Dokumen'
      });
      return;
    }

    requestConfirm({
      action: 'delete-ranges',
      tone: 'danger',
      title: 'Hapus Halaman Rentang',
      message: `${pagesToDelete.size} pages in the selected ranges will be removed from the working session.`,
      confirmLabel: 'Hapus'
    });
  }

  async function downloadItem(pageData, single = false) {
    const initialExtension = exportFormat === 'pdf' ? 'pdf' : exportFormat;
    const initialName = `${getOutputBaseName()}_Page_${pageData.index + 1}${isGrayscale ? '_BW' : ''}.${initialExtension}`;
    const saveTarget = single ? await requestDownloadTarget(initialName) : null;
    if (single && !saveTarget) return null;

    if (single) {
      setProcessingState({
        label: 'Menyiapkan ekspor',
        detail: `Menyiapkan halaman ${pageData.index + 1} sebagai ${exportFormat.toUpperCase()}.`
      });
      setIsProcessing(true);
    }

    let renderedCanvas = null;
    try {
      let blob;
      let extension;

      if (exportFormat === 'pdf') {
        extension = 'pdf';
        if (isGrayscale) {
          const resolvedPage = (await ensurePageMetadata(pageData.index)) ?? pageData;
          renderedCanvas = await renderPageToCanvas(
            resolvedPage,
            2.5,
            true,
            watermarkSettings,
            getEffectiveRotation(resolvedPage)
          );
          const imgBytes = await canvasToArrayBuffer(renderedCanvas, 'image/jpeg', 0.9);
          const nextPdf = await PDFDocument.create();
          const image = await nextPdf.embedJpg(imgBytes);
          const page = nextPdf.addPage([renderedCanvas.width / 2.5, renderedCanvas.height / 2.5]);
          page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
          blob = new Blob([await nextPdf.save()], { type: 'application/pdf' });
        } else {
          const sourcePdf = sourcePdfRef.current ?? (await PDFDocument.load(pdfDoc.slice(0)));
          sourcePdfRef.current = sourcePdf;
          const nextPdf = await PDFDocument.create();
          const [copiedPage] = await nextPdf.copyPages(sourcePdf, [pageData.index]);
          const resolvedPage = (await ensurePageMetadata(pageData.index)) ?? pageData;
          copiedPage.setRotation(degrees(getEffectiveRotation(resolvedPage)));
          nextPdf.addPage(copiedPage);
          await applyPdfWatermark(copiedPage, nextPdf, watermarkSettings);
          blob = new Blob([await nextPdf.save()], { type: 'application/pdf' });
        }
      } else {
        extension = exportFormat;
        const mime = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
        const resolvedPage = (await ensurePageMetadata(pageData.index)) ?? pageData;
        renderedCanvas = await renderPageToCanvas(
          resolvedPage,
          2.5,
          isGrayscale,
          watermarkSettings,
          getEffectiveRotation(resolvedPage)
        );
        blob = await canvasToBlob(renderedCanvas, mime, 0.95);
      }

      const name = `${getOutputBaseName()}_Page_${pageData.index + 1}${isGrayscale ? '_BW' : ''}.${extension}`;
      if (single) {
        await saveTarget.save(blob);
        setStatus({
          tone: 'success',
          title: 'Halaman diekspor',
          detail: `${saveTarget.name} siap diunduh.`
        });
        pushToast('Page exported.', saveTarget.name, 'success');
      }

      return { blob, name };
    } catch (error) {
      console.error(error);
      const detail = error?.message || 'The page could not be exported.';
      pushToast('Export failed.', detail, 'error');
      if (single) {
        setStatus({ tone: 'error', title: 'Ekspor gagal', detail });
        return null;
      }
      throw error;
    } finally {
      clearCanvas(renderedCanvas);
      if (single) {
        setIsProcessing(false);
        setLoadingProgress({ current: 0, total: 0 });
      }
    }
  }

  async function downloadZip(indices, zipName) {
    const saveTarget = await requestDownloadTarget(zipName);
    if (!saveTarget) return;

    setProcessingState({
      label: 'Creating ZIP archive',
      detail: `Menyiapkan ${indices.length} halaman untuk diunduh.`
    });
    setIsProcessing(true);
    const zip = new JSZip();

    try {
      for (let i = 0; i < indices.length; i += 1) {
        setLoadingProgress({ current: i + 1, total: indices.length });
        setProcessingState({
          label: 'Membuat arsip ZIP',
          detail: `Memproses halaman ${i + 1} dari ${indices.length}.`
        });
        const pageData = pages.find(page => page.index === indices[i]);
        const { blob, name } = await downloadItem(pageData, false);
        zip.file(name, blob);
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });
      await saveTarget.save(zipContent);
      setStatus({
        tone: 'success',
        title: 'ZIP siap diunduh',
        detail: `${saveTarget.name} berhasil dibuat.`
      });
      pushToast('ZIP archive generated.', saveTarget.name, 'success');
    } catch (error) {
      console.error(error);
      const detail = error?.message || 'The archive could not be generated.';
      setStatus({ tone: 'error', title: 'Ekspor ZIP gagal', detail });
      pushToast('ZIP export failed.', detail, 'error');
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  async function downloadMergedPdf() {
    if (selectedPages.length === 0) return;
    const saveTarget = await requestDownloadTarget(`${getOutputBaseName()}_Merged_Selected.pdf`);
    if (!saveTarget) return;

    setProcessingState({
      label: 'Menggabung halaman terpilih',
      detail: `Menyiapkan ${selectedPages.length} halaman menjadi satu PDF.`
    });
    setIsProcessing(true);

    try {
      const pagesMap = pages.map(page => page.index);
      const sortedIndices = [...selectedPages].sort(
        (a, b) => pagesMap.indexOf(a) - pagesMap.indexOf(b)
      );
      const nextPdf = await PDFDocument.create();

      if (isGrayscale) {
        for (let i = 0; i < sortedIndices.length; i += 1) {
          setLoadingProgress({ current: i + 1, total: sortedIndices.length });
          setProcessingState({
            label: 'Menggabung halaman terpilih',
            detail: `Merender halaman ${i + 1} dari ${sortedIndices.length}.`
          });
          const index = sortedIndices[i];
          const pageState =
            (await ensurePageMetadata(index)) ??
            pagesRef.current.find(page => page.index === index);
          const canvas = await renderPageToCanvas(
            pageState,
            2.5,
            true,
            watermarkSettings,
            getEffectiveRotation(pageState || {})
          );
          try {
            const imgBytes = await canvasToArrayBuffer(canvas, 'image/jpeg', 0.8);
            const image = await nextPdf.embedJpg(imgBytes);
            const page = nextPdf.addPage([canvas.width / 2.5, canvas.height / 2.5]);
            page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
          } finally {
            clearCanvas(canvas);
          }
        }
      } else {
        const sourcePdf = sourcePdfRef.current ?? (await PDFDocument.load(pdfDoc.slice(0)));
        sourcePdfRef.current = sourcePdf;
        const copiedPages = await nextPdf.copyPages(sourcePdf, sortedIndices);
        for (let i = 0; i < copiedPages.length; i += 1) {
          setLoadingProgress({ current: i + 1, total: copiedPages.length });
          const pageState =
            (await ensurePageMetadata(sortedIndices[i])) ??
            pagesRef.current.find(page => page.index === sortedIndices[i]);
          if (pageState) copiedPages[i].setRotation(degrees(getEffectiveRotation(pageState)));
          nextPdf.addPage(copiedPages[i]);
          await applyPdfWatermark(copiedPages[i], nextPdf, watermarkSettings);
        }
      }

      await saveTarget.save(new Blob([await nextPdf.save()], { type: 'application/pdf' }));
      setStatus({
        tone: 'success',
        title: 'PDF gabungan siap',
        detail: `${selectedPages.length} halaman digabung menjadi satu dokumen.`
      });
      pushToast('Merged PDF generated.', saveTarget.name, 'success');
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Gagal menggabung',
        detail: 'Halaman yang dipilih tidak bisa digabung menjadi PDF.'
      });
      pushToast('Merge failed.', 'The selected pages could not be combined into a PDF.', 'error');
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  async function downloadRangesAsZip() {
    if (ranges.length === 0) return;
    const saveTarget = await requestDownloadTarget(`${getOutputBaseName()}_Ranges.zip`);
    if (!saveTarget) return;

    setProcessingState({
      label: 'Memisah rentang',
      detail: `Menyiapkan ${ranges.length} rentang terkonfigurasi.`
    });
    setIsProcessing(true);
    const zip = new JSZip();

    try {
      const sourcePdf = sourcePdfRef.current ?? (await PDFDocument.load(pdfDoc.slice(0)));
      sourcePdfRef.current = sourcePdf;

      for (let i = 0; i < ranges.length; i += 1) {
        setLoadingProgress({ current: i + 1, total: ranges.length });
        setProcessingState({
          label: 'Memisah rentang',
          detail: `Memproses rentang ${i + 1} dari ${ranges.length}.`
        });
        const { start, end } = ranges[i];
        const safeStart = Math.min(start, end);
        const safeEnd = Math.max(start, end);
        const indices = [];
        for (let k = safeStart; k <= safeEnd; k += 1) {
          if (pages[k - 1]) indices.push(pages[k - 1].index);
        }
        if (indices.length === 0) continue;

        const nextPdf = await PDFDocument.create();
        if (isGrayscale) {
          for (const idx of indices) {
            const pageState =
              (await ensurePageMetadata(idx)) ?? pagesRef.current.find(page => page.index === idx);
            const canvas = await renderPageToCanvas(
              pageState,
              2.5,
              true,
              watermarkSettings,
              getEffectiveRotation(pageState || {})
            );
            try {
              const imgBytes = await canvasToArrayBuffer(canvas, 'image/jpeg', 0.8);
              const image = await nextPdf.embedJpg(imgBytes);
              const page = nextPdf.addPage([canvas.width / 2.5, canvas.height / 2.5]);
              page.drawImage(image, {
                x: 0,
                y: 0,
                width: page.getWidth(),
                height: page.getHeight()
              });
            } finally {
              clearCanvas(canvas);
            }
          }
        } else {
          const copiedPages = await nextPdf.copyPages(sourcePdf, indices);
          for (let j = 0; j < copiedPages.length; j += 1) {
            const pageState =
              (await ensurePageMetadata(indices[j])) ??
              pagesRef.current.find(page => page.index === indices[j]);
            if (pageState) copiedPages[j].setRotation(degrees(getEffectiveRotation(pageState)));
            nextPdf.addPage(copiedPages[j]);
            await applyPdfWatermark(copiedPages[j], nextPdf, watermarkSettings);
          }
        }

        zip.file(
          `${getOutputBaseName()}_Range_${i + 1}_Pages_${safeStart}-${safeEnd}.pdf`,
          await nextPdf.save()
        );
      }

      await saveTarget.save(await zip.generateAsync({ type: 'blob' }));
      setStatus({
        tone: 'success',
        title: 'Ekspor rentang siap',
        detail: `${ranges.length} rentang dikemas sebagai file ZIP.`
      });
      pushToast('Range ZIP generated.', saveTarget.name, 'success');
    } catch (error) {
      console.error(error);
      setStatus({
        tone: 'error',
        title: 'Ekspor rentang gagal',
        detail: 'Rentang yang dikonfigurasi tidak bisa diekspor.'
      });
      pushToast('Range export failed.', 'The configured ranges could not be exported.', 'error');
    } finally {
      setIsProcessing(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  }

  return (
    <div
      className={isFileDropActive ? 'pdf-tools-view file-drop-active' : 'pdf-tools-view'}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {!pdfDoc && (
        <section className="panel pdf-empty-panel">
          <div className="toolbar pdf-empty-toolbar">
            <div>
              <h2 className="brand-title pdf-empty-title">Alat PDF</h2>
              <p className="brand-subtitle">Pisah, putar, dan ekspor halaman PDF</p>
            </div>
            <div className="merge-actions">
              <button
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isOpeningPdf}
              >
                <Upload size={16} />
                Pilih Dokumen PDF
              </button>
            </div>
          </div>

          <button
            type="button"
            className="dropzone pdf-empty-dropzone"
            onClick={() => fileInputRef.current?.click()}
            disabled={isOpeningPdf}
          >
            <FileText size={56} />
            <span className="field-value">
              {isOpeningPdf ? 'Membuka PDF...' : 'Pilih PDF untuk mulai'}
            </span>
            <span className="muted">
              {isOpeningPdf
                ? `Membuka ${openingFileName} di latar belakang. PDF besar mungkin perlu waktu, tapi halaman tetap responsif.`
                : 'Seret PDF ke sini atau pilih dari perangkat Anda (Maks 500MB).'}
            </span>
          </button>

          {(status || openingError) && (
            <div className="pdf-empty-status">
              <StatusBanner
                status={
                  openingError
                    ? { tone: 'error', title: 'Gagal membuka', detail: openingError }
                    : status
                }
              />
            </div>
          )}
        </section>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={handlePdfUpload}
      />

      {pdfDoc && (
        <>
          <section className="panel pdf-main-panel">
            <div className="stats-grid pdf-stats-grid">
              <div>
                <span className="field-label">File</span>
                <div className="field-value">{fileName}</div>
              </div>
              <div>
                <span className="field-label">Total Halaman</span>
                <div className="field-value">{pages.length} Pages</div>
              </div>
              <div>
                <span className="field-label">Format Ekspor</span>
                <div className="toggle-button">
                  {['pdf', 'jpg', 'png'].map(format => (
                    <button
                      key={format}
                      className={exportFormat === format ? 'active' : ''}
                      onClick={() => setExportFormat(format)}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="field-label">Filter</span>
                <button
                  className={isGrayscale ? 'pdf-filter-button active' : 'pdf-filter-button'}
                  onClick={() => {
                    const nextValue = !isGrayscale;
                    setIsGrayscale(nextValue);
                  }}
                >
                  <Palette size={16} />
                  {isGrayscale ? 'B&W ON' : 'WARNA'}
                </button>
              </div>
              <div>
                <span className="field-label">Watermark</span>
                <div className="pdf-watermark-panel">
                  <div
                    className="pdf-choice-toggle pdf-watermark-toggle"
                    role="radiogroup"
                    aria-label="Status watermark"
                  >
                    {[
                      { value: false, label: 'Mati' },
                      { value: true, label: 'Nyala' }
                    ].map(option => (
                      <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={watermarkSettings.enabled === option.value}
                        className={watermarkSettings.enabled === option.value ? 'active' : ''}
                        onClick={() => handleWatermarkEnabledChange(option.value)}
                      >
                        <span className="pdf-watermark-radio" />
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {watermarkSettings.enabled && (
                    <>
                      <div className="toggle-button pdf-watermark-type-toggle">
                        {[
                          { value: 'text', label: 'Text' },
                          { value: 'image', label: 'Image' }
                        ].map(option => (
                          <button
                            key={option.value}
                            className={watermarkSettings.type === option.value ? 'active' : ''}
                            onClick={() => handleWatermarkTypeChange(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="pdf-watermark-grid pdf-watermark-position-grid">
                        <label className="pdf-watermark-font">
                          <span>Posisi</span>
                          <select
                            className="pdf-watermark-select"
                            value={watermarkSettings.position}
                            onChange={event =>
                              updateWatermarkSettings({ position: event.target.value })
                            }
                          >
                            {WATERMARK_POSITION_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {watermarkSettings.type === 'text' ? (
                        <div className="pdf-watermark-grid">
                          <input
                            className="pdf-watermark-input"
                            type="text"
                            maxLength="80"
                            placeholder="mis. RAHASIA"
                            value={watermarkSettings.text}
                            onChange={event =>
                              updateWatermarkSettings({ text: event.target.value })
                            }
                          />
                          <div className="pdf-watermark-inline">
                            <label className="pdf-watermark-font">
                              <span>Font</span>
                              <select
                                className="pdf-watermark-select"
                                value={watermarkSettings.font}
                                onChange={event =>
                                  updateWatermarkSettings({ font: event.target.value })
                                }
                              >
                                {WATERMARK_FONT_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="pdf-watermark-range">
                              <span>Ukuran</span>
                              <div className="pdf-watermark-size-control">
                                <input
                                  type="range"
                                  min="1"
                                  max="36"
                                  value={watermarkSettings.size}
                                  onChange={event =>
                                    updateWatermarkSize(event.target.value, 'text')
                                  }
                                />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  min="1"
                                  max="36"
                                  pattern="[0-9]*"
                                  value={draftWatermarkSize}
                                  onChange={event =>
                                    handleWatermarkSizeInputChange(event.target.value, 'text')
                                  }
                                  onBlur={() => commitWatermarkSize('text')}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  aria-label="Ukuran watermark teks"
                                />
                              </div>
                            </label>
                            <div className="pdf-watermark-color">
                              <span>Warna</span>
                              <div className="pdf-watermark-color-control">
                                <input
                                  type="color"
                                  value={draftWatermarkColor}
                                  onChange={event => setDraftWatermarkColor(event.target.value)}
                                  aria-label="Pilih warna watermark"
                                />
                                <input
                                  type="text"
                                  value={draftWatermarkColor}
                                  maxLength="7"
                                  readOnly
                                  aria-label="Nilai hex warna watermark"
                                />
                                <button
                                  type="button"
                                  className="pdf-watermark-color-confirm"
                                  onClick={applyWatermarkColor}
                                  disabled={draftWatermarkColor === watermarkSettings.color}
                                >
                                  OK
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="pdf-watermark-grid">
                          <input
                            ref={watermarkImageInputRef}
                            type="file"
                            hidden
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={event => {
                              handleWatermarkImageUpload(event).catch(error => {
                                console.error(error);
                                pushToast(
                                  'Watermark image failed.',
                                  error.message || 'Unable to load watermark image.',
                                  'error'
                                );
                              });
                            }}
                          />
                          <div className="pdf-watermark-inline">
                            <button
                              className="small-button pdf-watermark-upload"
                              onClick={() => watermarkImageInputRef.current?.click()}
                            >
                              <Upload size={16} />
                              {watermarkSettings.imageName ? 'Ganti Gambar' : 'Unggah Gambar'}
                            </button>
                            <label className="pdf-watermark-range">
                              <span>Ukuran</span>
                              <div className="pdf-watermark-size-control">
                                <input
                                  type="range"
                                  min="1"
                                  max="48"
                                  value={watermarkSettings.size}
                                  onChange={event =>
                                    updateWatermarkSize(event.target.value, 'image')
                                  }
                                />
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  min="1"
                                  max="48"
                                  pattern="[0-9]*"
                                  value={draftWatermarkSize}
                                  onChange={event =>
                                    handleWatermarkSizeInputChange(event.target.value, 'image')
                                  }
                                  onBlur={() => commitWatermarkSize('image')}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  aria-label="Ukuran watermark gambar"
                                />
                              </div>
                            </label>
                            <button
                              className="small-button pdf-watermark-clear"
                              onClick={clearWatermarkImage}
                              disabled={!watermarkSettings.imageDataUrl}
                            >
                              Hapus
                            </button>
                          </div>
                          <div className="pdf-watermark-image-name">
                            {watermarkSettings.imageName || 'PNG atau JPG'}
                          </div>
                          {watermarkSettings.imageDataUrl && (
                            <div className="pdf-watermark-preview">
                              <img
                                src={watermarkSettings.imageDataUrl}
                                alt={watermarkSettings.imageName || 'Watermark image'}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div
              className={
                isRangeSplitterEnabled
                  ? 'range-box pdf-range-box expanded'
                  : 'range-box pdf-range-box collapsed'
              }
            >
              <div className="pdf-range-control-line">
                <div className="range-header pdf-range-header">
                  <h3 className="field-value pdf-range-title">
                    <Scissors size={16} />
                    PDF Range Splitter
                  </h3>
                </div>

                <div
                  className="pdf-choice-toggle pdf-range-toggle"
                  role="radiogroup"
                  aria-label="Status range splitter"
                >
                  {[
                    { value: false, label: 'Mati' },
                    { value: true, label: 'Nyala' }
                  ].map(option => (
                    <button
                      key={String(option.value)}
                      type="button"
                      role="radio"
                      aria-checked={isRangeSplitterEnabled === option.value}
                      className={isRangeSplitterEnabled === option.value ? 'active' : ''}
                      onClick={() => handleRangeSplitterEnabledChange(option.value)}
                    >
                      <span className="pdf-range-radio" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {isRangeSplitterEnabled && (
                <>
                  <div className="range-header pdf-range-header">
                    <div className="range-actions">
                      {ranges.length > 0 && (
                        <button
                          className="small-button pdf-clear-button"
                          onClick={() =>
                            requestConfirm({
                              action: 'clear-ranges',
                              tone: 'warning',
                              title: 'Hapus Rentang',
                              message: 'All configured ranges will be removed.',
                              confirmLabel: 'Clear'
                            })
                          }
                        >
                          Hapus Semua
                        </button>
                      )}
                      <button className="small-button pdf-add-range-button" onClick={addRange}>
                        Tambah Rentang
                      </button>
                    </div>
                  </div>

                  <div className="range-list">
                    {ranges.length === 0 ? (
                      <div className="muted">Belum ada rentang ditambahkan.</div>
                    ) : (
                      ranges.map((range, index) => {
                        const safeStart = Math.min(range.start, range.end);
                        const safeEnd = Math.max(range.start, range.end);
                        const count = safeEnd >= safeStart ? safeEnd - safeStart + 1 : 0;

                        return (
                          <div className="range-row pdf-range-row" key={range.id}>
                            <div className="range-index pdf-range-index">#{index + 1}</div>
                            <div className="range-input-wrap">
                              <span>Mulai</span>
                              <input
                                className="range-input pdf-range-input"
                                type="number"
                                min="1"
                                max={pages.length}
                                value={range.start}
                                onChange={event =>
                                  updateRange(range.id, 'start', event.target.value)
                                }
                              />
                            </div>
                            <div className="muted">-</div>
                            <div className="range-input-wrap">
                              <span>Akhir</span>
                              <input
                                className="range-input pdf-range-input"
                                type="number"
                                min="1"
                                max={pages.length}
                                value={range.end}
                                onChange={event => updateRange(range.id, 'end', event.target.value)}
                              />
                            </div>
                            <div className="range-summary">{count} pages</div>
                            <button
                              className="icon-button pdf-remove-range-button"
                              onClick={() => removeRange(range.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="toolbar pdf-range-toolbar">
                    <div className="range-actions">
                      <button
                        className="danger-button pdf-delete-range-button"
                        onClick={deletePagesInRange}
                        disabled={ranges.length === 0}
                      >
                        <Trash2 size={16} />
                        Hapus Halaman Rentang
                      </button>
                    </div>
                    <div className="range-actions">
                      <button
                        className="ghost-button pdf-split-button"
                        onClick={downloadRangesAsZip}
                        disabled={ranges.length === 0}
                      >
                        <Archive size={16} />
                        Split & Unduh ZIP
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="toolbar pdf-toolbar">
              <div className="page-actions">
                <button
                  className="ghost-button pdf-select-button"
                  onClick={() => {
                    const nextSelection = allSelected ? [] : pages.map(page => page.index);
                    setSelectedPages(nextSelection);
                  }}
                >
                  <CheckSquare size={16} />
                  {allSelected ? 'Batal Pilih' : 'Pilih Semua'}
                </button>
                {selectedPages.length > 0 ? (
                  <>
                    <button
                      className="ghost-button pdf-rotate-selected-button"
                      onClick={rotateSelectedPages}
                    >
                      <RotateCw size={16} />
                      Putar ({selectedPages.length})
                    </button>
                    <button
                      className="danger-button pdf-delete-button"
                      onClick={deleteSelectedPages}
                    >
                      <Trash2 size={16} />
                      Hapus ({selectedPages.length})
                    </button>
                    <button
                      className="ghost-button pdf-zip-button"
                      onClick={() =>
                        downloadZip(selectedPages, `${getOutputBaseName()}_Selected.zip`)
                      }
                    >
                      <Archive size={16} />
                      Zip ({selectedPages.length})
                    </button>
                    <button className="primary-button pdf-merge-button" onClick={downloadMergedPdf}>
                      <FilePlus size={16} />
                      Merge Selected (PDF)
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary-button pdf-saveall-button"
                    onClick={() =>
                      downloadZip(
                        pages.map(page => page.index),
                        `${getOutputBaseName()}_Full.zip`
                      )
                    }
                  >
                    <Archive size={16} />
                    Simpan Semua sebagai {exportFormat.toUpperCase()}
                  </button>
                )}
              </div>
              <button
                className="small-button pdf-close-button"
                onClick={() =>
                  requestConfirm({
                    action: 'reset-file',
                    tone: 'warning',
                    title: 'Tutup Dokumen',
                    message: 'The active PDF session will be closed from the workspace.',
                    confirmLabel: 'Tutup'
                  })
                }
              >
                Tutup File
              </button>
            </div>

            <PaginationControls
              totalItems={pages.length}
              pageSize={pageBatchSize}
              currentPage={safeCurrentPageBatch}
              onPageChange={setCurrentPageBatch}
              itemLabel="Pages"
              pageSizeOptions={GRID_PAGE_SIZE_OPTIONS}
              onPageSizeChange={nextSize => {
                setPageBatchSize(nextSize);
                setCurrentPageBatch(1);
              }}
            />

            <section className="page-grid pdf-page-grid">
              {visiblePages.map((page, localIndex) => {
                const visualIndex = visiblePageStartIndex + localIndex;
                return (
                  <PageCard
                    key={page.index}
                    page={page}
                    visualIndex={visualIndex}
                    selected={selectedPages.includes(page.index)}
                    isGrayscale={isGrayscale}
                    exportFormat={exportFormat}
                    watermarkSignature={watermarkSignature}
                    isDragging={draggedPageIndex === page.index}
                    isDropTarget={
                      dropTargetPageIndex === page.index && draggedPageIndex !== page.index
                    }
                    onToggleSelection={togglePageSelection}
                    onRotate={pageIndex => {
                      setPages(prev =>
                        prev.map(item =>
                          item.index === pageIndex
                            ? {
                                ...item,
                                rotationOffset: (item.rotationOffset ?? 0) + 90
                              }
                            : item
                        )
                      );
                      const targetPage = pages.find(item => item.index === pageIndex);
                      const nextRotation = normalizeRotation(
                        (targetPage?.originalRotation ?? 0) + (targetPage?.rotationOffset ?? 0) + 90
                      );
                      setStatus({
                        tone: 'info',
                        title: 'Rotasi halaman diperbarui',
                        detail: `Halaman ${visualIndex + 1} kini diatur ke ${nextRotation}deg.`
                      });
                    }}
                    onPreview={openPagePreview}
                    onCardRef={setPageCardRef}
                    onDownload={pageData => downloadItem(pageData, true)}
                    onEnsurePreview={ensurePreview}
                    onDragStart={handlePageDragStart}
                    onDragOver={handlePageDragOver}
                    onDrop={handlePageDrop}
                    onDragEnd={handlePageDragEnd}
                    canMoveBackward={visualIndex > 0}
                    canMoveForward={visualIndex < pages.length - 1}
                    onMoveBackward={() => movePageByOffset(page.index, -1)}
                    onMoveForward={() => movePageByOffset(page.index, 1)}
                  />
                );
              })}
            </section>
          </section>
        </>
      )}

      <ActionConfirmModal
        open={Boolean(confirmAction)}
        tone={confirmAction?.tone}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
      />

      <PagePreviewModal
        open={previewPageIndex !== null}
        pageLabel={previewPageIndex !== null ? `Page ${previewPageIndex + 1}` : 'Page Preview'}
        imageUrl={previewImageUrl}
        isLoading={isPreviewModalLoading}
        rotation={0}
        canGoPrev={previewPageIndex !== null && previewPageIndex > 0}
        canGoNext={previewPageIndex !== null && previewPageIndex < pages.length - 1}
        onClose={closePagePreview}
        onPrev={() =>
          setPreviewPageIndex(currentIndex =>
            currentIndex !== null && currentIndex > 0 ? currentIndex - 1 : currentIndex
          )
        }
        onNext={() =>
          setPreviewPageIndex(currentIndex =>
            currentIndex !== null && currentIndex < pages.length - 1
              ? currentIndex + 1
              : currentIndex
          )
        }
      />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      {isProcessing && (
        <ProcessingOverlay
          loadingProgress={loadingProgress}
          label={processingState.label}
          detail={processingState.detail}
        />
      )}
    </div>
  );
}
