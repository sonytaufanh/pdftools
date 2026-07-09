let activeDragPreview = null;

function cleanupDragPreview() {
  if (activeDragPreview?.parentNode) {
    activeDragPreview.parentNode.removeChild(activeDragPreview);
  }
  activeDragPreview = null;
}

export function useCardDragImage(event) {
  if (!event.dataTransfer?.setDragImage) return;

  cleanupDragPreview();

  const source = event.currentTarget;
  if (!(source instanceof HTMLElement)) return;

  const rect = source.getBoundingClientRect();
  const previewWidth = Math.min(rect.width, 220);
  const previewHeight = Math.min(rect.height, 176);
  const clone = source.cloneNode(true);
  clone.classList.add('drag-preview-clone');
  clone.classList.remove('dragging', 'drop-target-before', 'drop-target-after');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.width = `${previewWidth}px`;
  clone.style.height = `${previewHeight}px`;
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '-10000px';
  clone.style.margin = '0';
  clone.style.overflow = 'hidden';
  clone.style.pointerEvents = 'none';
  document.body.appendChild(clone);
  activeDragPreview = clone;

  const offsetX = previewWidth / 2;
  const offsetY = Math.min(previewHeight / 2, 78);

  try {
    event.dataTransfer.setDragImage(clone, offsetX, offsetY);
  } catch (error) {
    console.warn('Unable to customize drag preview.', error);
  }

  window.setTimeout(cleanupDragPreview, 0);
}
