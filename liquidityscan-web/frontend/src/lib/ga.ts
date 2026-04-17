/** GA4 measurement ID (Admin → Data streams). Init is in index.html; SPA sends page_view via GaTrackingBridge. */
const GA_MEASUREMENT_ID = 'G-YDLXBB7M7D';

/** SPA route change — send page_view manually */
export function trackPageview(path: string, title?: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const pageTitle = title ?? document.title;
  const pageLocation =
    typeof window.location !== 'undefined' ? `${window.location.origin}${path}` : path;

  window.gtag('event', 'page_view', {
    send_to: GA_MEASUREMENT_ID,
    page_path: path,
    page_title: pageTitle,
    page_location: pageLocation,
  });
}

/** Associate hits with a signed-in user (clear on logout) */
export function setGaUser(userId: string | null | undefined): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (userId) {
    window.gtag('set', { user_id: userId });
  } else {
    window.gtag('set', { user_id: '' });
  }
}
