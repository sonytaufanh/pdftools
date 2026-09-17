import { useRef } from 'react';
import { useDialogA11y } from '../lib/useDialogA11y';

export default function ModalOverlay({
  open,
  onClose,
  className = 'confirm-overlay',
  labelledBy,
  describedBy,
  children
}) {
  const containerRef = useRef(null);
  useDialogA11y(open, containerRef, onClose);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
