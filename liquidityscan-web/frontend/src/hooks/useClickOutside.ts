import { useEffect, RefObject, useRef } from 'react';

/**
 * Invokes callback when user clicks/taps outside the given element (e.g. close dropdown).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  const cb = useRef(onOutside);
  cb.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      cb.current();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [enabled, ref]);
}
