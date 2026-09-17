import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function useDialogA11y(open, containerRef, onClose) {
  const onCloseRef = useRef(onClose);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const node = containerRef.current;
    restoreFocusRef.current = document.activeElement;

    const getFocusable = () => {
      if (!node) return [];
      return Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        element => element.getClientRects().length > 0
      );
    };

    const focusFrame = window.requestAnimationFrame(() => {
      const focusable = getFocusable();
      (focusable[0] ?? node)?.focus?.();
    });

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !node?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      const restoreTarget = restoreFocusRef.current;
      if (
        restoreTarget &&
        typeof restoreTarget.focus === 'function' &&
        document.contains(restoreTarget)
      ) {
        restoreTarget.focus();
      }
    };
  }, [containerRef, open]);
}
