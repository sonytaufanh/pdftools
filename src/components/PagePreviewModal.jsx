import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import ModalOverlay from './ModalOverlay';

const DEFAULT_PREVIEW_FACTOR = 1;
const STAGE_PADDING = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundZoom(value) {
  return Math.round(value * 100) / 100;
}

export default function PagePreviewModal({
  open,
  titleId = 'page-preview-title',
  pageLabel = 'Pratinjau Halaman',
  imageUrl,
  isLoading,
  rotation = 0,
  canGoPrev,
  canGoNext,
  onClose,
  onPrev,
  onNext
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragStateRef = useRef({ startX: 0, startY: 0, originLeft: 0, originTop: 0 });
  const wheelFocusRef = useRef(null);
  const zoomFactorRef = useRef(DEFAULT_PREVIEW_FACTOR);
  const resizeFrameRef = useRef(null);
  const lastCanvasOuterSizeRef = useRef({ width: 0, height: 0 });
  const [fitZoom, setFitZoom] = useState(1);
  const [zoomFactor, setZoomFactor] = useState(DEFAULT_PREVIEW_FACTOR);
  const [imageMetrics, setImageMetrics] = useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const quarterTurn = normalizedRotation % 180 !== 0;
  const displayedImageWidth = quarterTurn ? imageMetrics.height : imageMetrics.width;
  const displayedImageHeight = quarterTurn ? imageMetrics.width : imageMetrics.height;
  const paperBaseUnit = Math.max(1, Math.min(displayedImageWidth, displayedImageHeight));
  const paperBaseWidth = displayedImageWidth / paperBaseUnit;
  const paperBaseHeight = displayedImageHeight / paperBaseUnit;
  const activeZoom = fitZoom * zoomFactor;
  const displayedZoomPercent = Math.round((zoomFactor / DEFAULT_PREVIEW_FACTOR) * 100);
  const paperFrameSize = {
    width: Math.max(1, Math.round(paperBaseWidth * activeZoom)),
    height: Math.max(1, Math.round(paperBaseHeight * activeZoom))
  };
  const assetFrameSize = quarterTurn
    ? { width: paperFrameSize.height, height: paperFrameSize.width }
    : paperFrameSize;
  const stageWidth = Math.max(viewportSize.width, paperFrameSize.width + STAGE_PADDING * 2);
  const stageHeight = Math.max(viewportSize.height, paperFrameSize.height + STAGE_PADDING * 2);

  const getCanvasMetrics = () => {
    const canvasNode = canvasRef.current;
    if (!canvasNode || !canvasNode.clientWidth || !canvasNode.clientHeight) return null;

    const safety = 10;
    return {
      availableWidth: Math.max(1, canvasNode.clientWidth - safety * 2),
      availableHeight: Math.max(1, canvasNode.clientHeight - safety * 2)
    };
  };

  const getPaperOrigin = () => {
    const contentWidth = Math.max(0, stageWidth - STAGE_PADDING * 2);
    const contentHeight = Math.max(0, stageHeight - STAGE_PADDING * 2);

    return {
      left: STAGE_PADDING + Math.max(0, (contentWidth - paperFrameSize.width) / 2),
      top: STAGE_PADDING + Math.max(0, (contentHeight - paperFrameSize.height) / 2)
    };
  };

  const clampFactor = value => clamp(value, DEFAULT_PREVIEW_FACTOR, DEFAULT_PREVIEW_FACTOR * 3);

  const setZoomFocusFromViewportCenter = () => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;

    const paperOrigin = getPaperOrigin();
    const viewportX = 0;
    const viewportY = canvasNode.clientHeight / 2;
    wheelFocusRef.current = {
      type: 'paper',
      ratioX: 0,
      ratioY:
        paperFrameSize.height > 0
          ? clamp(
              (canvasNode.scrollTop + viewportY - paperOrigin.top) / paperFrameSize.height,
              0,
              1
            )
          : 0.5,
      viewportX,
      viewportY
    };
  };

  const zoomOut = () => {
    setZoomFocusFromViewportCenter();
    setZoomFactor(current => clampFactor(roundZoom(current - 0.1)));
  };

  const zoomIn = () => {
    setZoomFocusFromViewportCenter();
    setZoomFactor(current => clampFactor(roundZoom(current + 0.1)));
  };

  const fitToView = () => {
    const imgNode = imgRef.current;
    if (!imgNode?.naturalWidth || !imgNode?.naturalHeight) return;

    const metrics = getCanvasMetrics();
    if (!metrics) return;

    const naturalWidth = imgNode.naturalWidth;
    const naturalHeight = imgNode.naturalHeight;
    const nextDisplayedWidth = quarterTurn ? naturalHeight : naturalWidth;
    const nextDisplayedHeight = quarterTurn ? naturalWidth : naturalHeight;
    const nextPaperBaseUnit = Math.max(1, Math.min(nextDisplayedWidth, nextDisplayedHeight));
    const nextPaperBaseWidth = nextDisplayedWidth / nextPaperBaseUnit;
    const nextPaperBaseHeight = nextDisplayedHeight / nextPaperBaseUnit;
    const availableWidth = Math.max(1, metrics.availableWidth - STAGE_PADDING * 2);
    const availableHeight = Math.max(1, metrics.availableHeight - STAGE_PADDING * 2);
    const nextFit = Math.max(
      0.05,
      roundZoom(
        Math.min(availableWidth / nextPaperBaseWidth, availableHeight / nextPaperBaseHeight)
      )
    );

    setFitZoom(current => (Math.abs(current - nextFit) < 0.01 ? current : nextFit));
    setImageMetrics(current =>
      current.width === naturalWidth && current.height === naturalHeight
        ? current
        : { width: naturalWidth, height: naturalHeight }
    );
    setZoomFactor(current =>
      current === DEFAULT_PREVIEW_FACTOR ? current : DEFAULT_PREVIEW_FACTOR
    );
  };

  useEffect(() => {
    if (open) {
      setZoomFactor(DEFAULT_PREVIEW_FACTOR);
      setImageMetrics({ width: 1, height: 1 });
    }
  }, [open, pageLabel, imageUrl]);

  useEffect(() => {
    zoomFactorRef.current = zoomFactor;
  }, [zoomFactor]);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!open || !canvasNode || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      const bounds = canvasNode.getBoundingClientRect();
      const outerWidth = Math.round(bounds.width);
      const outerHeight = Math.round(bounds.height);
      const previousOuterSize = lastCanvasOuterSizeRef.current;
      const modalSizeChanged =
        Math.abs(previousOuterSize.width - outerWidth) > 2 ||
        Math.abs(previousOuterSize.height - outerHeight) > 2;
      const metrics = getCanvasMetrics();

      if (metrics) {
        setViewportSize(current =>
          current.width === metrics.availableWidth && current.height === metrics.availableHeight
            ? current
            : { width: metrics.availableWidth, height: metrics.availableHeight }
        );
      }

      if (!modalSizeChanged) return;

      lastCanvasOuterSizeRef.current = { width: outerWidth, height: outerHeight };
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (zoomFactorRef.current <= DEFAULT_PREVIEW_FACTOR) {
          fitToView();
        }
      });
    });

    observer.observe(canvasNode);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [open, rotation, pageLabel]);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!open || !canvasNode) return undefined;

    const onWheel = event => {
      event.preventDefault();
      const delta = event.deltaY ?? 0;
      const direction = delta < 0 ? 1 : -1;
      const baseStep = event.ctrlKey ? 0.18 : 0.1;
      const magnitude = event.deltaMode === 1 ? 1 : Math.min(2, Math.abs(delta) / 120);
      const step = baseStep * magnitude * direction;
      const rect = canvasNode.getBoundingClientRect();
      const viewportX = event.clientX - rect.left;
      const viewportY = event.clientY - rect.top;
      const pointerX = viewportX + canvasNode.scrollLeft;
      const pointerY = viewportY + canvasNode.scrollTop;
      const paperOrigin = getPaperOrigin();

      wheelFocusRef.current = {
        type: 'paper',
        ratioX:
          paperFrameSize.width > 0
            ? clamp((pointerX - paperOrigin.left) / paperFrameSize.width, 0, 1)
            : 0.5,
        ratioY:
          paperFrameSize.height > 0
            ? clamp((pointerY - paperOrigin.top) / paperFrameSize.height, 0, 1)
            : 0.5,
        viewportX,
        viewportY
      };
      setZoomFactor(current => clampFactor(roundZoom(current + step)));
    };

    canvasNode.addEventListener('wheel', onWheel, { passive: false });
    return () => canvasNode.removeEventListener('wheel', onWheel);
  }, [open, paperFrameSize.height, paperFrameSize.width, stageHeight, stageWidth]);

  useEffect(() => {
    if (!open || !isDragging) return undefined;

    const handleMouseMove = event => {
      const canvasNode = canvasRef.current;
      if (!canvasNode) return;
      canvasNode.scrollLeft =
        dragStateRef.current.originLeft - (event.clientX - dragStateRef.current.startX);
      canvasNode.scrollTop =
        dragStateRef.current.originTop - (event.clientY - dragStateRef.current.startY);
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [open, isDragging]);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!open || !canvasNode) return;

    const focus = wheelFocusRef.current;
    if (focus) {
      const paperOrigin = getPaperOrigin();
      const nextLeft = paperOrigin.left + paperFrameSize.width * focus.ratioX - focus.viewportX;
      const nextTop = paperOrigin.top + paperFrameSize.height * focus.ratioY - focus.viewportY;
      const maxLeft = Math.max(0, stageWidth - canvasNode.clientWidth);
      const maxTop = Math.max(0, stageHeight - canvasNode.clientHeight);

      canvasNode.scrollLeft = clamp(nextLeft, 0, maxLeft);
      canvasNode.scrollTop = clamp(nextTop, 0, maxTop);
      wheelFocusRef.current = null;
      return;
    }

    if (zoomFactor <= DEFAULT_PREVIEW_FACTOR) {
      canvasNode.scrollLeft = Math.max(0, (stageWidth - canvasNode.clientWidth) / 2);
      canvasNode.scrollTop = Math.max(0, (stageHeight - canvasNode.clientHeight) / 2);
      return;
    }

    const maxLeft = Math.max(0, stageWidth - canvasNode.clientWidth);
    const maxTop = Math.max(0, stageHeight - canvasNode.clientHeight);
    canvasNode.scrollLeft = clamp(canvasNode.scrollLeft, 0, maxLeft);
    canvasNode.scrollTop = clamp(canvasNode.scrollTop, 0, maxTop);
  }, [open, paperFrameSize.height, paperFrameSize.width, stageHeight, stageWidth, zoomFactor]);

  useEffect(() => {
    if (!open || !imageUrl || isLoading) return;

    const imgNode = imgRef.current;
    const run = () =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => fitToView()));

    if (!imgNode) {
      run();
      return;
    }

    if (imgNode.complete && (imgNode.naturalWidth || 0) > 0 && (imgNode.naturalHeight || 0) > 0) {
      run();
      return;
    }

    if (typeof imgNode.decode === 'function') {
      imgNode.decode().then(run).catch(run);
      return;
    }

    run();
  }, [open, imageUrl, isLoading, rotation, pageLabel]);

  if (!open) return null;

  const paperPosition = getPaperOrigin();

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      className="confirm-overlay page-preview-overlay"
      labelledBy={titleId}
    >
      <div className="confirm-modal page-preview-modal">
        <div className="page-preview-modal-header">
          <div>
            <div className="confirm-kicker">Pratinjau Halaman</div>
            <h2 id={titleId} className="confirm-title">
              {pageLabel}
            </h2>
          </div>
          <div className="page-preview-modal-actions">
            <div className="page-preview-toolbar" role="group" aria-label="Kontrol zoom">
              <button
                type="button"
                className="toast-close page-preview-tool"
                onClick={zoomOut}
                aria-label="Perkecil"
                title="Perkecil"
                disabled={zoomFactor <= DEFAULT_PREVIEW_FACTOR}
              >
                <ZoomOut size={16} />
              </button>
              <div
                className="page-preview-zoom-label"
                aria-label={`Zoom ${displayedZoomPercent} persen`}
              >
                {displayedZoomPercent}%
              </div>
              <button
                type="button"
                className="toast-close page-preview-tool"
                onClick={zoomIn}
                aria-label="Perbesar"
                title="Perbesar"
                disabled={zoomFactor >= DEFAULT_PREVIEW_FACTOR * 3}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                className="toast-close page-preview-tool"
                onClick={fitToView}
                aria-label="Sesuaikan layar"
                title="Sesuaikan layar"
              >
                <Maximize2 size={16} />
              </button>
            </div>
            <button
              type="button"
              className="toast-close page-preview-close"
              onClick={onClose}
              aria-label="Tutup pratinjau"
              title="Tutup pratinjau"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="page-preview-modal-body">
          <div
            className={[
              'page-preview-modal-canvas',
              zoomFactor > DEFAULT_PREVIEW_FACTOR ? 'is-draggable' : '',
              isDragging ? 'is-dragging' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            ref={canvasRef}
            onMouseDown={event => {
              if (zoomFactor <= DEFAULT_PREVIEW_FACTOR) return;
              event.preventDefault();
              dragStateRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                originLeft: canvasRef.current?.scrollLeft ?? 0,
                originTop: canvasRef.current?.scrollTop ?? 0
              };
              setIsDragging(true);
            }}
          >
            {isLoading ? (
              <div className="page-preview-modal-placeholder">
                <div className="preview-skeleton loading" />
                <span>Merender pratinjau halaman...</span>
              </div>
            ) : imageUrl ? (
              <div
                className="page-preview-stage"
                style={{
                  width: `${stageWidth}px`,
                  height: `${stageHeight}px`
                }}
              >
                <div
                  className="page-preview-page"
                  style={{
                    left: `${paperPosition.left}px`,
                    top: `${paperPosition.top}px`,
                    width: `${paperFrameSize.width}px`,
                    height: `${paperFrameSize.height}px`
                  }}
                >
                  <div
                    className="page-preview-asset"
                    style={{
                      width: `${assetFrameSize.width}px`,
                      height: `${assetFrameSize.height}px`,
                      transform: `rotate(${normalizedRotation}deg)`
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={imageUrl}
                      alt={pageLabel}
                      draggable={false}
                      onLoad={fitToView}
                      style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%'
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="page-preview-modal-placeholder">
                <span>Pratinjau tidak tersedia untuk halaman ini.</span>
              </div>
            )}
          </div>
        </div>
        <div className="page-preview-modal-footer">
          <button
            type="button"
            className="confirm-button secondary"
            onClick={onPrev}
            disabled={!canGoPrev}
          >
            <ChevronLeft size={16} />
            Sebelumnya
          </button>
          <button type="button" className="confirm-button secondary" onClick={onClose}>
            Tutup
          </button>
          <button
            type="button"
            className="confirm-button primary"
            onClick={onNext}
            disabled={!canGoNext}
          >
            Berikutnya
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
