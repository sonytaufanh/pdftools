import { useEffect } from 'react';

export function useBeforeUnload(active) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;

    const handleBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);
}
