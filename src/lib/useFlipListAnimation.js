import { useCallback, useLayoutEffect, useRef } from 'react';

export function useFlipListAnimation(items, getItemId, {
  duration = 420,
  easing = 'cubic-bezier(0.2, 0, 0, 1)'
} = {}) {
  const itemRefs = useRef(new Map());
  const previousRectsRef = useRef(new Map());

  const setItemRef = useCallback((id, element) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);

  const rememberPositions = useCallback(() => {
    const nextRects = new Map();
    itemRefs.current.forEach((element, id) => {
      nextRects.set(id, element.getBoundingClientRect());
    });
    previousRectsRef.current = nextRects;
  }, []);

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current;
    if (!previousRects.size) return undefined;

    const animations = [];
    for (const item of items) {
      const id = getItemId(item);
      const element = itemRefs.current.get(id);
      const previousRect = previousRects.get(id);
      if (!element || !previousRect) continue;

      const nextRect = element.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

      element.classList.add('is-reordering');
      const animation = element.animate([
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' }
      ], {
        duration,
        easing
      });
      const cleanup = () => element.classList.remove('is-reordering');
      animation.addEventListener('finish', cleanup, { once: true });
      animation.addEventListener('cancel', cleanup, { once: true });
      animations.push(animation);
    }

    previousRectsRef.current = new Map();
    return () => animations.forEach(animation => animation.cancel());
  }, [duration, easing, getItemId, items]);

  return { setItemRef, rememberPositions };
}
