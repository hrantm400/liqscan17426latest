/** Microsoft Clarity project id (dashboard: https://clarity.microsoft.com) */
export const CLARITY_PROJECT_ID = 'wclt1ijurq';

/**
 * Injects the Clarity bootstrap script (prod only — call from main.tsx when import.meta.env.PROD).
 * Matches the official snippet: queues calls until the tag script loads.
 */
export function initMicrosoftClarity(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const w = window as Window & { clarity?: (...args: unknown[]) => void };
  if (document.querySelector(`script[src*="clarity.ms/tag/${CLARITY_PROJECT_ID}"]`)) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (function (c: any, l: Document, a: string, r: string, i: string) {
    c[a] =
      c[a] ||
      function (...args: unknown[]) {
        (c[a].q = c[a].q || []).push(args);
      };
    const t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = 'https://www.clarity.ms/tag/' + i;
    const y = l.getElementsByTagName(r)[0];
    y?.parentNode?.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
}
